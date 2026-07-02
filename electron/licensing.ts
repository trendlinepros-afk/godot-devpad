import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { app } from 'electron'
import type { LicenseInfo, LicenseStatus } from '@shared/types'

// Online license activation for Zirtola. The licensing backend lives at
// zirtola.com; this module owns the machine fingerprint, the HTTP client, the
// Ed25519 signature check, the obfuscated local cache, and the state machine
// the renderer's LicenseGate mirrors.
//
// Design rules (from the licensing contract):
//  - The online VALIDATE call is the source of truth; the cache is convenience.
//  - HTTP 4xx with a known "error" code is a LICENSE problem (specific message).
//  - 5xx / timeout / non-JSON is a SERVER/NETWORK problem — always retryable,
//    NEVER presented as "invalid license".
//  - The app must not run unlicensed: no offline mode.

const API_BASE = 'https://www.zirtola.com/api/licenses'
export const ACCOUNT_URL = 'https://www.zirtola.com/account'

// Ed25519 PUBLIC key for verifying the "signature" field of license responses.
// Public by design — safe to ship. The private key never leaves the server.
const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEANVNLjr3aP3sx/P+d5Hh66eqCthwWavSNW2aUq3JMpnc=
-----END PUBLIC KEY-----`

const REQUEST_TIMEOUT_MS = 15_000
const REVALIDATE_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24h for long-running apps

// ── Machine fingerprint ───────────────────────────────────────────────────────

let cachedMachineId: string | null = null

/** OS-level stable identifier, or null when unavailable (never sent raw). */
function osMachineIdentifier(): string | null {
  try {
    if (process.platform === 'win32') {
      // Registry MachineGuid — survives reinstalls of the app, stable per OS install.
      const out = execFileSync(
        'reg',
        ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
        { encoding: 'utf-8', windowsHide: true },
      )
      const m = /MachineGuid\s+REG_SZ\s+(\S+)/i.exec(out)
      if (m) return m[1]
    } else if (process.platform === 'darwin') {
      const out = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], {
        encoding: 'utf-8',
      })
      const m = /"IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(out)
      if (m) return m[1]
    } else {
      for (const p of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
        try {
          const id = fs.readFileSync(p, 'utf-8').trim()
          if (id) return id
        } catch {
          /* try next */
        }
      }
    }
  } catch (err) {
    console.warn('[license] machine identifier lookup failed:', err)
  }
  return null
}

/**
 * SHA-256 hex fingerprint sent to the licensing server. Stability is the whole
 * game — a changed fingerprint reads as a new machine and burns a seat — so
 * the computed hash is also persisted as a backup: if the OS lookup fails on a
 * later launch (or the machine never had one), the persisted value keeps the
 * fingerprint identical across launches, updates, and reinstalls.
 */
export function machineId(): string {
  if (cachedMachineId) return cachedMachineId
  const backupPath = path.join(app.getPath('userData'), 'device-id')
  const readBackup = (): string | null => {
    try {
      const saved = fs.readFileSync(backupPath, 'utf-8').trim()
      return /^[0-9a-f]{64}$/.test(saved) ? saved : null
    } catch {
      return null
    }
  }

  const osId = osMachineIdentifier()
  let id: string
  if (osId) {
    id = crypto.createHash('sha256').update(`zirtola-machine-v1:${osId}`).digest('hex')
  } else {
    // OS identifier unavailable — reuse the persisted fingerprint if we have
    // one, otherwise mint a random-but-persisted one.
    id =
      readBackup() ??
      crypto.createHash('sha256').update(`zirtola-machine-v1:${crypto.randomUUID()}`).digest('hex')
  }
  try {
    fs.mkdirSync(path.dirname(backupPath), { recursive: true })
    if (readBackup() !== id) fs.writeFileSync(backupPath, id, 'utf-8')
  } catch {
    /* backup is best-effort; the in-memory value holds for this run */
  }
  cachedMachineId = id
  return cachedMachineId
}

// ── Signature verification ────────────────────────────────────────────────────

/**
 * The server signs the canonical JSON of the response minus "signature", in the
 * key order it sent. JSON.parse preserves that order and object spread keeps
 * it, so stringifying the rest reproduces the signed bytes exactly.
 */
function verifySignature(payload: Record<string, unknown>): boolean {
  const sig = payload.signature
  if (typeof sig !== 'string' || !sig) return false
  const { signature: _drop, ...rest } = payload
  try {
    return crypto.verify(
      null,
      Buffer.from(JSON.stringify(rest), 'utf-8'),
      crypto.createPublicKey(LICENSE_PUBLIC_KEY_PEM),
      Buffer.from(sig, 'base64'),
    )
  } catch (err) {
    console.warn('[license] signature verification threw:', err)
    return false
  }
}

// ── Local cache (obfuscated, convenience only) ────────────────────────────────

function cachePath(): string {
  return path.join(app.getPath('userData'), 'license.json')
}

/** AES key derived from the machine fingerprint — moves with the device, not the file. */
function cacheKey(): Buffer {
  return crypto.createHash('sha256').update(`zirtola-license-cache-v1:${machineId()}`).digest()
}

function saveCache(info: LicenseInfo): void {
  try {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', cacheKey(), iv)
    const data = Buffer.concat([cipher.update(JSON.stringify(info), 'utf-8'), cipher.final()])
    const blob = {
      v: 1,
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: data.toString('base64'),
    }
    fs.writeFileSync(cachePath(), JSON.stringify(blob), 'utf-8')
  } catch (err) {
    console.warn('[license] failed to write cache:', err)
  }
}

function loadCache(): LicenseInfo | null {
  try {
    const blob = JSON.parse(fs.readFileSync(cachePath(), 'utf-8')) as {
      iv: string
      tag: string
      data: string
    }
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      cacheKey(),
      Buffer.from(blob.iv, 'base64'),
    )
    decipher.setAuthTag(Buffer.from(blob.tag, 'base64'))
    const json = Buffer.concat([
      decipher.update(Buffer.from(blob.data, 'base64')),
      decipher.final(),
    ]).toString('utf-8')
    return JSON.parse(json) as LicenseInfo
  } catch {
    return null // missing, corrupt, or from another machine — treat as absent
  }
}

function clearCache(): void {
  try {
    fs.unlinkSync(cachePath())
  } catch {
    /* already absent */
  }
}

// ── HTTP client ───────────────────────────────────────────────────────────────

const LICENSE_ERROR_CODES = new Set([
  'invalid_key',
  'revoked',
  'expired',
  'activation_limit_reached',
  'not_activated',
  'missing_fields',
])

type ApiResult =
  | { kind: 'ok'; payload: LicenseInfo }
  | { kind: 'license_error'; code: string; payload: Record<string, unknown> }
  | { kind: 'server_error'; message: string }
  | { kind: 'network_error'; message: string }

const SERVER_ERROR_MESSAGE =
  'The licensing server is temporarily unavailable — please try again shortly or contact support.'
const NETWORK_ERROR_MESSAGE =
  "Couldn't reach the licensing server — check your internet connection and try again."

async function callApi(endpoint: string, body: Record<string, unknown>): Promise<ApiResult> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    console.warn(`[license] ${endpoint}: network failure:`, err)
    return { kind: 'network_error', message: NETWORK_ERROR_MESSAGE }
  }

  let raw = ''
  let parsed: Record<string, unknown> | null = null
  try {
    raw = await res.text()
    parsed = JSON.parse(raw) as Record<string, unknown>
  } catch {
    parsed = null
  }

  // 5xx, non-JSON, or a 4xx without a recognised "error" code are SERVER
  // problems, never "your key is bad". Log status + body so they're diagnosable.
  if (res.status >= 500 || !parsed) {
    console.error(`[license] ${endpoint}: server error HTTP ${res.status}:`, raw.slice(0, 500))
    return { kind: 'server_error', message: SERVER_ERROR_MESSAGE }
  }
  if (res.ok) {
    return { kind: 'ok', payload: parsed as unknown as LicenseInfo }
  }
  const code = typeof parsed.error === 'string' ? parsed.error : ''
  if (LICENSE_ERROR_CODES.has(code)) {
    return { kind: 'license_error', code, payload: parsed }
  }
  console.error(`[license] ${endpoint}: unexpected HTTP ${res.status}:`, raw.slice(0, 500))
  return { kind: 'server_error', message: SERVER_ERROR_MESSAGE }
}

// ── User-facing messages for license error codes ──────────────────────────────

function licenseErrorMessage(code: string, payload: Record<string, unknown>): string {
  switch (code) {
    case 'invalid_key':
      return "That license key isn't valid. Check it for typos and try again."
    case 'expired':
      return 'Your license has expired. Renew it to keep using Zirtola.'
    case 'revoked':
      return 'This license key has been revoked. If you believe this is a mistake, contact support.'
    case 'activation_limit_reached': {
      const max = typeof payload.maxActivations === 'number' ? payload.maxActivations : undefined
      const used = typeof payload.seatsUsed === 'number' ? payload.seatsUsed : undefined
      const counts = max != null && used != null ? ` (${used} of ${max} devices in use)` : ''
      return `This key has reached its activation limit${counts}. Deactivate another device from Settings → License on that machine, or purchase another license.`
    }
    case 'not_activated':
      return 'This device is not activated yet — enter your license key to activate it.'
    default:
      return 'The license request was missing required information. Please try again.'
  }
}

// ── State machine ─────────────────────────────────────────────────────────────

let status: LicenseStatus = { state: 'checking' }
let notify: ((s: LicenseStatus) => void) | null = null
let revalidateTimer: NodeJS.Timeout | null = null
// Bumped on every user-initiated transition (activate / revalidate /
// deactivate). In-flight responses from an older generation are discarded so a
// slow validate can't overwrite the outcome of a newer activate/deactivate.
let generation = 0

/** A signed 200 payload must actually carry the fields the app relies on. */
function validPayloadShape(p: LicenseInfo): boolean {
  return (
    typeof p.key === 'string' &&
    p.key.length > 0 &&
    typeof p.productName === 'string' &&
    typeof p.type === 'string' &&
    typeof p.maxActivations === 'number' &&
    typeof p.seatsUsed === 'number'
  )
}

function publicInfo(info: LicenseInfo): LicenseStatus['info'] {
  return {
    key: info.key.length > 9 ? `${info.key.slice(0, 4)}…${info.key.slice(-5)}` : info.key,
    productName: info.productName,
    type: info.type,
    expiresAt: info.expiresAt ?? null,
    maxActivations: info.maxActivations,
    seatsUsed: info.seatsUsed,
  }
}

function setStatus(next: LicenseStatus): LicenseStatus {
  status = next
  notify?.(status)
  return status
}

export function getLicenseStatus(): LicenseStatus {
  return status
}

export function isLicensed(): boolean {
  return status.state === 'licensed'
}

/** ok-payload → verified LicenseInfo, or null when unverifiable/malformed. */
function verifiedPayload(result: ApiResult): LicenseInfo | null {
  if (result.kind !== 'ok') return null
  const raw = result.payload as unknown as Record<string, unknown>
  if (result.payload.valid !== true || !verifySignature(raw)) {
    console.error('[license] response failed signature verification — rejecting')
    return null
  }
  if (!validPayloadShape(result.payload)) {
    console.error('[license] signed response is missing required fields — rejecting')
    return null
  }
  return result.payload
}

function applyResult(result: ApiResult, keyUnderTest?: string): LicenseStatus {
  switch (result.kind) {
    case 'ok': {
      const payload = verifiedPayload(result)
      if (!payload) {
        return setStatus({
          state: 'server_error',
          message:
            "The licensing server's response could not be verified. Please try again shortly or contact support.",
        })
      }
      saveCache(payload)
      return setStatus({ state: 'licensed', info: publicInfo(payload) })
    }
    case 'license_error': {
      const message = licenseErrorMessage(result.code, result.payload)
      if (
        result.code === 'not_activated' ||
        result.code === 'invalid_key' ||
        result.code === 'activation_limit_reached' // key is fine, machine can't take a seat
      ) {
        return setStatus({ state: 'needs_key', message, errorCode: result.code })
      }
      if (result.code === 'missing_fields') {
        // A protocol problem (client/server drift), not a bad license — treat
        // as retryable and never touch the cached license over it.
        return setStatus({ state: 'server_error', message })
      }
      // revoked / expired → blocked with account link. Only clear the cache
      // when the failing key IS the cached license — a different key typed
      // into the form must not nuke a working activation.
      const cached = loadCache()
      if (keyUnderTest && cached && cached.key !== keyUnderTest) {
        return setStatus({ state: 'needs_key', message, errorCode: result.code })
      }
      clearCache()
      return setStatus({ state: 'blocked', message, errorCode: result.code })
    }
    case 'network_error':
      return setStatus({ state: 'offline', message: result.message })
    case 'server_error':
      return setStatus({ state: 'server_error', message: result.message })
  }
}

/** Validate the cached key online. Source of truth for whether the app runs. */
export async function revalidate(): Promise<LicenseStatus> {
  const gen = ++generation
  const cached = loadCache()
  if (!cached?.key) {
    return setStatus({ state: 'needs_key' })
  }
  setStatus({ state: 'checking' })
  const result = await callApi('validate', { key: cached.key, machineId: machineId() })
  if (gen !== generation) return status // superseded by a newer activate/deactivate
  return applyResult(result)
}

/** Activate a key on this machine (first entry, or after a block). */
export async function activate(key: string): Promise<LicenseStatus> {
  const trimmed = key.trim()
  if (!trimmed) {
    return setStatus({ state: 'needs_key', message: 'Enter your license key to continue.' })
  }
  const gen = ++generation
  setStatus({ state: 'checking' })
  const result = await callApi('activate', {
    key: trimmed,
    machineId: machineId(),
    machineName: os.hostname(),
  })
  if (gen !== generation) return status // superseded
  const next = applyResult(result, trimmed)
  if (next.state === 'licensed' && next.info) {
    // Surface remaining device slots on successful activation.
    const remaining = Math.max(0, next.info.maxActivations - next.info.seatsUsed)
    return setStatus({
      ...next,
      message: `Activated on this device. You've used ${next.info.seatsUsed} of ${next.info.maxActivations} activations — ${remaining} remaining.`,
    })
  }
  return next
}

