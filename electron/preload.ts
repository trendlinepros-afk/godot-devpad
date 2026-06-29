import { contextBridge, ipcRenderer } from 'electron'
import type {
  AiRequest,
  DevPadBridge,
  DevPadConfig,
  FileEdit,
  GodotStatus,
  GodotLogEntry,
  GodotDownloadProgress,
  MonitorPosition,
  ProviderId,
  UpdateStatus,
} from '@shared/types'

// The ONLY bridge between the sandboxed renderer and the main process. Every
// capability the UI has is funnelled through here via ipcRenderer.invoke — the
// renderer has no direct access to Node, electron-store, child_process, or any
// network/provider SDK (contextIsolation + nodeIntegration:false).

const bridge: DevPadBridge = {
  config: {
    getAll: () => ipcRenderer.invoke('config:getAll'),
    get: (key) => ipcRenderer.invoke('config:get', key),
    set: (key, value) => ipcRenderer.invoke('config:set', key, value),
    setMany: (partial: Partial<DevPadConfig>) => ipcRenderer.invoke('config:setMany', partial),
  },
  godot: {
    run: () => ipcRenderer.invoke('godot:run'),
    stop: () => ipcRenderer.invoke('godot:stop'),
    restart: () => ipcRenderer.invoke('godot:restart'),
    status: () => ipcRenderer.invoke('godot:status'),
    onStatusChange: (cb: (s: GodotStatus) => void) => {
      const listener = (_e: unknown, status: GodotStatus) => cb(status)
      ipcRenderer.on('godot:statusChange', listener)
      return () => ipcRenderer.removeListener('godot:statusChange', listener)
    },
    getLogs: () => ipcRenderer.invoke('godot:getLogs'),
    clearLogs: () => ipcRenderer.invoke('godot:clearLogs'),
    onLog: (cb: (entry: GodotLogEntry) => void) => {
      const listener = (_e: unknown, entry: GodotLogEntry) => cb(entry)
      ipcRenderer.on('godot:log', listener)
      return () => ipcRenderer.removeListener('godot:log', listener)
    },
  },
  godotInstall: {
    detect: () => ipcRenderer.invoke('godotInstall:detect'),
    download: () => ipcRenderer.invoke('godotInstall:download'),
    onDownloadProgress: (cb: (p: GodotDownloadProgress) => void) => {
      const listener = (_e: unknown, p: GodotDownloadProgress) => cb(p)
      ipcRenderer.on('godotInstall:progress', listener)
      return () => ipcRenderer.removeListener('godotInstall:progress', listener)
    },
    openDownloadPage: () => ipcRenderer.invoke('godotInstall:openDownloadPage'),
  },
  ai: {
    send: (req: AiRequest) => ipcRenderer.invoke('ai:send', req),
    testConnection: (provider: ProviderId) => ipcRenderer.invoke('ai:test', provider),
  },
  files: {
    list: (dir: string) => ipcRenderer.invoke('files:list', dir),
    read: (p: string) => ipcRenderer.invoke('files:read', p),
    openExternal: (p: string) => ipcRenderer.invoke('files:openExternal', p),
    applyEdit: (edit: FileEdit) => ipcRenderer.invoke('files:applyEdit', edit),
  },
  git: {
    state: () => ipcRenderer.invoke('git:state'),
    checkpoint: (message: string) => ipcRenderer.invoke('git:checkpoint', message),
    list: () => ipcRenderer.invoke('git:list'),
    restore: (hash: string) => ipcRenderer.invoke('git:restore', hash),
  },
  capture: {
    captureGodot: () => ipcRenderer.invoke('capture:godot'),
  },
  dialog: {
    pickFile: (opts) => ipcRenderer.invoke('dialog:pickFile', opts),
    pickFolder: (opts) => ipcRenderer.invoke('dialog:pickFolder', opts),
  },
  mcp: {
    getStatus: () => ipcRenderer.invoke('mcp:status'),
    setEnabled: (enabled: boolean) => ipcRenderer.invoke('mcp:setEnabled', enabled),
  },
  updates: {
    getStatus: () => ipcRenderer.invoke('updates:status'),
    check: () => ipcRenderer.invoke('updates:check'),
    download: () => ipcRenderer.invoke('updates:download'),
    install: () => ipcRenderer.invoke('updates:install'),
    onStatus: (cb) => {
      const listener = (_e: unknown, status: UpdateStatus) => cb(status)
      ipcRenderer.on('updates:status', listener)
      return () => ipcRenderer.removeListener('updates:status', listener)
    },
  },
  projects: {
    createNew: (dir: string) => ipcRenderer.invoke('project:createNew', dir),
    validate: (dir: string) => ipcRenderer.invoke('project:validate', dir),
  },
  versions: {
    getAll: () => ipcRenderer.invoke('versions:getAll'),
    checkUpdates: () => ipcRenderer.invoke('versions:check'),
  },
  window: {
    getDisplays: () => ipcRenderer.invoke('window:getDisplays'),
    setMonitor: (position: MonitorPosition) => ipcRenderer.invoke('window:setMonitor', position),
  },
  events: {
    onHotkey: (cb) => {
      const listener = (_e: unknown, action: 'run' | 'stop' | 'restart') => cb(action)
      ipcRenderer.on('hotkey', listener)
      return () => ipcRenderer.removeListener('hotkey', listener)
    },
    onVersionsUpdated: (cb) => {
      const listener = (_e: unknown, added: string[]) => cb(added)
      ipcRenderer.on('versions:updated', listener)
      return () => ipcRenderer.removeListener('versions:updated', listener)
    },
  },
}

contextBridge.exposeInMainWorld('devpad', bridge)
