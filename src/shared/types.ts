// Shared type definitions used by BOTH the Electron main process and the React
// renderer. Keep this file free of any runtime imports from electron/node so it
// can be safely bundled into the renderer.

// ── Models ────────────────────────────────────────────────────────────────

export type ProviderId = 'deepseek' | 'gemini' | 'openai' | 'anthropic' | 'mcp'

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

export type ChatMode = 'plan' | 'build'
export type AgentMode = 'chat' | 'ask' | 'auto'

export interface AiRequest {
  /** The user's text prompt. May be empty when only a screenshot is supplied. */
  text: string
  /** Base64-encoded PNG (no data: prefix) when a screenshot is attached. */
  screenshot?: string | null
  /** Prior conversation turns, oldest first, for context. */
  history?: ChatMessageInput[]
  /** When true the router uses the file_analysis task slot. */
  fileAnalysis?: boolean
  /**
   * 'plan' = collaborate on a plan, never emit file/scene edits.
   * 'build' (default) = may emit zirtola-edit / zirtola-scene blocks.
   */
  mode?: ChatMode
  /** Correlates streamed ai:progress events back to this request. */
  requestId?: string
}

/**
 * Live progress emitted while the AI works, so the UI shows real activity
 * instead of a static "Thinking…".
 *  - 'status' → a short human phase label ("Reading your project…")
 *  - 'tool'   → the AI invoked a file tool (label = what it's doing)
 *  - 'delta'  → a chunk of streamed assistant text (append to the bubble)
 */
export interface AiProgressEvent {
  requestId: string
  kind: 'status' | 'tool' | 'delta'
  /** For 'delta': the text chunk. For 'status'/'tool': a display label. */
  text: string
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
  /**
   * True when checkpoints are enabled but the safety snapshot could NOT be
   * created (e.g. git unavailable) — the edit still applied, but there's no
   * undo point, so the UI must warn the user.
   */
  checkpointFailed?: boolean
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

// ── Scene editing (via the editor addon) ─────────────────────────────────────

export interface SceneOp {
  op: 'add_node' | 'set_property' | 'attach_script' | 'remove_node'
  /** Target node path within the scene (for set_property/attach_script/remove_node). */
  node?: string
  /** For add_node. */
  type?: string
  name?: string
  parent?: string
  properties?: Record<string, unknown>
  /** For set_property. */
  property?: string
  value?: unknown
  /** For add_node / attach_script. */
  script?: string
}

export interface SceneEditProposal {
  /** res:// scene to open before applying (optional; defaults to current). */
  scene?: string
  ops: SceneOp[]
}

export interface ApplySceneOpsResult {
  ok: boolean
  applied?: number
  error?: string
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
  anthropic: string
}

/**
 * The active model choice: a provider plus a cheap/mild/expensive tier. Resolved
 * to a concrete API model via src/lib/providerTiers.ts. Replaces the old
 * per-task "profiles" system as the single model control.
 */
export interface ModelSelection {
  provider: ProviderId
  tier: 'cheap' | 'mild' | 'expensive'
}

export type MonitorPosition = 'auto' | 0 | 1 | 2 | 3
export type GodotWindowMode = 'separate' | 'embedded'

export interface EmbedRect {
  x: number
  y: number
  width: number
  height: number
  /** devicePixelRatio so the main process can convert CSS px → physical px. */
  dpr: number
}

export interface EmbedStatus {
  /** True on Windows where reparenting is possible. */
  supported: boolean
  /** Why embedding is unavailable, when supported === false. */
  reason?: string
  /** True when a Godot window is currently embedded. */
  active: boolean
  message?: string
}

export interface DevPadConfig {
  setupComplete: boolean
  /** Whether the interactive product tour has been completed/dismissed. */
  tourComplete: boolean
  /**
   * AI autonomy:
   *  - 'chat' = read-only, never proposes file/scene edits
   *  - 'ask'  = proposes edits the user approves one by one (default)
   *  - 'auto' = applies proposed edits automatically (still checkpointed)
   */
  agentMode: AgentMode
  apiKeys: ApiKeys
  godotExecutablePath: string
  projectDir: string
  /** Recently-opened project folders, most-recent first. */
  recentProjects: string[]
  activeVersionId: string
  /**
   * Active model choice (provider + cheap/mild/expensive tier). The single model
   * control. Optional so older configs migrate cleanly (see migrateConfig in
   * electron/store.ts); resolved via resolveModel(), which falls back to the
   * default when unset. `activeProfileId`/`profiles` are legacy (kept for
   * back-compat with older configs) and no longer drive routing.
   */
  modelSelection?: ModelSelection
  activeProfileId: string
  profiles: ModelProfile[]
  notes: Note[]
  /** Take a git checkpoint before the AI writes files (undo safety net). */
  checkpointsEnabled: boolean
  mcpEnabled: boolean
  /**
   * How the Godot game window is presented:
   *  - 'separate'  = its own OS window (reliable, all platforms) [default]
   *  - 'embedded'  = reparented into a pane inside Zirtola (Windows only, experimental)
   */
  godotWindowMode: GodotWindowMode
  monitorPosition: MonitorPosition
  windowBounds?: { width: number; height: number; x?: number; y?: number }
  /** EULA version the user accepted in-app ('' = not yet accepted). */
  eulaAcceptedVersion: string
  /** UX hint that a trial was used on this machine (server is source of truth). */
  trialState: '' | 'used'
  /** Persisted chat transcript so conversations survive restart/update. */
  chatMessages: PersistedChatMessage[]
}

/** A chat turn persisted to config (screenshots are dropped to keep it small). */
export interface PersistedChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  modelLabel?: string
  error?: boolean
  needsSettings?: boolean
  autoApply?: boolean
}