/** Release this machine's seat and return to the activation screen. */
export async function deactivate(): Promise<{ ok: boolean; seatsUsed?: number; error?: string }> {
  const cached = loadCache()
  if (!cached?.key) return { ok: false, error: 'No license is active on this device.' }
  const gen = ++generation
  const result = await callApi('deactivate', { key: cached.key, machineId: machineId() })
  if (gen !== generation) return { ok: false, error: 'Superseded by another license action.' }
  // Success — or the server says this key/pairing no longer exists at all
  // (not_activated / invalid_key / revoked / expired). In every one of those
  // cases keeping the local activation would trap the user in a licensed state
  // the server no longer recognises, so release locally too.
  const serverSaysGone =
    result.kind === 'license_error' &&
    ['not_activated', 'invalid_key', 'revoked', 'expired'].includes(result.code)
  if (result.kind === 'ok' || serverSaysGone) {
    clearCache()
    setStatus({ state: 'needs_key', message: 'This device was deactivated.' })
    const seats =
      result.kind === 'ok' && typeof (result.payload as unknown as Record<string, unknown>).seatsUsed === 'number'
        ? ((result.payload as unknown as Record<string, unknown>).seatsUsed as number)
        : undefined
    return { ok: true, seatsUsed: seats }
  }
  const error =
    result.kind === 'license_error'
      ? licenseErrorMessage(result.code, result.payload)
      : result.message
  return { ok: false, error }
}

