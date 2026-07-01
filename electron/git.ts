import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { GitCheckpoint } from '@shared/types'
import { getConfig } from './store'

// Git-based safety net for agentic edits. Before the AI writes a file we take a
// snapshot so any change is one click away from undo.
//
// Crucially, checkpoints do NOT touch the user's branch, HEAD, or staging area:
// we stage into a TEMPORARY index file and record each snapshot as a commit
// object on a dedicated ref (refs/zirtola/checkpoints). The user's own git
// workflow is left completely undisturbed.

const pexec = promisify(execFile)
const REF = 'refs/zirtola/checkpoints'

const IDENT: Record<string, string> = {
  GIT_AUTHOR_NAME: 'Zirtola',
  GIT_AUTHOR_EMAIL: 'checkpoints@zirtola.local',
  GIT_COMMITTER_NAME: 'Zirtola',
  GIT_COMMITTER_EMAIL: 'checkpoints@zirtola.local',
}

async function git(cwd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string> {
  const { stdout } = await pexec('git', args, {
    cwd,
    env: env ?? process.env,
    maxBuffer: 64 * 1024 * 1024,
  })
  return stdout.toString().trim()
}

function projectDir(): string {
  return getConfig().projectDir
}

export async function isRepo(): Promise<boolean> {
  const dir = projectDir()
  if (!dir || !fs.existsSync(dir)) return false
  try {
    return (await git(dir, ['rev-parse', '--is-inside-work-tree'])) === 'true'
  } catch {
    return false
  }
}

async function ensureRepo(dir: string): Promise<void> {
  if (!(await isRepo())) {
    await git(dir, ['init'])
  }
}

/**
 * Snapshot the current working tree onto the dedicated checkpoint ref.
 * Returns the new commit hash.
 */
export async function checkpoint(
  message: string,
): Promise<{ ok: boolean; hash?: string; error?: string }> {
  const dir = projectDir()
  if (!dir || !fs.existsSync(dir)) return { ok: false, error: 'No project folder set.' }
  const tmpIndex = path.join(os.tmpdir(), `zirtola-index-${Date.now()}-${process.pid}`)
  try {
    await ensureRepo(dir)
    const env = { ...process.env, ...IDENT, GIT_INDEX_FILE: tmpIndex }
    // Stage everything into the temp index, excluding Godot's heavy caches so
    // snapshots stay fast even when the project has no .gitignore.
    await git(dir, ['add', '-A', '--', '.', ':(exclude).godot', ':(exclude).import'], env)
    const tree = await git(dir, ['write-tree'], env)
    let parent: string | null = null
    try {
      parent = await git(dir, ['rev-parse', '--verify', REF])
    } catch {
      parent = null
    }
    const args = ['commit-tree', tree, '-m', message]
    if (parent) args.push('-p', parent)
    const hash = await git(dir, args, env)
    await git(dir, ['update-ref', REF, hash])
    return { ok: true, hash }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    try {
      fs.unlinkSync(tmpIndex)
    } catch {
      /* ignore */
    }
  }
}

export async function listCheckpoints(): Promise<GitCheckpoint[]> {
  const dir = projectDir()
  if (!dir || !fs.existsSync(dir)) return []
  try {
    const out = await git(dir, ['log', REF, '--format=%H%x1f%ct%x1f%s'])
    if (!out) return []
    return out.split('\n').map((line) => {
      const [hash, ct, ...rest] = line.split('\x1f')
      return { hash, ts: Number(ct) * 1000, message: rest.join('\x1f') }
    })
  } catch {
    return []
  }
}

/**
 * Restore tracked files from a checkpoint into the working tree. We first take a
 * fresh checkpoint so the restore itself is undoable. Files created AFTER the
 * checkpoint are left in place (not deleted).
 */
export async function restoreCheckpoint(
  hash: string,
): Promise<{ ok: boolean; error?: string }> {
  const dir = projectDir()
  if (!dir || !fs.existsSync(dir)) return { ok: false, error: 'No project folder set.' }
  // The hash comes over IPC — accept only a real commit hash, not refs/branch
  // names/option-like strings that would restore from an unintended source.
  if (!/^[0-9a-f]{7,40}$/i.test(hash)) {
    return { ok: false, error: 'Invalid checkpoint reference.' }
  }
  try {
    await checkpoint('Before restore')
    // Restore the checkpoint's tree into the WORKING TREE only — `checkout
    // <hash> -- .` would also write every file into the user's staging area,
    // breaking the "we never touch your git state" contract above.
    await git(dir, ['restore', '--source', hash, '--worktree', '--', '.'])
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
