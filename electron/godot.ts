import { spawn, ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import type { GodotStatus, GodotLogEntry, LogLevel } from '@shared/types'
import { getConfig } from './store'
import { findVersionById, detectVersion } from './versions'

// Godot launcher (main process). DevPad launches Godot as an EXTERNAL process in
// its own window — it never embeds the Godot window. We track the single child
// process and broadcast state transitions so the toolbar buttons stay in sync.

let child: ChildProcess | null = null
let state: GodotStatus['state'] = 'stopped'
let detectedVersionId: string | null = null
let onChange: ((s: GodotStatus) => void) | null = null

// ── Output capture ────────────────────────────────────────────────────────────
// Previously we spawned Godot with stdio:'ignore' and threw away every error.
// Now we pipe stdout/stderr, parse GDScript errors, keep a ring buffer, and
// stream entries to the renderer so DevPad can show a console + offer one-click
// fixes for runtime errors.

const MAX_LOGS = 800
const logs: GodotLogEntry[] = []
let logCounter = 0
let onLog: ((entry: GodotLogEntry) => void) | null = null
let stdoutTail = ''
let stderrTail = ''

export function onLogEntry(cb: (entry: GodotLogEntry) => void): void {
  onLog = cb
}

export function getLogs(): GodotLogEntry[] {
  return logs
}

export function clearLogs(): void {
  logs.length = 0
}

// Matches a res:// path with an optional :line suffix in a GDScript message.
const RES_RE = /(res:\/\/[^\s():'"]+\.(?:gd|cs|gdshader|tscn|tres))(?::(\d+))?/

function classify(text: string): LogLevel {
  const t = text.toUpperCase()
  if (t.includes('SCRIPT ERROR') || t.includes('ERROR:') || t.startsWith('ERROR')) return 'error'
  if (t.includes('WARNING') || t.includes('WARN:')) return 'warn'
  return 'info'
}

function pushLog(rawLine: string, forced?: LogLevel): void {
  const text = rawLine.replace(/\r$/, '')
  if (!text.trim()) return
  const level = forced ?? classify(text)
  const match = RES_RE.exec(text)
  const entry: GodotLogEntry = {
    id: ++logCounter,
    level,
    text,
    file: match?.[1],
    line: match?.[2] ? Number(match[2]) : undefined,
    ts: Date.now(),
  }
  logs.push(entry)
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS)
  onLog?.(entry)
}

// Split a streamed chunk into complete lines, carrying the remainder over.
function consume(chunk: Buffer, which: 'out' | 'err'): void {
  const buffered = (which === 'out' ? stdoutTail : stderrTail) + chunk.toString('utf-8')
  const parts = buffered.split('\n')
  const remainder = parts.pop() ?? ''
  if (which === 'out') stdoutTail = remainder
  else stderrTail = remainder
  for (const line of parts) pushLog(line, which === 'err' ? undefined : undefined)
}

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

/** PID of the running Godot process, or null. Used by the Windows embedder. */
export function getPid(): number | null {
  return child?.pid ?? null
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
      // Pipe stdio so we can capture print()/errors for the in-app console.
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false,
    })
  } catch (err) {
    child = null
    setState('stopped')
    throw new GodotLaunchError(
      `Failed to launch Godot: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  pushLog(`▶ Launching ${exe} ${args.join(' ')}`, 'info')
  child.stdout?.on('data', (chunk: Buffer) => consume(chunk, 'out'))
  child.stderr?.on('data', (chunk: Buffer) => consume(chunk, 'err'))

  child.on('spawn', () => setState('running'))
  child.on('error', (err) => {
    child = null
    pushLog(`Godot process error: ${err.message}`, 'error')
    setState('stopped', `Godot process error: ${err.message}`)
  })
  child.on('exit', (code) => {
    child = null
    // Flush any partial trailing lines.
    if (stdoutTail.trim()) pushLog(stdoutTail)
    if (stderrTail.trim()) pushLog(stderrTail)
    stdoutTail = ''
    stderrTail = ''
    pushLog(`■ Godot exited (code ${code ?? 0})`, code === 0 ? 'info' : 'error')
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
