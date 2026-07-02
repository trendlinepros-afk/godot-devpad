import { app, BrowserWindow, ipcMain, globalShortcut, dialog, screen, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  AiRequest,
  DevPadConfig,
  DisplayInfo,
  EmbedRect,
  MonitorPosition,
  ProviderId,
} from '@shared/types'
import { store, getConfig, setMany, setKey, ensureDefaultProfiles } from './store'
import {
  runGodot,
  stopGodot,
  restartGodot,
  getStatus as getGodotStatus,
  onStatusChange as onGodotStatusChange,
  onLogEntry as onGodotLog,
  getLogs as getGodotLogs,
  clearLogs as clearGodotLogs,
  getPid as getGodotPid,
  GodotLaunchError,
} from './godot'
import {
  isSupported as embedSupported,
  support as embedSupport,
  findWindowByPid,
  embed as embedWindow,
  moveEmbedded,
  detach as detachWindow,
  attachInput,
  detachInput,
} from './win-embed'
import { detectGodot, downloadGodot, openDownloadPage } from './godot-install'
import {
  startBridgeServer,
  stopBridgeServer,
  setBridgeHandlers,
  getBridgeStatus,
  bridgeRequest,
} from './bridge-server'
import { installAddon } from './godot-addon'
import { generateAsset, saveAsset } from './assets'
import {
  listDir,
  readFileText,
  openExternal,
  createNewProject,
  validateProject,
  applyEdit,
  toReadablePath,
} from './files'
import { isRepo, checkpoint, listCheckpoints, restoreCheckpoint } from './git'
import { captureGodotWindow } from './capture'
import {
  initUpdater,
  getUpdateStatus,
  checkForUpdates as checkAppUpdates,
  downloadUpdate,
  installUpdate,
} from './updater'
import { loadVersions, checkForUpdates } from './versions'
import { setMcpEnabled, startMcpServer, stopMcpServer, getMcpStatus } from './mcp-server'
import { route } from './ai/router'
import { testProvider } from './ai/providers'
import {
  initLicensing,
  getLicenseStatus,
  activate as activateLicense,
  revalidate as revalidateLicense,
  deactivate as deactivateLicense,
  startTrial as startLicenseTrial,
  continueFree as continueLicenseFree,
  getTier,
  stopLicensing,
  ACCOUNT_URL,
  PRICING_URL,
} from './licensing'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// vite-plugin-electron exposes these env vars pointing at the renderer.
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
const RENDERER_DIST = path.join(__dirname, '../dist')

let mainWindow: BrowserWindow | null = null

// ── Multi-monitor helpers ────────────────────────────────────────────────────

function getDisplayInfos(): DisplayInfo[] {
  const displays = screen.getAllDisplays()
  const primaryId = screen.getPrimaryDisplay().id
  return displays.map((d, index) => ({
    index,
    label:
      index === 0
        ? 'Primary'
        : index === 1
          ? 'Secondary'
          : index === 2
            ? 'Third'
            : `Display ${index + 1}`,
    bounds: d.bounds,
    primary: d.id === primaryId,
  }))
}

function applyMonitorPosition(win: BrowserWindow, position: MonitorPosition): void {
  if (position === 'auto') return
  const displays = screen.getAllDisplays()
  const display = displays[position]
  if (!display) return

  const cfg = getConfig()
  const saved = cfg.windowBounds
  const { x, y, width, height } = display.workArea
  const w = Math.min(saved?.width ?? 1200, width)
  const h = Math.min(saved?.height ?? 800, height)
  // Center within the chosen display's work area.
  win.setBounds({
    x: Math.round(x + (width - w) / 2),
    y: Math.round(y + (height - h) / 2),
    width: w,
    height: h,
  })
}

function persistBounds(win: BrowserWindow): void {
  if (win.isMinimized() || win.isMaximized()) return
  const b = win.getBounds()
  store.set('windowBounds', { width: b.width, height: b.height, x: b.x, y: b.y })
}

// ── Windows embed controller (experimental) ──────────────────────────────────

let embeddedHwnd: number | bigint | null = null
let embedActive = false
let embedInProgress = false
let lastEmbedRect: EmbedRect | null = null

function sendEmbedStatus(message?: string): void {
  const s = embedSupport()
  mainWindow?.webContents.send('embed:status', {
    supported: s.supported,
    reason: s.reason,
    active: embedActive,
    message,
  })
}

/**
 * Convert the embed pane's rect (CSS px relative to the web content) into an
 * absolute physical-pixel screen rect for positioning the overlay window.
 * screen.dipToScreenRect handles per-monitor DPI scaling so we don't hand-roll it.
 */
