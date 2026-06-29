import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type {
  DevPadConfig,
  GodotStatus,
  GodotVersionsFile,
  McpStatus,
  UpdateStatus,
  BridgeStatus,
} from '@shared/types'

// Central renderer state: the persisted config, the Godot version registry, live
// Godot process status and MCP server status. Everything is fetched from the
// main process over the preload bridge; this context just caches it for the UI
// and keeps it in sync.

interface AppState {
  ready: boolean
  config: DevPadConfig | null
  versions: GodotVersionsFile | null
  godotStatus: GodotStatus
  mcpStatus: McpStatus
  updateStatus: UpdateStatus
  bridgeStatus: BridgeStatus
  /** Persist a partial config update and refresh the cached copy. */
  update: (partial: Partial<DevPadConfig>) => Promise<void>
  refreshVersions: () => Promise<void>
  refreshMcp: () => Promise<void>
  setGodotStatus: (s: GodotStatus) => void
}

const AppContext = createContext<AppState | null>(null)

export function useApp(): AppState {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within <AppProvider>')
  return ctx
}

/** Convenience hook that returns a guaranteed-loaded config. */
export function useConfig(): [DevPadConfig, (p: Partial<DevPadConfig>) => Promise<void>] {
  const { config, update } = useApp()
  if (!config) throw new Error('config accessed before ready')
  return [config, update]
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<DevPadConfig | null>(null)
  const [versions, setVersions] = useState<GodotVersionsFile | null>(null)
  const [godotStatus, setGodotStatus] = useState<GodotStatus>({ state: 'stopped' })
  const [mcpStatus, setMcpStatus] = useState<McpStatus>({
    enabled: false,
    running: false,
    port: 3727,
  })
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({
    state: 'idle',
    version: '',
  })
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>({
    connected: false,
    port: 3728,
  })
  const [ready, setReady] = useState(false)

  const update = useCallback(async (partial: Partial<DevPadConfig>) => {
    const next = await window.devpad.config.setMany(partial)
    setConfig(next)
  }, [])

  const refreshVersions = useCallback(async () => {
    setVersions(await window.devpad.versions.getAll())
  }, [])

  const refreshMcp = useCallback(async () => {
    setMcpStatus(await window.devpad.mcp.getStatus())
  }, [])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const [cfg, vers, status, mcp, upd, bridge] = await Promise.all([
        window.devpad.config.getAll(),
        window.devpad.versions.getAll(),
        window.devpad.godot.status(),
        window.devpad.mcp.getStatus(),
        window.devpad.updates.getStatus(),
        window.devpad.bridge.getStatus(),
      ])
      if (!mounted) return
      setConfig(cfg)
      setVersions(vers)
      setGodotStatus(status)
      setMcpStatus(mcp)
      setUpdateStatus(upd)
      setBridgeStatus(bridge)
      setReady(true)
    })()

    const offStatus = window.devpad.godot.onStatusChange((s) => setGodotStatus(s))
    const offUpdate = window.devpad.updates.onStatus((s) => setUpdateStatus(s))
    const offBridge = window.devpad.bridge.onStatus((s) => setBridgeStatus(s))
    return () => {
      mounted = false
      offStatus()
      offUpdate()
      offBridge()
    }
  }, [])

  const value = useMemo<AppState>(
    () => ({
      ready,
      config,
      versions,
      godotStatus,
      mcpStatus,
      updateStatus,
      bridgeStatus,
      update,
      refreshVersions,
      refreshMcp,
      setGodotStatus,
    }),
    [
      ready,
      config,
      versions,
      godotStatus,
      mcpStatus,
      updateStatus,
      bridgeStatus,
      update,
      refreshVersions,
      refreshMcp,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
