import fs from 'node:fs'
import path from 'node:path'
import { shell } from 'electron'
import type { FileNode, FileEdit, ApplyEditResult } from '@shared/types'
import { getConfig } from './store'
import { checkpoint } from './git'

// File browser backend (main process). The tree is read lazily: list(dir)
// returns the directory's immediate children, and each child directory is
// returned WITHOUT its own children so the renderer can expand on demand.

const IGNORED = new Set(['.git', '.import', '.godot', 'node_modules'])

function toNode(fullPath: string, shallow: boolean): FileNode {
  let isDir = false
  try {
    isDir = fs.statSync(fullPath).isDirectory()
  } catch {
    isDir = false
  }
  const name = path.basename(fullPath)
  const ext = isDir ? '' : path.extname(fullPath).replace(/^\./, '').toLowerCase()
  const node: FileNode = { name, path: fullPath, isDir, ext }
  if (isDir && !shallow) {
    node.children = listChildren(fullPath)
  }
  return node
}

function listChildren(dir: string): FileNode[] {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch (err) {
    console.error('[files] failed to read dir', dir, err)
    return []
  }
  const nodes = entries
    .filter((e) => !IGNORED.has(e.name) && !e.name.endsWith('.tmp'))
    .map((e) => toNode(path.join(dir, e.name), true))

  // Folders first, then files, both alphabetical (case-insensitive).
  nodes.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
  return nodes
}

/** Return a FileNode for `dir` with its immediate children populated. */
export function listDir(dir: string): FileNode | null {
  if (!dir || !fs.existsSync(dir)) return null
  try {
    const stat = fs.statSync(dir)
    if (!stat.isDirectory()) return null
  } catch {
    return null
  }
  const node = toNode(dir, true)
  node.children = listChildren(dir)
  return node
}

/**
 * A compact recursive listing of the project's files as res:// paths, capped so
 * it stays cheap to include in the AI system prompt. Lets the AI understand the
 * project layout without interrogating the user file-by-file.
 */
export function projectFileMap(projectDir: string, cap = 400): string[] {
  if (!projectDir || !fs.existsSync(projectDir)) return []
  const out: string[] = []
  const walk = (dir: string) => {
    if (out.length >= cap) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    // Folders first then files, alphabetical, for a stable readable map.
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const e of entries) {
      if (out.length >= cap) return
      if (IGNORED.has(e.name) || e.name.endsWith('.tmp')) continue
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        walk(full)
      } else {
        const rel = path.relative(projectDir, full).split(path.sep).join('/')
        out.push(`res://${rel}`)
      }
    }
  }
  walk(projectDir)
  return out
}

export interface ReadResult {
  ok: boolean
  contents?: string
  error?: string
}

/** Read a UTF-8 text file. Guards against absurdly large files. */
export function readFileText(filePath: string): ReadResult {
  try {
    if (!fs.existsSync(filePath)) return { ok: false, error: 'File not found.' }
    const stat = fs.statSync(filePath)
    if (stat.isDirectory()) return { ok: false, error: 'Path is a directory.' }
    if (stat.size > 2 * 1024 * 1024) {
      return { ok: false, error: 'File is too large to read (>2 MB).' }
    }
    return { ok: true, contents: fs.readFileSync(filePath, 'utf-8') }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Open a file in the OS default editor/application. */
export async function openExternal(filePath: string): Promise<void> {
  await shell.openPath(filePath)
}

/**
 * Resolve a res:// or project-relative path to an absolute path INSIDE the
 * project folder. Returns null if the result escapes the project (guards both
 * reads and writes against path traversal).
 */
export function resolveProjectPath(p: string): string | null {
  const dir = getConfig().projectDir
  if (!dir) return null
  let rel = p.trim()
  if (rel.startsWith('res://')) rel = rel.slice('res://'.length)
  const abs = path.resolve(path.isAbsolute(rel) ? rel : path.join(dir, rel))
  const root = path.resolve(dir)
  if (abs !== root && !abs.startsWith(root + path.sep)) return null
  // Lexical check passed — also resolve symlinks, or a link inside the project
  // pointing elsewhere would let reads/writes escape the folder.
  const realRoot = tryRealpath(root) ?? root
  const realBase = realpathOfExistingAncestor(abs)
  if (realBase && realBase !== realRoot && !realBase.startsWith(realRoot + path.sep)) return null
  return abs
}

function tryRealpath(p: string): string | null {
  try {
    return fs.realpathSync(p)
  } catch {
    return null
  }
}

/** Real path of `p`, or of its deepest existing ancestor (targets of writes may not exist yet). */
function realpathOfExistingAncestor(p: string): string | null {
  let cur = p
  for (;;) {
    const real = tryRealpath(cur)
    if (real) return real
    const parent = path.dirname(cur)
    if (parent === cur) return null
    cur = parent
  }
}

/** For reads: resolve res:// within the project, else use the path as given. */
export function toReadablePath(p: string): string {
  if (p.startsWith('res://') || !path.isAbsolute(p)) return resolveProjectPath(p) ?? p
  return p
}

/**
 * Apply an AI-proposed file edit: take a safety checkpoint (if enabled), then
 * write the full file contents. Confined to the project folder.
 */
export async function applyEdit(edit: FileEdit): Promise<ApplyEditResult> {
  const abs = resolveProjectPath(edit.path)
  if (!abs) return { ok: false, error: 'That path is outside the project folder.' }
  try {
    let checkpointHash: string | undefined
    if (getConfig().checkpointsEnabled) {
      const rel = path.relative(getConfig().projectDir, abs)
      const cp = await checkpoint(`Before edit: ${rel}`)
      if (cp.ok) checkpointHash = cp.hash
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    // Atomic write: a crash/disk-full mid-write must not leave a truncated
    // file that Godot could immediately hot-reload. (.tmp files are already
    // filtered from listings above.)
    const tmp = `${abs}.tmp`
    fs.writeFileSync(tmp, edit.contents, 'utf-8')
    fs.renameSync(tmp, abs)
    return { ok: true, path: abs, checkpoint: checkpointHash }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Does the folder already contain a project.godot? */
export function hasProjectFile(dir: string): boolean {
  try {
    return fs.existsSync(path.join(dir, 'project.godot'))
  } catch {
    return false
  }
}

export function validateProject(dir: string): { ok: boolean; hasProjectFile: boolean } {
  const ok = !!dir && fs.existsSync(dir)
  return { ok, hasProjectFile: ok && hasProjectFile(dir) }
}

/**
 * Prepare a folder for use as a new Godot project: if it has no project.godot,
 * write a minimal Godot 4 one (named after the folder). Existing projects are
 * left untouched.
 */
export function createNewProject(dir: string): { ok: boolean; error?: string } {
  try {
    if (!dir) return { ok: false, error: 'No folder selected.' }
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    if (!hasProjectFile(dir)) {
      const name = path.basename(dir)
      const contents = `; Engine configuration file.
; Generated by DevPad for a new project.
config_version=5

[application]

config/name="${name}"
config/features=PackedStringArray("4.3")
`
      fs.writeFileSync(path.join(dir, 'project.godot'), contents, 'utf-8')
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