function paneScreenRect(rect: EmbedRect): { x: number; y: number; width: number; height: number } {
  const cb = mainWindow!.getContentBounds() // DIP screen coords of the web content
  const dip = {
    x: Math.round(cb.x + rect.x),
    y: Math.round(cb.y + rect.y),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  }
  return screen.dipToScreenRect(mainWindow!, dip)
}

/** Find the Godot game window and dock it over the embed pane. */
async function attemptEmbed(): Promise<void> {
  if (
    process.platform !== 'win32' ||
    getTier() === 'free' || // embedded window is a Pro feature
    getConfig().godotWindowMode !== 'embedded' ||
    !embedSupported() ||
    !mainWindow ||
    !lastEmbedRect ||
    embedActive ||
    embedInProgress // single-flight: setBounds fires often; don't stack poll loops
  ) {
    return
  }
  const pid = getGodotPid()
  if (!pid) return
  embedInProgress = true
  try {
    // The game window appears shortly after launch — poll for it.
    for (let i = 0; i < 24; i++) {
      if (getGodotPid() !== pid) return // stopped/changed while polling
      if (getConfig().godotWindowMode !== 'embedded') return // mode changed
      const hwnd = findWindowByPid(pid)
      if (hwnd != null && lastEmbedRect && mainWindow) {
        const ok = await embedWindow(mainWindow.getNativeWindowHandle(), hwnd, paneScreenRect(lastEmbedRect))
        // Godot may have exited (or the mode changed) while embedWindow was in
        // flight — committing then would leave embedActive pointing at a dead
        // HWND and block every future attempt until a mode toggle.
        if (getGodotPid() !== pid || getConfig().godotWindowMode !== 'embedded') {
          if (ok) void detachWindow(hwnd)
          return
        }
        embeddedHwnd = ok ? hwnd : null
        embedActive = ok
        if (ok) void attachInput(hwnd, true) // focus + foreground the fresh game
        sendEmbedStatus(ok ? undefined : 'Could not embed the Godot window.')
        return
      }
      await new Promise((r) => setTimeout(r, 250))
    }
    sendEmbedStatus('Timed out finding the Godot window to embed.')
  } finally {
    embedInProgress = false
  }
}

function clearEmbed(): void {
  // detachWindow/detachInput are async (run off the UI thread); fire-and-forget.
  void detachInput()
  if (embeddedHwnd != null) void detachWindow(embeddedHwnd)
  embeddedHwnd = null
  embedActive = false
  sendEmbedStatus()
}

// ── Window creation ──────────────────────────────────────────────────────────

/**
 * True when the saved window position is still visible on some display —
 * monitors get unplugged and resolutions change between runs, and restoring
 * an off-screen position would make the app launch invisible.
 */
function boundsOnScreen(b: { x?: number; y?: number; width: number; height: number }): boolean {
  if (b.x == null || b.y == null) return false
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea
    // Require a meaningful overlap, not just a 1px corner.
    const overlapX = Math.min(b.x! + b.width, a.x + a.width) - Math.max(b.x!, a.x)
    const overlapY = Math.min(b.y! + b.height, a.y + a.height) - Math.max(b.y!, a.y)
    return overlapX > 100 && overlapY > 100
  })
}

function createWindow(): void {
  const cfg = getConfig()
  const bounds = cfg.windowBounds ?? { width: 1200, height: 800 }
  const onScreen = boundsOnScreen(bounds)

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    // Omit x/y (Electron centers the window) when the saved spot is no longer
    // on any connected display.
    x: onScreen ? bounds.x : undefined,
    y: onScreen ? bounds.y : undefined,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0e1116',
    title: 'Zirtola — The AI Video Game Editor',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  applyMonitorPosition(mainWindow, cfg.monitorPosition)

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
    // Open the dev console automatically so embed/IPC diagnostics ([embed] …)
    // are visible immediately when running `npm run dev` for local debugging.
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  // Forward Godot process state transitions to the renderer, and drive the
  // experimental Windows embed on run/stop.
  onGodotStatusChange((status) => {
    mainWindow?.webContents.send('godot:statusChange', status)
    syncHotkeys() // hotkeys stay global while a game runs, released otherwise
    if (status.state === 'stopped') clearEmbed()
    else if (status.state === 'running' && getConfig().godotWindowMode === 'embedded') {
      attemptEmbed()
    }
  })

  // Stream captured Godot stdout/stderr to the renderer console.
  onGodotLog((entry) => {
    mainWindow?.webContents.send('godot:log', entry)
  })

  mainWindow.on('resize', () => mainWindow && persistBounds(mainWindow))
  mainWindow.on('move', () => mainWindow && persistBounds(mainWindow))
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // When the user clicks back into Zirtola while a game is embedded and visible
  // (Game tab), hand keyboard/mouse focus to the embedded game so it responds.
  // Gated on an on-screen rect so we never steal focus while it's parked
  // off-screen on another tab.
  mainWindow.on('focus', () => {
    if (embedActive && embeddedHwnd != null && lastEmbedRect && lastEmbedRect.x > -10000) {
      void attachInput(embeddedHwnd)
    }
  })
}

