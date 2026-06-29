import { useCallback, useEffect, useState } from 'react'
import type { SceneNode } from '@shared/types'
import { useApp } from '../state/app'
import { useToast } from './Toast'
import { chatBus } from '../state/chatBus'
import {
  PlayIcon,
  StopIcon,
  RefreshIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  SparkleIcon,
} from './Icons'

// Live view of the running Godot editor via the Zirtola Bridge addon. When the
// addon is connected we can read the scene tree and capture the editor viewport
// — engine-aware context an OS screenshot can't give.

interface Props {
  onShowChat: () => void
}

export function EnginePanel({ onShowChat }: Props) {
  const { bridgeStatus } = useApp()
  const { toast } = useToast()
  const [tree, setTree] = useState<SceneNode | null>(null)
  const [treeLoaded, setTreeLoaded] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [busy, setBusy] = useState(false)

  const connected = bridgeStatus.connected

  const refreshTree = useCallback(async () => {
    if (!connected) return
    try {
      const res = await window.devpad.bridge.request<{ tree: SceneNode | null }>('get_scene_tree')
      setTree(res.tree)
      setTreeLoaded(true)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to read scene tree', 'error')
    }
  }, [connected, toast])

  useEffect(() => {
    if (connected) refreshTree()
    else {
      setTree(null)
      setTreeLoaded(false)
    }
  }, [connected, refreshTree])

  const install = async () => {
    setInstalling(true)
    const res = await window.devpad.bridge.installAddon()
    setInstalling(false)
    if (res.ok) {
      toast('Bridge addon installed. Open (or reload) the project in Godot to connect.', 'success')
    } else {
      toast(res.error ?? 'Could not install the addon', 'error')
    }
  }

  const call = async (method: string, okMsg: string) => {
    setBusy(true)
    try {
      await window.devpad.bridge.request(method)
      toast(okMsg, 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : `Failed: ${method}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const captureViewport = async () => {
    setBusy(true)
    try {
      const res = await window.devpad.bridge.request<{ png_base64?: string }>('capture_viewport')
      if (res.png_base64) {
        chatBus.attach(res.png_base64)
        onShowChat()
        toast('Editor viewport attached to chat', 'success')
      } else {
        toast('Capture returned no image', 'error')
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Capture failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col bg-panel-850">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-panel-600 px-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Engine</span>
        {connected && (
          <button
            onClick={refreshTree}
            title="Refresh scene tree"
            className="grid h-6 w-6 place-items-center rounded text-slate-400 hover:bg-panel-600 hover:text-slate-200"
          >
            <RefreshIcon width={14} height={14} />
          </button>
        )}
      </div>

      {/* Connection status */}
      <div className="flex items-center gap-2 border-b border-panel-700 px-3 py-2 text-xs">
        <span
          className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-slate-600'}`}
        />
        <span className={connected ? 'text-emerald-300' : 'text-slate-400'}>
          {connected ? 'Connected to Godot' : 'Not connected'}
        </span>
        {connected && bridgeStatus.godotVersion && (
          <span className="ml-auto text-[11px] text-slate-500">v{bridgeStatus.godotVersion}</span>
        )}
      </div>

      {!connected ? (
        <div className="space-y-3 p-3 text-sm">
          <p className="text-xs leading-relaxed text-slate-400">
            The Zirtola Bridge addon links this panel to the Godot editor for the live scene tree,
            in-editor screenshots, and run/reload control.
          </p>
          <button
            onClick={install}
            disabled={installing}
            className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {installing ? 'Installing…' : 'Install Bridge addon'}
          </button>
          <p className="text-[11px] leading-relaxed text-slate-500">
            After installing, open (or reload) your project in Godot. The addon connects
            automatically on <span className="font-mono">ws://127.0.0.1:{bridgeStatus.port}</span>.
          </p>
        </div>
      ) : (
        <>
          {/* Quick actions */}
          <div className="flex flex-wrap gap-1.5 border-b border-panel-700 p-2">
            <ActionButton icon={<PlayIcon width={13} height={13} />} label="Run" disabled={busy} onClick={() => call('run', 'Playing main scene')} />
            <ActionButton icon={<StopIcon width={13} height={13} />} label="Stop" disabled={busy} onClick={() => call('stop', 'Stopped')} />
            <ActionButton icon={<RefreshIcon width={13} height={13} />} label="Reload" disabled={busy} onClick={() => call('reload', 'Rescanned project files')} />
            <ActionButton icon={<SparkleIcon width={13} height={13} />} label="Capture → chat" disabled={busy} onClick={captureViewport} />
          </div>

          {/* Scene tree */}
          <div className="min-h-0 flex-1 overflow-auto py-1 text-sm">
            {!treeLoaded ? (
              <p className="px-3 py-2 text-xs text-slate-500">Loading scene…</p>
            ) : tree ? (
              <SceneTree node={tree} depth={0} />
            ) : (
              <p className="px-3 py-2 text-xs text-slate-500">
                No scene is open in the Godot editor.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function ActionButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1 rounded-md border border-panel-600 bg-panel-700 px-2 py-1 text-xs text-slate-200 hover:bg-panel-600 disabled:opacity-50"
    >
      {icon} {label}
    </button>
  )
}

function SceneTree({ node, depth }: { node: SceneNode; depth: number }) {
  const [open, setOpen] = useState(depth < 2)
  const hasChildren = node.children.length > 0
  return (
    <div>
      <div
        className="flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 hover:bg-panel-700"
        style={{ paddingLeft: depth * 12 + 6 }}
        onClick={() => hasChildren && setOpen((o) => !o)}
        title={node.script ? `Script: ${node.script}` : node.type}
      >
        <span className="grid w-3.5 place-items-center text-slate-500">
          {hasChildren ? (
            open ? (
              <ChevronDownIcon width={12} height={12} />
            ) : (
              <ChevronRightIcon width={12} height={12} />
            )
          ) : null}
        </span>
        <span className="truncate text-slate-200">{node.name}</span>
        <span className="truncate text-[11px] text-slate-500">{node.type}</span>
        {node.script && <span className="ml-1 text-[10px] text-emerald-400">gd</span>}
      </div>
      {open &&
        node.children.map((c) => <SceneTree key={c.path} node={c} depth={depth + 1} />)}
    </div>
  )
}