// ── Licensing ────────────────────────────────────────────────────────────────

/** Full signed license payload returned by the zirtola.com licensing API. */
export interface LicenseInfo {
  valid: boolean
  key: string
  product: string
  productName: string
  type: string
  expiresAt: string | null
  maxActivations: number
  seatsUsed: number
  issuedAt: string
  signature: string
}

export type LicenseState =
  /** Talking to the licensing server. */
  | 'checking'
  /** Valid license verified online — app runs with full (trial/pro) access. */
  | 'licensed'
  /** No key/trial on this machine — show the welcome/activation screen. */
  | 'needs_key'
  /** Revoked / paid-license expired — blocked with account link + free fallback. */
  | 'blocked'
  /** Network unreachable — retryable. */
  | 'offline'
  /** Licensing server failure (5xx etc.) — retryable, NOT a bad key. */
  | 'server_error'
  /** Free tier: app runs with core features; Pro features locked. */
  | 'free'

/**
 * Access tier:
 *  - 'trial' — full Pro access on a 7-day trial license
 *  - 'pro'   — any valid non-trial license (one-time key or subscription)
 *  - 'free'  — post-trial (or opted-in) limited tier; BYOK AI + core features
 */
export type Tier = 'trial' | 'pro' | 'free'

export interface LicenseStatus {
  state: LicenseState
  /** Access tier when the app is allowed to run (licensed/free states). */
  tier?: Tier
  /** Whole days until the trial ends (0 = ends today). Trial tier only. */
  trialDaysLeft?: number
  /** Sanitised license details for display (key is masked). */
  info?: {
    key: string
    productName: string
    type: string
    expiresAt: string | null
    maxActivations: number
    seatsUsed: number
  }
  /** Human-readable status/error message for the UI. */
  message?: string
  /** Machine-readable error code when a license error occurred. */
  errorCode?: string
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
  license: {
    getStatus(): Promise<LicenseStatus>
    /** Activate a key on this machine. Resolves to the resulting status. */
    activate(key: string): Promise<LicenseStatus>
    /** One-click 7-day Pro trial for this machine (no key, no card). */
    startTrial(): Promise<LicenseStatus>
    /** Continue on the limited Free tier (post-trial / blocked fallback). */
    continueFree(): Promise<LicenseStatus>
    /** Re-run the online validation (Retry buttons). */
    revalidate(): Promise<LicenseStatus>
    /** Release this device's seat. */
    deactivate(): Promise<{ ok: boolean; seatsUsed?: number; error?: string }>
    /** Open the zirtola.com account page in the default browser. */
    openAccount(): Promise<void>
    /** Open the public pricing page in the default browser. */
    openPricing(): Promise<void>
    onStatus(cb: (s: LicenseStatus) => void): () => void
  }
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
    /** Live progress for the in-flight request (match on requestId). */
    onProgress(cb: (e: AiProgressEvent) => void): () => void
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
  embed: {
    /** Report the pane rect (CSS px + dpr) where Godot should be embedded. */
    setBounds(rect: EmbedRect): Promise<void>
    /** Detach the embedded Godot window (back to a separate window). */
    clear(): Promise<void>
    getStatus(): Promise<EmbedStatus>
    onStatus(cb: (s: EmbedStatus) => void): () => void
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
