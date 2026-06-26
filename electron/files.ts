import fs from 'node:fs'
import path from 'node:path'
import { shell } from 'electron'
import type { FileNode } from '@shared/types'

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
    .filter((e) => !IGNORED.has(e.name))
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
