import { useState } from 'react'
import type { UpdateStatus } from '@shared/types'
import { useApp } from '../state/app'
import { useToast } from './Toast'
import { RefreshIcon, CheckIcon } from './Icons'

// Human-readable summary of the current update state.
export function updateLabel(s: UpdateStatus): string {
  switch (s.state) {
    case 'checking':
      return 'Checking for updates…'
    case 'available':
      return `Update available: v${s.newVersion}`
    case 'downloading':
      return `Downloading update… ${s.percent ?? 0}%`
    case 'downloaded':
      return `v${s.newVersion} ready to install`
    case 'not-available':
      return 'Zirtola is up to date'
    case 'unsupported':
      return 'Updates available in installed builds only'
    case 'error':
      return `Update error: ${s.error ?? 'unknown'}`
    default:
      return s.version ? `Zirtola v${s.version}` : 'Zirtola'
  }
}

/**
 * Check-for-updates control. `compact` renders the small launcher variant for
 * the lower-left corner; otherwise it's the fuller Settings variant.
 */
export function UpdateControls({ compact = false }: { compact?: boolean }) {
  const { updateStatus } = useApp()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)

  const check = async () => {
    setBusy(true)
    try {
      const result = await window.devpad.updates.check()
      if (result.state === 'not-available') toast('Zirtola is up to date', 'success')
      else if (result.state === 'unsupported') toast(result.error ?? updateLabel(result), 'info')
      else if (result.state === 'available' || result.state === 'downloading')
        toast(`Update found: v${result.newVersion} — downloading…`, 'info')
      else if (result.state === 'error') toast(result.error ?? 'Update check failed', 'error')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Update check failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  const install = () => window.devpad.updates.install()

  const checking = busy || updateStatus.state === 'checking'
  const downloading = updateStatus.state === 'downloading'
  const downloaded = updateStatus.state === 'downloaded'

  if (compact) {
    return (
      <div className="flex flex-col gap-1 text-xs text-slate-500">
        {downloaded ? (
          <button
            onClick={install}
            className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
          >
            <CheckIcon width={13} height={13} /> Restart & Install v{updateStatus.newVersion}
          </button>
        ) : (
          <button
            onClick={check}
            disabled={checking || downloading}
            className="flex items-center gap-1.5 rounded-md border border-panel-600 bg-panel-800/80 px-3 py-1.5 text-xs text-slate-300 hover:bg-panel-700 disabled:opacity-60"
          >
            <RefreshIcon
              width={13}
              height={13}
              className={checking || downloading ? 'animate-spin' : ''}
            />
            {checking ? 'Checking…' : downloading ? `Downloading ${updateStatus.percent ?? 0}%` : 'Check for Updates'}
          </button>
        )}
        <span className="px-1 text-[11px] text-slate-600">
          {updateStatus.version ? `v${updateStatus.version}` : ''}
          {updateStatus.state !== 'idle' && updateStatus.state !== 'not-available'
            ? ` · ${updateLabel(updateStatus)}`
            : ''}
        </span>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-3 text-sm">
        <span className="text-slate-400">Current version</span>
        <span className="font-mono text-slate-200">v{updateStatus.version || '—'}</span>
      </div>
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={check}
          disabled={checking || downloading}
          className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          <RefreshIcon width={14} height={14} className={checking || downloading ? 'animate-spin' : ''} />
          {checking ? 'Checking…' : 'Check for Updates'}
        </button>
        {downloaded && (
          <button
            onClick={install}
            className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
          >
            <CheckIcon width={14} height={14} /> Restart & Install
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span
          className={`h-2 w-2 rounded-full ${
            updateStatus.state === 'error'
              ? 'bg-red-400'
              : downloaded || updateStatus.state === 'not-available'
                ? 'bg-emerald-400'
                : checking || downloading
                  ? 'animate-pulse bg-amber-400'
                  : 'bg-slate-600'
          }`}
        />
        <span className="text-slate-400">{updateLabel(updateStatus)}</span>
      </div>
      {downloading && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-panel-700">
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${updateStatus.percent ?? 0}%` }}
          />
        </div>
      )}
    </div>
  )
}
