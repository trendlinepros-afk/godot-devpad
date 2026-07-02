import { useEffect, useRef, useState } from 'react'
import { diffLines, type DiffResult } from '../lib/diff'
import { useToast } from './Toast'
import { CheckIcon, XIcon, FileIcon, ChevronDownIcon, ChevronRightIcon } from './Icons'

interface Props {
  path: string
  contents: string
  /** When true (Auto mode), apply as soon as the diff is ready. */
  autoApply?: boolean
}

type Status = 'loading' | 'pending' | 'applied' | 'rejected' | 'error'

const COLLAPSED_ROWS = 14

export function EditCard({ path, contents, autoApply = false }: Props) {
  const { toast } = useToast()
  const [status, setStatus] = useState<Status>('loading')
  const [isNew, setIsNew] = useState(false)
  const [diff, setDiff] = useState<DiffResult | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await window.devpad.files.read(path)
      if (cancelled) return
      const before = res.ok ? (res.contents ?? '') : ''
      setIsNew(!res.ok)
      setDiff(diffLines(before, contents))
      setStatus('pending')
    })()
    return () => {
      cancelled = true
    }
  }, [path, contents])

  const [noCheckpoint, setNoCheckpoint] = useState(false)

  const apply = async () => {
    const res = await window.devpad.files.applyEdit({ path, contents })
    if (res.ok) {
      setStatus('applied')
      if (res.checkpointFailed) {
        // The undo safety net could not be created — make this loud, because a
        // bad edit here is unrecoverable via Zirtola.
        setNoCheckpoint(true)
        toast(
          'Applied, but NO checkpoint could be saved (is Git installed?). This change can’t be auto-undone.',
          'error',
        )
      } else {
        toast(`Applied ${path}${res.checkpoint ? ' (checkpoint saved)' : ''}`, 'success')
      }
    } else {
      setStatus('error')
      setError(res.error ?? 'Failed to apply edit')
      toast(res.error ?? 'Failed to apply edit', 'error')
    }
  }

  // Auto mode: apply once as soon as the diff is ready.
  const autoApplied = useRef(false)
  useEffect(() => {
    if (autoApply && status === 'pending' && !autoApplied.current) {
      autoApplied.current = true
      apply()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoApply, status])

  const fileName = path.replace(/^res:\/\//, '').split('/').pop() ?? path

  const rows = diff?.rows ?? []
  const visibleRows = expanded ? rows : rows.slice(0, COLLAPSED_ROWS)

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-panel-600 bg-panel-900">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-panel-700 bg-panel-850 px-3 py-2">
        <FileIcon width={14} height={14} className="shrink-0 text-accent-hover" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-slate-200" title={path}>
            {fileName}
          </div>
          <div className="truncate text-[11px] text-slate-500">{path}</div>
        </div>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
            isNew ? 'bg-emerald-900/40 text-emerald-300' : 'bg-panel-700 text-slate-400'
          }`}
        >
          {isNew ? 'NEW FILE' : 'MODIFY'}
        </span>
        {diff && (
          <span className="shrink-0 font-mono text-[11px]">
            <span className="text-emerald-400">+{diff.added}</span>{' '}
            <span className="text-red-400">−{diff.removed}</span>
          </span>
        )}
      </div>

      {/* Diff body */}
      {status !== 'loading' && (
        <div className="max-h-72 overflow-auto bg-panel-900 font-mono text-[12px] leading-relaxed">
          {diff?.truncated && (
            <div className="px-3 py-1 text-[11px] text-amber-300/80">
              Large file — showing full contents.
            </div>
          )}
          {visibleRows.map((row, idx) => (
            <div
              key={idx}
              className={`flex ${
                row.type === 'add'
                  ? 'bg-emerald-950/40 text-emerald-200'
                  : row.type === 'del'
                    ? 'bg-red-950/40 text-red-200'
                    : 'text-slate-400'
              }`}
            >
              <span className="w-5 shrink-0 select-none text-center text-slate-600">
                {row.type === 'add' ? '+' : row.type === 'del' ? '−' : ''}
              </span>
              <span className="whitespace-pre-wrap break-all pr-3">{row.text || ' '}</span>
            </div>
          ))}
          {rows.length > COLLAPSED_ROWS && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="flex w-full items-center gap-1 px-3 py-1 text-[11px] text-slate-400 hover:bg-panel-800 hover:text-slate-200"
            >
              {expanded ? (
                <ChevronDownIcon width={12} height={12} />
              ) : (
                <ChevronRightIcon width={12} height={12} />
              )}
              {expanded ? 'Show less' : `Show all ${rows.length} lines`}
            </button>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 border-t border-panel-700 bg-panel-850 px-3 py-2">
        {status === 'applied' ? (
          <span className="flex items-center gap-1.5 text-xs font-medium">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <CheckIcon width={14} height={14} /> Applied
            </span>
            {noCheckpoint && (
              <span className="text-amber-300">⚠ no checkpoint — can’t auto-undo</span>
            )}
          </span>
        ) : status === 'rejected' ? (
          <span className="text-xs text-slate-500">Rejected</span>
        ) : status === 'error' ? (
          <span className="text-xs text-red-300">{error}</span>
        ) : (
          <>
            <button
              onClick={apply}
              disabled={status === 'loading'}
              className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              <CheckIcon width={13} height={13} /> Apply
            </button>
            <button
              onClick={() => setStatus('rejected')}
              className="flex items-center gap-1.5 rounded-md border border-panel-600 px-3 py-1 text-xs text-slate-300 hover:bg-panel-700"
            >
              <XIcon width={13} height={13} /> Reject
            </button>
            <span className="ml-auto text-[11px] text-slate-600">
              {isNew ? 'Creates a new file' : 'Overwrites the file'} · checkpoint first
            </span>
          </>
        )}
      </div>
    </div>
  )
}