// ── Global hotkeys ────────────────────────────────────────────────────────────
// F5/F6/F7 are registered as GLOBAL shortcuts so Stop/Restart still work while
// the (embedded) game window has focus — but only while Zirtola is focused or a
// game is running. Otherwise we release them: holding F5 system-wide would
// hijack Run Project inside the real Godot editor and refresh in browsers.

let hotkeysActive = false

function syncHotkeys(): void {
  const focused = BrowserWindow.getFocusedWindow() != null
  // Hotkeys run/stop Godot — available on every tier (incl. free), but never
  // while the app is still gated: the handlers would no-op while swallowing
  // F5/F6/F7 from every other app.
  const want = getTier() !== null && (focused || getGodotStatus().state !== 'stopped')
  if (want === hotkeysActive) return
  hotkeysActive = want
  if (want) registerHotkeys()
  else globalShortcut.unregisterAll()
}

function registerHotkeys(): void {
  // Hotkeys act directly in the main process, so each handler carries its own
  // license check — the IPC guard doesn't cover them.
  const send = (action: 'run' | 'stop' | 'restart') => {
    mainWindow?.webContents.send('hotkey', action)
  }
  // F5 → Run, F6 → Stop, F7 → Restart. We perform the action AND notify the
  // renderer so the UI reflects the new state.
  globalShortcut.register('F5', () => {
    if (getTier() === null) return
    try {
      runGodot()
    } catch (err) {
      mainWindow?.webContents.send('godot:statusChange', {
        ...getGodotStatus(),
        message: err instanceof GodotLaunchError ? err.message : String(err),
      })
    }
    send('run')
  })
  globalShortcut.register('F6', () => {
    if (getTier() === null) return
    stopGodot()
    send('stop')
  })
  globalShortcut.register('F7', () => {
    if (getTier() === null) return
    try {
      restartGodot()
    } catch (err) {
      mainWindow?.webContents.send('godot:statusChange', {
        ...getGodotStatus(),
        message: err instanceof GodotLaunchError ? err.message : String(err),
      })
    }
    send('restart')
  })
}

// ── IPC handlers ─────────────────────────────────────────────────────────────

// License enforcement: every capability except licensing itself, config (EULA
// acceptance, window prefs) and app self-update requires a validated license.
// The renderer's LicenseGate blocks the UI too — this is the hard backstop.
const LICENSE_EXEMPT_PREFIXES = ['license:', 'config:', 'updates:']
// Read-only status lookups the app shell needs to BOOT (AppProvider fetches
// them before the license gate can even render). They expose no capability —
// blocking them would hang startup on "Loading…" with no way to activate.
const LICENSE_EXEMPT_CHANNELS = new Set([
  'versions:getAll',
  'godot:status',
  'mcp:status',
  'bridge:status',
  // Park/detach the embedded native window — pure cleanup, no capability.
  // EmbedPane calls these while unmounting when a license drops mid-run;
  // blocking them would leave the game window painted over the license gate.
  'embed:setBounds',
  'embed:clear',
])

// Pro-only capabilities. Free tier keeps the core (BYOK AI, run/console,
// files, notes, checkpoints); these unlock with a trial or a Pro license.
const PRO_CHANNELS = new Set([
  'assets:generate', // Asset Studio image generation
  'bridge:request', // live scene editing through the editor addon
  'bridge:installAddon',
  'mcp:setEnabled', // MCP server
])
// Embedded-window mode is Pro too, but its park/detach cleanup must always
// work (see LICENSE_EXEMPT_CHANNELS) — so only gate it at the feature level.
const PRO_PREFIXES: string[] = []

function requiresLicense(channel: string): boolean {
  if (LICENSE_EXEMPT_CHANNELS.has(channel)) return false
  return !LICENSE_EXEMPT_PREFIXES.some((p) => channel.startsWith(p))
}

function isProChannel(channel: string): boolean {
  return PRO_CHANNELS.has(channel) || PRO_PREFIXES.some((p) => channel.startsWith(p))
}

