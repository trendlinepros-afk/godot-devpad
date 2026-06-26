import { app, BrowserWindow, ipcMain, globalShortcut, dialog, screen } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  AiRequest,
  DevPadConfig,
  DisplayInfo,
  MonitorPosition,
  ProviderId,
} from '@shared/types'
import { store, getConfig, setMany, ensureDefaultProfiles } from './store'
import {
  runGodot,
  stopGodot,
  restartGodot,
  getStatus as getGodotStatus,
  onStatusChange as onGodotStatusChange,
  GodotLaunchError,
} from './godot'
import { listDir, readFileText, openExternal } from './files'
import { captureGodotWindow } from './capture'
import { loadVersions, checkForUpdates } from './versions'
import { setMcpEnabled, startMcpServer, getMcpStatus } from './mcp-server'
import { route } from './ai/router'
import { testProvider } from './ai/providers'

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

// ── Window creation ──────────────────────────────────────────────────────────

function createWindow(): void {
  const cfg = getConfig()
  const bounds = cfg.windowBounds ?? { width: 1200, height: 800 }

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0e1116',
    title: 'DevPad',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  applyMonitorPosition(mainWindow, cfg.monitorPosition)

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  // Forward Godot process state transitions to the renderer.
  onGodotStatusChange((status) => {
    mainWindow?.webContents.send('godot:statusChange', status)
  })

  mainWindow.on('resize', () => mainWindow && persistBounds(mainWindow))
  mainWindow.on('move', () => mainWindow && persistBounds(mainWindow))
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ── Global hotkeys (work even when DevPad is not focused) ─────────────────────

function registerHotkeys(): void {
  const send = (action: 'run' | 'stop' | 'restart') => {
    mainWindow?.webContents.send('hotkey', action)
  }
  // F5 → Run, F6 → Stop, F7 → Restart. We perform the action AND notify the
  // renderer so the UI reflects the new state.
  globalShortcut.register('F5', () => {
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
    stopGodot()
    send('stop')
  })
  globalShortcut.register('F7', () => {
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

function registerIpc(): void {
  // Config
  ipcMain.handle('config:getAll', () => getConfig())
  ipcMain.handle('config:get', (_e, key: keyof DevPadConfig) => store.get(key))
  ipcMain.handle('config:set', (_e, key: keyof DevPadConfig, value: unknown) => {
    store.set(key as keyof DevPadConfig, value as never)
  })
  ipcMain.handle('config:setMany', (_e, partial: Partial<DevPadConfig>) => setMany(partial))

  // Godot launcher
  ipcMain.handle('godot:run', () => {
    try {
      return runGodot()
    } catch (err) {
      return {
        ...getGodotStatus(),
        message: err instanceof GodotLaunchError ? err.message : String(err),
      }
    }
  })
  ipcMain.handle('godot:stop', () => stopGodot())
  ipcMain.handle('godot:restart', () => {
    try {
      return restartGodot()
    } catch (err) {
      return {
        ...getGodotStatus(),
        message: err instanceof GodotLaunchError ? err.message : String(err),
      }
    }
  })
  ipcMain.handle('godot:status', () => getGodotStatus())

  // AI
  ipcMain.handle('ai:send', (_e, req: AiRequest) => route(req))
  ipcMain.handle('ai:test', (_e, provider: ProviderId) =>
    testProvider(provider, getConfig().apiKeys),
  )

  // Files
  ipcMain.handle('files:list', (_e, dir: string) => listDir(dir))
  ipcMain.handle('files:read', (_e, p: string) => readFileText(p))
  ipcMain.handle('files:openExternal', (_e, p: string) => openExternal(p))

  // Capture
  ipcMain.handle('capture:godot', () => captureGodotWindow())

  // Dialogs
  ipcMain.handle('dialog:pickFile', async (_e, opts?: { title?: string }) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: opts?.title ?? 'Select a file',
      properties: ['openFile'],
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  ipcMain.handle('dialog:pickFolder', async (_e, opts?: { title?: string }) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: opts?.title ?? 'Select a folder',
      properties: ['openDirectory'],
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  // MCP
  ipcMain.handle('mcp:status', () => getMcpStatus())
  ipcMain.handle('mcp:setEnabled', async (_e, value: boolean) => {
    store.set('mcpEnabled', value)
    return setMcpEnabled(value)
  })

  // Versions
  ipcMain.handle('versions:getAll', () => loadVersions())
  ipcMain.handle('versions:check', async () => {
    const outcome = await checkForUpdates()
    return { updated: outcome.added.length > 0, added: outcome.added, file: outcome.file }
  })

  // Window / multi-monitor
  ipcMain.handle('window:getDisplays', () => getDisplayInfos())
  ipcMain.handle('window:setMonitor', (_e, position: MonitorPosition) => {
    store.set('monitorPosition', position)
    if (mainWindow) applyMonitorPosition(mainWindow, position)
  })
}

// ── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  ensureDefaultProfiles()
  registerIpc()
  createWindow()
  registerHotkeys()

  // Start the MCP server automatically if enabled in settings.
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  stopGodot()
})
