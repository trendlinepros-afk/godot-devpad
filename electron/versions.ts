import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { GodotVersion, GodotVersionsFile } from '@shared/types'

// Godot version manager (main process).
//
// On startup we load the bundled godot-versions.json, then silently fetch the
// remote update URL. Any NEW version entries or a higher schemaVersion are
// merged in. Existing versions are never removed — only additions are applied.
// The merged result is cached in userData so additions persist across restarts.

let cache: GodotVersionsFile | null = null

function bundledPath(): string {
  // Packaged: extraResources puts the file next to the app in resourcesPath.
  // Dev: it sits at the project root (one level above dist-electron).
  const candidates = [
    path.join(process.resourcesPath ?? '', 'godot-versions.json'),
    path.join(app.getAppPath(), 'godot-versions.json'),
    path.join(app.getAppPath(), '..', 'godot-versions.json'),
  ]
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c
  }
  return candidates[candidates.length - 1]
}

function userDataPath(): string {
  return path.join(app.getPath('userData'), 'godot-versions.json')
}

function readJson(p: string): GodotVersionsFile | null {
  try {
    if (!fs.existsSync(p)) return null
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as GodotVersionsFile
  } catch (err) {
    console.error('[versions] failed to read', p, err)
    return null
  }
}

function isValid(file: unknown): file is GodotVersionsFile {
  return (
    !!file &&
    typeof file === 'object' &&
    Array.isArray((file as GodotVersionsFile).versions)
  )
}

/** Load the merged registry, preferring the persisted userData copy. */
export function loadVersions(): GodotVersionsFile {
  if (cache) return cache
  const persisted = readJson(userDataPath())
  const bundled = readJson(bundledPath())
  const base = (isValid(persisted) ? persisted : bundled) ?? {
    schemaVersion: 1,
    remoteUpdateUrl: '',
    versions: [],
  }
  // Make sure any brand-new bundled versions (after an app update) are merged
  // into a previously persisted copy too.
  if (isValid(persisted) && isValid(bundled)) {
    cache = mergeInto(persisted, bundled).file
  } else {
    cache = base
  }
  return cache
}

interface MergeOutcome {
  file: GodotVersionsFile
  added: string[]
}

/** Merge `incoming` versions into `current`, only ADDING new ids. */
function mergeInto(current: GodotVersionsFile, incoming: GodotVersionsFile): MergeOutcome {
  const known = new Set(current.versions.map((v) => v.id))
  const added: string[] = []
  const versions: GodotVersion[] = [...current.versions]
  for (const v of incoming.versions ?? []) {
    if (v && v.id && !known.has(v.id)) {
      known.add(v.id)
      versions.push(v)
      added.push(v.id)
    }
  }
  const file: GodotVersionsFile = {
    schemaVersion: Math.max(current.schemaVersion ?? 1, incoming.schemaVersion ?? 1),
    remoteUpdateUrl: current.remoteUpdateUrl || incoming.remoteUpdateUrl || '',
    versions,
  }
  return { file, added }
}

function persist(file: GodotVersionsFile): void {
  try {
    fs.writeFileSync(userDataPath(), JSON.stringify(file, null, 2), 'utf-8')
  } catch (err) {
    console.error('[versions] failed to persist', err)
  }
}

/**
 * Fetch the remote update URL and merge any new versions. Returns the list of
 * newly-added version ids (empty when nothing changed or the fetch failed).
 * Fails silently — a missing network must never block startup.
 */
export async function checkForUpdates(): Promise<MergeOutcome> {
  const current = loadVersions()
  const url = current.remoteUpdateUrl
  if (!url || url.includes('YOUR_GITHUB')) {
    // Placeholder URL — nothing to fetch.
    return { file: current, added: [] }
  }
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) return { file: current, added: [] }
    const remote = (await res.json()) as GodotVersionsFile
    if (!isValid(remote)) return { file: current, added: [] }
    const outcome = mergeInto(current, remote)
    if (outcome.added.length > 0) {
      cache = outcome.file
      persist(outcome.file)
    }
    return outcome
  } catch (err) {
    console.warn('[versions] remote update check failed (ignored):', err)
    return { file: current, added: [] }
  }
}

export function findVersionById(id: string): GodotVersion | undefined {
  return loadVersions().versions.find((v) => v.id === id)
}

/** Auto-detect a version id from an executable filename via executableHint. */
export function detectVersion(executablePath: string): string | null {
  if (!executablePath) return null
  const base = path.basename(executablePath).toLowerCase()
  for (const v of loadVersions().versions) {
    if (v.executableHint && base.includes(v.executableHint.toLowerCase())) {
      return v.id
    }
  }
  return null
}
