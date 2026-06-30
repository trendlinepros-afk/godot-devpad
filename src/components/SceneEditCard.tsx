import { useEffect, useRef, useState } from 'react'
import type { SceneEditProposal, SceneOp, ApplySceneOpsResult } from '@shared/types'
import { useApp } from '../state/app'
import { useToast } from './Toast'
import { CheckIcon, XIcon } from './Icons'

// Renders an AI-proposed set of scene operations. Applying runs them THROUGH the
// Godot editor (via the bridge addon), which validates and saves the scene — so
// the AI never hand-edits the .tscn text. A git checkpoint is taken first.

interface Props {
  proposal: SceneEditProposal
  /** When true (Auto mode) and the editor is connected, apply automatically. */
  autoApply?: boolean
}

type Status = 'pending' | 'applied' | 'rejected' | 'error'

function describe(op: SceneOp): string {
  switch (op.op) {
    case 'add_node':
      return `Add ${op.type ?? 'Node'} "${op.name ?? op.type}"${op.parent && op.parent !== '.' ? ` under ${op.parent}` : ''}${op.script ? ` (script ${op.script})` : ''}`
    case 'set_property':
      return `Set ${op.node}.${op.property} = ${JSON.stringify(op.value)}`
    case 'attach_script':
      return `Attach ${op.script} to ${op.node}`
    case 'remove_node':
      return `Remove ${op.node}`
    default:
      return JSON.stringify(op)
  }
}

export function SceneEditCard({ proposal, autoApply = false }: Props) {
  const { bridgeStatus, config } = useApp()
  const { toast } = useToast()
  const [status, setStatus] = useState<Status>('pending')
  const [error, setError] = useState<string | null>(null)

  const connected = bridgeStatus.connected

  const apply = async () => {
    if (!connected) return
    // Safety checkpoint first (if enabled), then apply through the editor.
    if (config?.checkpointsEnabled) {
      await window.devpad.git.checkpoint('Before scene edit')
    }
    try {
      const res = await window.devpad.bridge.request<ApplySceneOpsResult>('apply_scene_ops', {
        scene: proposal.scene,
        ops: proposal.ops,
      })
      if (res.ok) {
        setStatus('applied')
        toast(`Applied ${res.applied ?? proposal.ops.length} scene change(s)`, 'success')
      } else {
        setStatus('error')
        setError(res.error ?? 'Scene edit failed')
        toast(res.error ?? 'Scene edit failed', 'error')
      }
    } catch (err) {
      setStatus('error')
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      toast(msg, 'error')
    }
  }

  // Auto mode: apply once when connected (scene edits require the editor bridge).
  const autoApplied = useRef(false)
  useEffect(() => {
    if (autoApply && connected && status === 'pending' && !autoApplied.current) {
      autoApplied.current = true
      apply()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoApply, connected, status])

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-panel-600 bg-panel-900">
      <div className="flex items-center gap-2 border-b border-panel-700 bg-panel-850 px-3 py-2">
        <span className="rounded bg-sky-900/40 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">
          SCENE
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-slate-200">
          {proposal.scene ?? 'Current scene'}
        </span>
        <span className="shrink-0 text-[11px] text-slate-500">{proposal.ops.length} change(s)</span>
      </div>

      <ul className="space-y-1 px-3 py-2 text-[12px]">
        {proposal.ops.map((op, i) => (
          <li key={i} className="flex items-start gap-2 text-slate-300">
            <span className="text-slate-600">•</span>
            <span className="break-words">{describe(op)}</span>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-2 border-t border-panel-700 bg-panel-850 px-3 py-2">
        {status === 'applied' ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
            <CheckIcon width={14} height={14} /> Applied
          </span>
        ) : status === 'rejected' ? (
          <span className="text-xs text-slate-500">Rejected</span>
        ) : status === 'error' ? (
          <span className="text-xs text-red-300">{error}</span>
        ) : (
          <>
            <button
              onClick={apply}
              disabled={!connected}
              title={connected ? '' : 'Connect the Godot editor (Engine tab) to apply scene edits'}
              className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              <CheckIcon width={13} height={13} /> Apply in editor
            </button>
            <button
              onClick={() => setStatus('rejected')}
              className="flex items-center gap-1.5 rounded-md border border-panel-600 px-3 py-1 text-xs text-slate-300 hover:bg-panel-700"
            >
              <XIcon width={13} height={13} /> Reject
            </button>
            <span className="ml-auto text-[11px] text-slate-600">
              {connected ? 'Applied via Godot · checkpoint first' : 'Godot editor not connected'}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
