import { app, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import AdmZip from 'adm-zip'
import type { DetectedGodot, GodotDownloadProgress } from '@shared/types'

// Godot install assistant (main process). For a user who has never used Godot —
// or never coded — DevPad detects an existing Godot, and if there isn't one it
// downloads the official build and extracts it, then hands back the executable
// path so onboarding can connect it automatically.

function parseVersion(name: string): string | undefined {
  const m = /v?(\d+\.\d+(?:\.\d+)?)/.exec(name)
  return m ? `v${m[1]}` : undefined
}

function looksLikeGodot(fileName: string): boolean {
  const n = fileName.toLowerCase()
  return (
    (n.startsWith('godot') || n.includes('godot_v')) &&
    !n.endsWith('.zip') &&
    !n.endsWith('.txt') &&
    !n.endsWith('.tres')
  )
}

// ── Detection ─────────────────────────────────────────────────────────────────

function candidateDirs(): string[] {
  const dirs: string[] = []
  const home = app.getPath('home')
  const downloads = safePath('downloads')
  if (downloads) dirs.push(downloads)
  dirs.push(app.getPath('desktop'))

  if (process.platform === 'win32') {
    const pf = process.env['ProgramFiles'] ?? 'C:\\Program Files'
    const pf86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
    dirs.push(
      path.join(pf86, 'Steam', 'steamapps', 'common', 'Godot Engine'),
      path.join(pf, 'Godot'),
      path.join(home, 'AppData', 'Local', 'Programs', 'Godot'),
    )
  } else if (process.platform === 'darwin') {
    dirs.push('/Applications', path.join(home, 'Applications'))
  } else {
    dirs.push('/usr/bin', '/usr/local/bin', path.join(home, '.local', 'bin'))
  }
  // DevPad's own managed install location.
  dirs.push(managedDir())
  return dirs.filter((d) => d && fs.existsSync(d))
}

function safePath(name: 'downloads'): string | null {
  try {
    return app.getPath(name)
  } catch {
    return null
  }
}

function macAppBinary(appPath: string): string | null {
  const bin = path.join(appPath, 'Contents', 'MacOS', 'Godot')
  return fs.existsSync(bin) ? bin : null
}

export function detectGodot(): DetectedGodot[] {
  const found: DetectedGodot[] = []
  const seen = new Set<string>()

  const add = (p: string, source: string) => {
    if (!p || seen.has(p) || !fs.existsSync(p)) return
    seen.add(p)
    found.push({ path: p, version: parseVersion(path.basename(p)), source })
  }

  // 1) PATH lookups.
  const pathEnv = process.env.PATH ?? ''
  const names =
    process.platform === 'win32'
      ? ['godot.exe', 'Godot.exe', 'godot_v4.exe']
      : ['godot', 'godot4', 'Godot']
  for (const dir of pathEnv.split(path.delimiter)) {
    for (const n of names) {
      const full = path.join(dir, n)
      if (fs.existsSync(full)) add(full, 'PATH')
    }
  }

  // 2) Common install + download dirs (shallow scan).
  for (const dir of candidateDirs()) {
    let entries: fs.Dirent[] = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (process.platform === 'darwin' && e.name.toLowerCase().startsWith('godot') && e.name.endsWith('.app')) {
        const bin = macAppBinary(full)
        if (bin) add(bin, 'Applications')
      } else if (e.isFile() && looksLikeGodot(e.name)) {
        if (process.platform === 'win32' ? e.name.toLowerCase().endsWith('.exe') : true) {
          add(full, dir.includes('Steam') ? 'Steam' : 'folder')
        }
      }
    }
  }

  return found
}

// ── Download + extract ────────────────────────────────────────────────────────

function managedDir(): string {
  return path.join(app.getPath('userData'), 'godot')
}

interface GhAsset {
  name: string
  browser_download_url: string
}

function matchesPlatform(name: string): boolean {
  const n = name.toLowerCase()
  if (n.includes('mono')) return false
  if (process.platform === 'win32') return n.endsWith('win64.exe.zip')
  if (process.platform === 'darwin') return n.includes('macos.universal.zip')
  return n.includes('linux.x86_64.zip')
}

