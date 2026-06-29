import { useEffect, useState } from 'react'
import type { GitCheckpoint } from '@shared/types'
import { Modal } from './ModelProfileEditor'
import { useToast } from './Toast'
import { RestartIcon } from './Icons'

// History of automatic git checkpoints taken before AI edits. Restoring rolls
// the working tree back to a snapshot (and itself checkpoints first, so it's
// undoable).

interface Props {
  onClose: () => void
}

function relative(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(ts).toLocaleString()
}

export function CheckpointsModal({ onClose }: Props) {
  const { toast } = useToast()
  const [list, setList] = useState<GitCheckpoint[] | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => setList(await window.devpad.git.list())

  useEffect(() => {
    load()
  }, [])

  const snapshot = async () => {
    setBusy(true)
    const res = await window.devpad.git.checkpoint('Manual checkpoint')
    setBusy(false)
    if (res.ok) {
      toast('Checkpoint saved', 'success')
      load()
    } else {
      toast(res.error ?? 'Could not create checkpoint', 'error')
    }
  }

  const restore = async (c: GitCheckpoint) => {
    setBusy(true)
    const res = await window.devpad.git.restore(c.hash)
    setBusy(false)
    if (res.ok) {
      toast('Project restored to checkpoint', 'success')
      load()
    } else {
      toast(res.error ?? 'Restore failed', 'error')
    }
  }

  return (
    <Modal title="Checkpoints" onClose={onClose}>
      <div className="flex max-h-[60vh] flex-col">
        <div className="flex items-center justify-between border-b border-panel-600 px-4 py-3">
          <p className="text-xs leading-relaxed text-slate-500">
            Zirtola snapshots your project before each AI edit so you can roll back anytime.
            Restoring is itself undoable.
          </p>
          <button
            onClick={snapshot}
            disabled={busy}
            className="ml-3 shrink-0 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            Checkpoint now
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2">
          {list === null ? (
            <p className="p-4 text-sm text-slate-500">Loading…</p>
          ) : list.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">
              No checkpoints yet. They're created automatically before the AI edits a file.
            </p>
          ) : (
            list.map((c) => (
              <div
                key={c.hash}
                className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-panel-800"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-slate-200">{c.message}</div>
                  <div className="text-[11px] text-slate-500">
                    {relative(c.ts)} · {c.hash.slice(0, 8)}
                  </div>
                </div>
                <button
                  onClick={() => restore(c)}
                  disabled={busy}
                  className="flex shrink-0 items-center gap-1.5 rounded-md border border-panel-600 px-2.5 py-1 text-xs text-slate-200 hover:bg-panel-700 disabled:opacity-50"
                >
                  <RestartIcon width={13} height={13} /> Restore
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  )
}
