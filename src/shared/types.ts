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

// ── Godot output / logs ──────────────────────────────────────────────────────

export type LogLevel = 'info' | 'warn' | 'error'

export interface GodotLogEntry {
  id: number
  level: LogLevel
  text: string
  /** res:// path parsed out of a GDScript error, when present. */
  file?: string
  line?: number
  ts: number
}

// ── Godot install / detection ────────────────────────────────────────────────

export interface DetectedGodot {
  path: string
  /** Best-effort version label parsed from the filename, e.g. "v4.3". */
  version?: string
  source: string
}

export type GodotDownloadPhase =
  | 'idle'
  | 'resolving'
  | 'downloading'
  | 'extracting'
  | 'done'
  | 'error'

export interface GodotDownloadProgress {
  phase: GodotDownloadPhase
  percent?: number
  message?: string
  /** Set when phase === 'done'. */
  executablePath?: string
  error?: string
}

// ── Notes ─────────────────────────────────────────────────────────────────────

export interface Note {
  id: string
  title: string
  /** Markdown body. */
  content: string
  /**
   * When true the note is shared as context with EVERY AI request (and exposed
   * over the MCP server) so all models understand the bigger picture / roadmap.
   */
  pinnedToAi: boolean
  createdAt: number
  updatedAt: number
}

// ── App self-update ──────────────────────────────────────────────────────────

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'unsupported'

export interface UpdateStatus {
  state: UpdateState
  /** The currently-installed app version. */
  version: string
  /** The newer version available on GitHub, when state is available/downloaded. */
  newVersion?: string
  /** Download progress 0–100 while downloading. */
  percent?: number
  /** Release notes for the available update, if provided. */
  notes?: string
  error?: string
}

// ── Agentic edits + checkpoints ──────────────────────────────────────────────

export interface FileEdit {
  /** res:// path (or project-relative) the AI wants to write. */
  path: string
  /** The COMPLETE new contents of the file. */
  contents: string
}

export interface ApplyEditResult {
  ok: boolean
  /** Absolute path written, on success. */
  path?: string
  /** Hash of the safety checkpoint taken before the write, if any. */
  checkpoint?: string
  error?: string
}

export interface GitCheckpoint {
  hash: string
  message: string
  /** Unix ms. */
  ts: number
}

export interface GitState {
  repo: boolean
}

// ── Asset generation ─────────────────────────────────────────────────────────

export type AssetKind = 'sprite' | 'tileset' | 'background' | 'icon' | 'concept'

export interface GenerateAssetRequest {
  prompt: string
  kind: AssetKind
  /** "1024x1024" | "1024x1536" | "1536x1024". */
  size: string
}

export interface GenerateAssetResult {
  ok: boolean
  /** Base64 PNG (no data: prefix). */
  base64?: string
  error?: string
  /** True when the failure is a missing OpenAI key (point user to Settings). */
  needsSettings?: boolean
}

export interface SaveAssetResult {
  ok: boolean
  /** res:// path the asset was saved to. */
  resPath?: string
  /** Absolute path on disk. */
  path?: string
  error?: string
}

// ── Godot editor bridge (addon) ──────────────────────────────────────────────

export interface BridgeStatus {
  connected: boolean
  port: number
  godotVersion?: string
  projectName?: string
}

export interface SceneNode {
  name: string
  type: string
  /** Node path within the edited scene, e.g. "/root/Player/Sprite2D". */
  path: string
  /** res:// path of the script attached to this node, if any. */
  script?: string
  children: SceneNode[]
}

/** A push event from the Godot addon (errors, scene changes, etc.). */
export interface BridgeEvent {
  type: string
  [key: string]: unknown
}

export interface AddonInstallResult {
  ok: boolean
  error?: string
  /** True when the addon was newly written/updated (vs already present). */
  installed?: boolean
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
  /** Recently-opened project folders, most-recent first. */
  recentProjects: string[]
  activeVersionId: string
  activeProfileId: string
  profiles: ModelProfile[]
  notes: Note[]
  /** Take a git checkpoint before the AI writes files (undo safety net). */
  checkpointsEnabled: boolean
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
    getLogs(): Promise<GodotLogEntry[]>
    clearLogs(): Promise<void>
    onLog(cb: (entry: GodotLogEntry) => void): () => void
  }
  godotInstall: {
    /** Scan the machine for an existing Godot executable. */
    detect(): Promise<DetectedGodot[]>
    /** Download + extract the latest stable Godot, returning the exe path. */
    download(): Promise<GodotDownloadProgress>
    onDownloadProgress(cb: (p: GodotDownloadProgress) => void): () => void
    /** Open the official Godot download page in the browser (fallback). */
    openDownloadPage(): Promise<void>
  }
  ai: {
    send(req: AiRequest): Promise<AiResponse>
    testConnection(provider: ProviderId): Promise<TestConnectionResult>
  }
  files: {
    list(dir: string): Promise<FileNode | null>
    read(path: string): Promise<{ ok: boolean; contents?: string; error?: string }>
    openExternal(path: string): Promise<void>
    /** Apply an AI-proposed edit (writes the file, checkpointing first). */
    applyEdit(edit: FileEdit): Promise<ApplyEditResult>
  }
  git: {
    state(): Promise<GitState>
    checkpoint(message: string): Promise<{ ok: boolean; hash?: string; error?: string }>
    list(): Promise<GitCheckpoint[]>
    restore(hash: string): Promise<{ ok: boolean; error?: string }>
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
  assets: {
    /** Generate an image asset from a text prompt (OpenAI image model). */
    generate(req: GenerateAssetRequest): Promise<GenerateAssetResult>
    /** Save a generated base64 PNG into the project's assets folder. */
    save(base64: string, name: string): Promise<SaveAssetResult>
  }
  bridge: {
    getStatus(): Promise<BridgeStatus>
    /** Install/enable the Zirtola Bridge addon in the active project. */
    installAddon(): Promise<AddonInstallResult>
    /** Send a JSON-RPC request to the connected Godot editor addon. */
    request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>
    onStatus(cb: (s: BridgeStatus) => void): () => void
    onEvent(cb: (e: BridgeEvent) => void): () => void
  }
  updates: {
    getStatus(): Promise<UpdateStatus>
    /** Check GitHub for a newer installer; auto-downloads if one is found. */
    check(): Promise<UpdateStatus>
    /** Manually trigger the download (no-op if already downloading/downloaded). */
    download(): Promise<UpdateStatus>
    /** Quit and install a downloaded update. */
    install(): Promise<void>
    onStatus(cb: (s: UpdateStatus) => void): () => void
  }
  projects: {
    /** Ensure a project.godot exists in dir (creating a minimal one), then open. */
    createNew(dir: string): Promise<{ ok: boolean; error?: string }>
    /** Validate a folder is usable as a project (exists). */
    validate(dir: string): Promise<{ ok: boolean; hasProjectFile: boolean }>
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