/**
 * Daily background re-check for long-running apps. Applies only DEFINITIVE
 * outcomes (verified ok / license errors). Anything transient — network,
 * server failure, or an ok response that fails verification (captive portal,
 * proxy interference, key rotation) — keeps the current state: a licensed
 * session is never kicked over a transient problem.
 */
async function revalidateInBackground(): Promise<void> {
  try {
    const cached = loadCache()
    if (!cached?.key) return
    const gen = generation
    const result = await callApi('validate', { key: cached.key, machineId: machineId() })
    if (gen !== generation) return // a user action (deactivate/activate) won
    if (result.kind === 'ok') {
      const payload = verifiedPayload(result)
      if (!payload) {
        console.warn('[license] background revalidation response unverifiable; keeping state')
        return
      }
      saveCache(payload)
      setStatus({ state: 'licensed', info: publicInfo(payload) })
    } else if (result.kind === 'license_error') {
      applyResult(result)
    } else {
      console.warn('[license] periodic revalidation hit a transient failure; keeping current state')
    }
  } catch (err) {
    console.warn('[license] background revalidation threw; keeping current state:', err)
  }
}

/**
 * Start licensing: validate the cached key online (or ask for one), and keep
 * re-validating daily while the app runs. Mid-run transient network/server
 * failures do NOT lock a licensed app; definitive license errors do.
 */
export async function initLicensing(onChange: (s: LicenseStatus) => void): Promise<LicenseStatus> {
  notify = onChange
  let first: LicenseStatus
  try {
    first = await revalidate()
  } catch (err) {
    // Never leave the UI stranded on 'checking' — anything unexpected here is
    // a retryable problem, not a bad key.
    console.error('[license] initial validation threw:', err)
    first = setStatus({ state: 'server_error', message: SERVER_ERROR_MESSAGE })
  }
  if (revalidateTimer) clearInterval(revalidateTimer)
  revalidateTimer = setInterval(() => void revalidateInBackground(), REVALIDATE_INTERVAL_MS)
  return first
}

/** Stop background revalidation (app quit). */
export function stopLicensing(): void {
  if (revalidateTimer) clearInterval(revalidateTimer)
  revalidateTimer = null
  notify = null
}