async function resolveLatestAsset(): Promise<GhAsset> {
  const res = await fetch('https://api.github.com/repos/godotengine/godot/releases/latest', {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'DevPad' },
  })
  if (!res.ok) throw new Error(`Could not reach GitHub (status ${res.status}).`)
  const data = (await res.json()) as { assets?: GhAsset[]; tag_name?: string }
  const asset = (data.assets ?? []).find((a) => matchesPlatform(a.name))
  if (!asset) {
    throw new Error(`No Godot build found for this platform in release ${data.tag_name ?? ''}.`)
  }
  return asset
}

function findExecutable(dir: string): string | null {
  let entries: fs.Dirent[] = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return null
  }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (process.platform === 'darwin' && e.name.endsWith('.app')) {
      const bin = macAppBinary(full)
      if (bin) return bin
    }
    if (e.isFile()) {
      if (process.platform === 'win32' && e.name.toLowerCase().endsWith('.exe')) return full
      if (process.platform !== 'win32' && looksLikeGodot(e.name)) return full
    }
    if (e.isDirectory()) {
      const nested = findExecutable(full)
      if (nested) return nested
    }
  }
  return null
}

/**
 * Download the latest stable Godot for this platform and extract it into
 * DevPad's managed folder. Reports progress via `onProgress`.
 */
export async function downloadGodot(
  onProgress: (p: GodotDownloadProgress) => void,
): Promise<GodotDownloadProgress> {
  const emit = (p: GodotDownloadProgress) => {
    onProgress(p)
    return p
  }
  try {
    emit({ phase: 'resolving', message: 'Finding the latest Godot version…' })
    const asset = await resolveLatestAsset()

    const dest = managedDir()
    fs.mkdirSync(dest, { recursive: true })
    const zipPath = path.join(dest, asset.name)

    emit({ phase: 'downloading', percent: 0, message: `Downloading ${asset.name}…` })
    const res = await fetch(asset.browser_download_url, {
      headers: { 'User-Agent': 'Zirtola', Accept: 'application/octet-stream' },
    })
    if (!res.ok || !res.body) throw new Error(`Download failed (status ${res.status}).`)

    const total = Number(res.headers.get('content-length') ?? 0)
    let received = 0
    let lastPct = -1
    // Count bytes INSIDE the pipeline. Using a separate stream.on('data')
    // listener flips the source into flowing mode and can drop the first chunks
    // before the file writer is attached, producing a truncated/corrupt zip
    // ("invalid block type" on extraction).
    const counter = new Transform({
      transform(chunk, _enc, cb) {
        received += chunk.length
        if (total > 0) {
          const pct = Math.round((received / total) * 100)
          if (pct !== lastPct) {
            lastPct = pct
            emit({ phase: 'downloading', percent: pct, message: `Downloading ${asset.name}…` })
          }
        }
        cb(null, chunk)
      },
    })
    const nodeStream = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0])
    await pipeline(nodeStream, counter, fs.createWriteStream(zipPath))

    // Validate the download before extracting: non-empty, full length, and a
    // real zip (PK signature). Surfaces a clear error instead of a zlib crash.
    const stat = fs.statSync(zipPath)
    if (stat.size === 0) throw new Error('The download was empty.')
    if (total > 0 && stat.size !== total) {
      throw new Error(`Download incomplete (${stat.size} of ${total} bytes).`)
    }
    const fd = fs.openSync(zipPath, 'r')
    const sig = Buffer.alloc(2)
    fs.readSync(fd, sig, 0, 2, 0)
    fs.closeSync(fd)
    if (sig.toString('latin1') !== 'PK') {
      throw new Error('Downloaded file is not a valid Zip archive.')
    }

    emit({ phase: 'extracting', percent: 100, message: 'Extracting Godot…' })
    const extractDir = path.join(dest, asset.name.replace(/\.zip$/i, ''))
    fs.mkdirSync(extractDir, { recursive: true })
    new AdmZip(zipPath).extractAllTo(extractDir, true)
    try {
      fs.unlinkSync(zipPath)
    } catch {
      /* ignore cleanup failure */
    }

    const exe = findExecutable(extractDir)
    if (!exe) throw new Error('Extraction completed but the Godot executable was not found.')
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(exe, 0o755)
      } catch {
        /* best effort */
      }
    }

    return emit({ phase: 'done', percent: 100, executablePath: exe, message: 'Godot is ready!' })
  } catch (err) {
    return emit({
      phase: 'error',
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

export async function openDownloadPage(): Promise<void> {
  await shell.openExternal('https://godotengine.org/download')
}
