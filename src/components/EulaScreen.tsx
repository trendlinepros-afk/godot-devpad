import { useState } from 'react'
import { useApp } from '../state/app'
import { EULA_TEXT, EULA_VERSION } from '../lib/eula'

// First-launch EULA acceptance. Shown before anything else (including license
// activation) until the user explicitly accepts the current EULA version.
// The same text is presented by the Windows installer; this is the in-app
// acceptance the license contract requires.

export function EulaScreen({ onAccepted }: { onAccepted: () => void }) {
  const { update } = useApp()
  const [checked, setChecked] = useState(false)
  const [saving, setSaving] = useState(false)

  const accept = async () => {
    setSaving(true)
    try {
      await update({ eulaAcceptedVersion: EULA_VERSION })
      onAccepted()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full flex-col items-center bg-panel-900 p-8">
      <div className="flex min-h-0 w-full max-w-3xl flex-1 flex-col">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-sm font-bold text-white">
            Z
          </span>
          <div>
            <h1 className="text-lg font-semibold text-slate-100">License Agreement</h1>
            <p className="text-xs text-slate-500">
              Please review and accept the terms to use Zirtola.
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-panel-600 bg-panel-850 p-4">
          <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-300">
            {EULA_TEXT}
          </pre>
        </div>

        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          I accept the terms in the License Agreement
        </label>

        <div className="mt-4 flex justify-end">
          <button
            onClick={accept}
            disabled={!checked || saving}
            className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-panel-600 disabled:text-slate-500"
          >
            {saving ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
