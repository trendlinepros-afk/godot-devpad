// Shared type definitions used by BOTH the Electron main process and the React
// renderer. Keep this file free of any runtime imports from electron/node so it
// can be safely bundled into the renderer.

// ── Models ────────────────────────────────────────────────────────────────

export type ProviderId = 'deepseek' | 'gemini' | 'openai' | 'mcp'

export interface ModelCapabilities {
  chat: boolean
  vision: boolean
  code: boolean
}

export interface ModelDefinition {
  label: string
  provider: ProviderId
  capabilities: ModelCapabilities
}

export type ModelId =
  | 'deepseek-v3'
  | 'gemini-2.5-pro'
  | 'gemini-2.5-flash'
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'mcp-claude'

// ── Profiles ──────────────────────────────────────────────────────────────

export type TaskKind = 'chat' | 'vision' | 'vision_to_code' | 'file_analysis'

export interface ModelProfile {
  id: string
  name: string
  isDefault?: boolean
  tasks: {
    chat: ModelId | string
    vision: ModelId | string
    vision_to_code: ModelId | string
    file_analysis: ModelId | string
  }
}

// ── Godot versions ──────────────────────────────────────────────────────────

export interface GodotVersion {
  id: string
  label: string
  executableHint: string
  projectFile: string
  aiSystemPrompt: string
  launchFlags: string[]
}

export interface GodotVersionsFile {
  schemaVersion: number
  remoteUpdateUrl: string
  versions: GodotVersion[]
}

// ── AI requests / responses ─────────────────────────────────────────────────

export interface ChatMessageInput {
  role: 'user' | 'assistant'
  content: string
}

export interface AiRequest {
  /** The user's text prompt. May be empty when only a screenshot is supplied. */
  text: string
  /** Base64-encoded PNG (no data: prefix) when a screenshot is attached. */
  screenshot?: string | null
  /** Prior conversation turns, oldest first, for context. */
  history?: ChatMessageInput[]
  /** When true the router uses the file_analysis task slot. */
  fileAnalysis?: boolean
}

export interface AiResponse {
  ok: boolean
  /** Final assistant text (markdown). */
  text: string
  /** Model id that produced the FINAL answer, for the chat badge. */
  modelId?: string
  modelLabel?: string
  /** Set when ok === false. */
  error?: string
  /** When true the renderer should direct the user to Settings (missing key). */
  needsSettings?: boolean
}

// ── Godot launcher ──────────────────────────────────────────────────────────

export type GodotState = 'stopped' | 'running' | 'starting'

export interface GodotStatus {
  state: GodotState
  pid?: number
  detectedVersionId?: string | null
  message?: string
}

// ── File browser ─────────────────────────────────────────────────────────────

export interface FileNode {
  name: string
  path: string
  isDir: boolean
  /** Lower-case extension without the dot, e.g. "gd", "tscn". Dirs have ''. */
  ext: string
  /** Children are only populated for directories that have been expanded. */
  children?: FileNode[]
}

// ── MCP server ───────────────────────────────────────────────────────────────

export interface McpStatus {
  enabled: boolean
  running: boolean
  port: number
}

// ── Persistent config (electron-store schema) ───────────────────────────────

export interface ApiKeys {
  deepseek: string
  gemini: string
  openai: string
}

export type MonitorPosition = 'auto' | 0 | 1 | 2 | 3

export interface DevPadConfig {
  setupComplete: boolean
  apiKeys: ApiKeys
  godotExecutablePath: string
  projectDir: string
  activeVersionId: string
  activeProfileId: string
  profiles: ModelProfile[]
  mcpEnabled: boolean
  monitorPosition: MonitorPosition
  windowBounds?: { width: number; height: number; x?: number; y?: number }
}

export interface DisplayInfo {
  index: number
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  primary: boolean
}

export interface TestConnectionResult {
  ok: boolean
  message: string
}

// ── Preload bridge surface (window.devpad) ───────────────────────────────────

export interface DevPadBridge {
  config: {
    getAll(): Promise<DevPadConfig>
    get<K extends keyof DevPadConfig>(key: K): Promise<DevPadConfig[K]>
    set<K extends keyof DevPadConfig>(key: K, value: DevPadConfig[K]): Promise<void>
    setMany(partial: Partial<DevPadConfig>): Promise<DevPadConfig>
  }
  godot: {
    run(): Promise<GodotStatus>
    stop(): Promise<GodotStatus>
    restart(): Promise<GodotStatus>
    status(): Promise<GodotStatus>
    onStatusChange(cb: (s: GodotStatus) => void): () => void
  }
  ai: {
    send(req: AiRequest): Promise<AiResponse>
    testConnection(provider: ProviderId): Promise<TestConnectionResult>
  }
  files: {
    list(dir: string): Promise<FileNode | null>
    read(path: string): Promise<{ ok: boolean; contents?: string; error?: string }>
    openExternal(path: string): Promise<void>
  }
  capture: {
    captureGodot(): Promise<{ ok: boolean; screenshot?: string; source?: string; error?: string }>
  }
  dialog: {
    pickFile(opts?: { title?: string }): Promise<string | null>
    pickFolder(opts?: { title?: string }): Promise<string | null>
  }
  mcp: {
    getStatus(): Promise<McpStatus>
    setEnabled(enabled: boolean): Promise<McpStatus>
  }
  versions: {
    getAll(): Promise<GodotVersionsFile>
    checkUpdates(): Promise<{ updated: boolean; added: string[]; file: GodotVersionsFile }>
  }
  window: {
    getDisplays(): Promise<DisplayInfo[]>
    setMonitor(position: MonitorPosition): Promise<void>
  }
  events: {
    /** Fired when a global hotkey (F5/F6/F7) is pressed. */
    onHotkey(cb: (action: 'run' | 'stop' | 'restart') => void): () => void
    /** Fired when version definitions are merged from remote. */
    onVersionsUpdated(cb: (added: string[]) => void): () => void
  }
}

declare global {
  interface Window {
    devpad: DevPadBridge
  }
}