function handle(
  channel: string,
  fn: (event: Electron.IpcMainInvokeEvent, ...args: never[]) => unknown,
): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (requiresLicense(channel)) {
      const tier = getTier()
      if (tier === null) {
        // Still gated (no trial/license/free choice yet, or blocked).
        throw new Error('A valid Zirtola license is required to use this feature.')
      }
      if (tier === 'free' && isProChannel(channel)) {
        throw new Error(
          'This is a Zirtola Pro feature — start your free trial or upgrade at zirtola.com.',
        )
      }
    }
    return fn(event, ...(args as never[]))
  })
}

function registerIpc(): void {
  // Licensing (always available — it's how the app becomes licensed)
  handle('license:status', () => getLicenseStatus())
  handle('license:activate', (_e, key: string) => activateLicense(String(key)))
  handle('license:startTrial', () => startLicenseTrial())
  handle('license:continueFree', () => continueLicenseFree())
  handle('license:revalidate', () => revalidateLicense())
  handle('license:deactivate', () => deactivateLicense())
  handle('license:openAccount', () => shell.openExternal(ACCOUNT_URL))
  handle('license:openPricing', () => shell.openExternal(PRICING_URL))

  // Config
  handle('config:getAll', () => getConfig())
  handle('config:get', (_e, key: keyof DevPadConfig) => store.get(key))
  handle('config:set', (_e, key: keyof DevPadConfig, value: unknown) => {
    setKey(key, value)
  })
  handle('config:setMany', (_e, partial: Partial<DevPadConfig>) => setMany(partial))

  // Godot launcher
  handle('godot:run', () => {
    try {
      return runGodot()
    } catch (err) {
      return {
        ...getGodotStatus(),
        message: err instanceof GodotLaunchError ? err.message : String(err),
      }
    }
  })
  handle('godot:stop', () => stopGodot())
  handle('godot:restart', () => {
    try {
      return restartGodot()
    } catch (err) {
      return {
        ...getGodotStatus(),
        message: err instanceof GodotLaunchError ? err.message : String(err),
      }
    }
  })
  handle('godot:status', () => getGodotStatus())
  handle('godot:getLogs', () => getGodotLogs())
  handle('godot:clearLogs', () => clearGodotLogs())

  // Godot install assistant (detect / download / connect)
  handle('godotInstall:detect', () => detectGodot())
  handle('godotInstall:download', () =>
    downloadGodot((p) => mainWindow?.webContents.send('godotInstall:progress', p)),
  )
  handle('godotInstall:openDownloadPage', () => openDownloadPage())

  // AI
  handle('ai:send', (_e, req: AiRequest) => route(req))
  handle('ai:test', (_e, provider: ProviderId) =>
    testProvider(provider, getConfig().apiKeys),
  )

  // Files
  handle('files:list', (_e, dir: string) => listDir(dir))
  handle('files:read', (_e, p: string) => readFileText(toReadablePath(p)))
  handle('files:openExternal', (_e, p: string) => openExternal(p))
  handle('files:applyEdit', (_e, edit) => applyEdit(edit))

  // Git checkpoints (undo safety net for AI edits)
  handle('git:state', async () => ({ repo: await isRepo() }))
  handle('git:checkpoint', (_e, message: string) => checkpoint(message))
  handle('git:list', () => listCheckpoints())
  handle('git:restore', (_e, hash: string) => restoreCheckpoint(hash))

  // Capture
  handle('capture:godot', () => captureGodotWindow())

  // Dialogs
  handle('dialog:pickFile', async (_e, opts?: { title?: string }) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: opts?.title ?? 'Select a file',
      properties: ['openFile'],
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  handle('dialog:pickFolder', async (_e, opts?: { title?: string }) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: opts?.title ?? 'Select a folder',
      properties: ['openDirectory'],
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  // Asset generation
  handle('assets:generate', (_e, req) => generateAsset(req))
  handle('assets:save', (_e, base64: string, name: string) => saveAsset(base64, name))

  // Godot editor bridge (addon)
  handle('bridge:status', () => getBridgeStatus())
  handle('bridge:installAddon', () => installAddon())
  handle('bridge:request', (_e, method: string, params?: Record<string, unknown>) =>
    bridgeRequest(method, params),
  )

  // App self-update
  handle('updates:status', () => getUpdateStatus())
  handle('updates:check', () => checkAppUpdates())
  handle('updates:download', () => downloadUpdate())
  handle('updates:install', () => installUpdate())

  // Projects (new / validate)
  handle('project:createNew', (_e, dir: string) => createNewProject(dir))
  handle('project:validate', (_e, dir: string) => validateProject(dir))

  // MCP
  handle('mcp:status', () => getMcpStatus())
  handle('mcp:setEnabled', async (_e, value: boolean) => {
    store.set('mcpEnabled', value)
    return setMcpEnabled(value)
  })

  // Versions
  handle('versions:getAll', () => loadVersions())
  handle('versions:check', async () => {
    const outcome = await checkForUpdates()
    return { updated: outcome.added.length > 0, added: outcome.added, file: outcome.file }
  })

  // Embedded Godot window (experimental, Windows)
  handle('embed:setBounds', (_e, rect: EmbedRect) => {
    lastEmbedRect = rect
    // Both branches run off the UI thread; fire-and-forget (setBounds fires often).
    if (embedActive && embeddedHwnd != null) {
      void moveEmbedded(embeddedHwnd, paneScreenRect(rect))
      // Keep input attached only while the game is actually visible (Game tab).
      // Off-screen (other tab) we detach so it can't hold focus/mouse capture.
      if (rect.x > -10000) void attachInput(embeddedHwnd)
      else void detachInput()
    } else void attemptEmbed()
  })
  handle('embed:clear', () => clearEmbed())
  handle('embed:status', () => {
    const s = embedSupport()
    return { supported: s.supported, reason: s.reason, active: embedActive }
  })

  // Window / multi-monitor
  handle('window:getDisplays', () => getDisplayInfos())
  handle('window:setMonitor', (_e, position: MonitorPosition) => {
    store.set('monitorPosition', position)
    if (mainWindow) applyMonitorPosition(mainWindow, position)
  })
}

// ── App lifecycle ────────────────────────────────────────────────────────────

// Local servers (editor bridge, MCP) expose real capabilities, so they run
// only while the license is valid — never for an unlicensed install, and they
// shut down again if the license is deactivated or revoked mid-session.
let servicesStarted = false
function startLicensedServices(): void {
  if (servicesStarted) return
  servicesStarted = true

  setBridgeHandlers({
    onStatus: (s) => mainWindow?.webContents.send('bridge:status', s),
    onEvent: (e) => mainWindow?.webContents.send('bridge:event', e),
  })
  startBridgeServer()

  if (getConfig().mcpEnabled) {
    startMcpServer().catch((err) => console.error('[mcp] failed to start', err))
  }

  // Silently check for new Godot version definitions, then notify the renderer
  // if anything new was merged (the UI shows a subtle toast).
  checkForUpdates()
    .then((outcome) => {
      if (outcome.added.length > 0) {
        mainWindow?.webContents.send('versions:updated', outcome.added)
      }
    })
    .catch(() => {})
}

function stopLicensedServices(): void {
  if (!servicesStarted) return
  servicesStarted = false
  stopBridgeServer()
  stopMcpServer().catch(() => {})
}

app.whenReady().then(async () => {
  ensureDefaultProfiles()
  registerIpc()
  createWindow()
  syncHotkeys()
  app.on('browser-window-focus', syncHotkeys)
  app.on('browser-window-blur', () => setTimeout(syncHotkeys, 50)) // let focus settle

  // Wire app self-update events to the renderer, then do a silent startup check.
  // (Updates stay available pre-license so a broken build can always be fixed.)
  initUpdater((status) => mainWindow?.webContents.send('updates:status', status))
  checkAppUpdates().catch(() => {})

  // Online license check — the renderer's LicenseGate mirrors this status and
  // the IPC guard enforces it. Services run only while licensed; when the
  // license drops mid-session (deactivated/revoked), everything winds down:
  // servers stop, a running game is stopped, and the embed is detached so the
  // native window can't sit on top of the license gate.
  const onLicenseTransition = (state: string) => {
    if (state === 'licensed') {
      startLicensedServices()
    } else if (state === 'free') {
      // Downgrade, not lockout: core keeps running. Pro services stop and an
      // embedded game pops back out to its own window — but a running game is
      // never killed mid-session.
      if (servicesStarted) stopLicensedServices()
      clearEmbed()
    } else if (servicesStarted) {
      // Gate states (blocked / needs_key / …): wind everything down.
      stopLicensedServices()
      stopGodot()
      clearEmbed()
    }
    syncHotkeys()
  }
  initLicensing((status) => {
    mainWindow?.webContents.send('license:status', status)
    onLicenseTransition(status.state)
  })
    .then((status) => onLicenseTransition(status.state))
    .catch((err) => console.error('[license] init failed:', err))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  stopLicensing()
  stopGodot()
})
