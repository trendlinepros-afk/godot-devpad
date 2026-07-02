import { contextBridge, ipcRenderer } from 'electron'
import type {
  AiRequest,
  DevPadBridge,
  DevPadConfig,
  FileEdit,
  GodotStatus,
  GodotLogEntry,
  GodotDownloadProgress,
  BridgeStatus,
  BridgeEvent,
  GenerateAssetRequest,
  MonitorPosition,
  EmbedRect,
  EmbedStatus,
  LicenseStatus,
  ProviderId,
  UpdateStatus,
} from '@shared/types'

// The ONLY bridge between the sandboxed renderer and the main process. Every
// capability the UI has is funnelled through here via ipcRenderer.invoke — the
// renderer has no direct access to Node, electron-store, child_process, or any
// network/provider SDK (contextIsolation + nodeIntegration:false).

const bridge: DevPadBridge = {
  license: {
    getStatus: () => ipcRenderer.invoke('license:status'),
    activate: (key: string) => ipcRenderer.invoke('license:activate', key),
    startTrial: () => ipcRenderer.invoke('license:startTrial'),
    continueFree: () => ipcRenderer.invoke('license:continueFree'),
    revalidate: () => ipcRenderer.invoke('license:revalidate'),
    deactivate: () => ipcRenderer.invoke('license:deactivate'),
    openAccount: () => ipcRenderer.invoke('license:openAccount'),
    openPricing: () => ipcRenderer.invoke('license:openPricing'),
    onStatus: (cb) => {
      const listener = (_e: unknown, s: LicenseStatus) => cb(s)
      ipcRenderer.on('license:status', listener)
      return () => ipcRenderer.removeListener('license:status', listener)
    },
  },
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
  assets: {
    generate: (req: GenerateAssetRequest) => ipcRenderer.invoke('assets:generate', req),
    save: (base64: string, name: string) => ipcRenderer.invoke('assets:save', base64, name),
  },
  bridge: {
    getStatus: () => ipcRenderer.invoke('bridge:status'),
    installAddon: () => ipcRenderer.invoke('bridge:installAddon'),
    request: (method: string, params?: Record<string, unknown>) =>
      ipcRenderer.invoke('bridge:request', method, params),
    onStatus: (cb) => {
      const listener = (_e: unknown, s: BridgeStatus) => cb(s)
      ipcRenderer.on('bridge:status', listener)
      return () => ipcRenderer.removeListener('bridge:status', listener)
    },
    onEvent: (cb) => {
      const listener = (_e: unknown, ev: BridgeEvent) => cb(ev)
      ipcRenderer.on('bridge:event', listener)
      return () => ipcRenderer.removeListener('bridge:event', listener)
    },
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
  embed: {
    setBounds: (rect: EmbedRect) => ipcRenderer.invoke('embed:setBounds', rect),
    clear: () => ipcRenderer.invoke('embed:clear'),
    getStatus: () => ipcRenderer.invoke('embed:status'),
    onStatus: (cb) => {
      const listener = (_e: unknown, s: EmbedStatus) => cb(s)
      ipcRenderer.on('embed:status', listener)
      return () => ipcRenderer.removeListener('embed:status', listener)
    },
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
