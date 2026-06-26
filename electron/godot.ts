import { spawn, ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import type { GodotStatus } from '@shared/types'
import { getConfig } from './store'
import { findVersionById, detectVersion } from './versions'

// Godot launcher (main process). DevPad launches Godot as an EXTERNAL process in
// its own window — it never embeds the Godot window. We track the single child
// process and broadcast state transitions so the toolbar buttons stay in sync.

let child: ChildProcess | null = null
let state: GodotStatus['state'] = 'stopped'
let detectedVersionId: string | null = null
let onChange: ((s: GodotStatus) => void) | null = null

export function onStatusChange(cb: (s: GodotStatus) => void): void {
  onChange = cb
}

export function getStatus(): GodotStatus {
  return {
    state,
    pid: child?.pid,
    detectedVersionId,
  }
}

function emit(message?: string): void {
  onChange?.({ ...getStatus(), message })
}

function setState(next: GodotStatus['state'], message?: string): void {
  state = next
  emit(message)
}

export class GodotLaunchError extends Error {}

/**
 * Launch Godot with the configured executable and project directory.
 * Throws GodotLaunchError with a user-facing message when misconfigured or the
 * binary cannot be found (handled gracefully by the caller).
 */
export function runGodot(): GodotStatus {
  if (child) {
    // Already running — no-op, return current status.
    return getStatus()
  }

  const cfg = getConfig()
  const exe = cfg.godotExecutablePath
  const projectDir = cfg.projectDir

  if (!exe) {
    throw new GodotLaunchError('No Godot executable configured. Set it in Settings → Godot.')
  }
  if (!fs.existsSync(exe)) {
    throw new GodotLaunchError(`Godot executable not found at:\n${exe}\nCheck Settings → Godot.`)
  }
  if (!projectDir) {
    throw new GodotLaunchError('No project folder configured. Set it in Settings → Godot.')
  }
  if (!fs.existsSync(projectDir)) {
    throw new GodotLaunchError(`Project folder not found at:\n${projectDir}\nCheck Settings → Godot.`)
  }

  // Auto-detect the version from the executable name and remember it.
  detectedVersionId = detectVersion(exe) ?? cfg.activeVersionId ?? null

  // Build launch flags from the active version, substituting {projectDir}.
  const version = findVersionById(cfg.activeVersionId)
  const flagTemplate = version?.launchFlags ?? ['--path', '{projectDir}']
  const args = flagTemplate.map((f) => f.replace('{projectDir}', projectDir))

  setState('starting')
  try {
    child = spawn(exe, args, {
      // Detached false: keep Godot tied to DevPad's lifetime is undesirable on
      // Windows; we keep it attached but do not pipe stdio to avoid backpressure.
      stdio: 'ignore',
      windowsHide: false,
    })
  } catch (err) {
    child = null
    setState('stopped')
    throw new GodotLaunchError(
      `Failed to launch Godot: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  child.on('spawn', () => setState('running'))
  child.on('error', (err) => {
    child = null
    setState('stopped', `Godot process error: ${err.message}`)
  })
  child.on('exit', (code) => {
    child = null
    setState('stopped', code === 0 ? undefined : `Godot exited with code ${code}`)
  })

  // child.on('spawn') sets running; return optimistic status meanwhile.
  return getStatus()
}

/** Kill the running Godot process. Safe to call when nothing is running. */
export function stopGodot(): GodotStatus {
  if (child) {
    const proc = child
    child = null
    try {
      // SIGKILL on the (potentially detached) process tree. On Windows, kill()
      // terminates the process; child processes are typically the editor itself.
      proc.kill('SIGKILL')
    } catch (err) {
      console.error('[godot] failed to kill process', err)
    }
  }
  setState('stopped')
  return getStatus()
}

/** Stop Godot (if running) then immediately relaunch. */
export function restartGodot(): GodotStatus {
  stopGodot()
  return runGodot()
}
