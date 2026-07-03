import { useApp } from '../state/app'
import { Modal } from './Modal'
import { SparkleIcon } from './Icons'

// Shown when a Free-tier user taps a locked Pro feature. One consistent pitch
// everywhere: what Pro includes + the right call to action for their history
// (trial never used → start trial; otherwise → upgrade).

const PRO_FEATURES = [
  'Embedded Godot game window (dock the game inside Zirtola)',
  'Asset Studio — AI image & sprite generation',
  'Live scene editing through the Godot editor bridge',
  'Auto mode — the AI applies edits without asking',
  'MCP server for external AI tools',
]

export function UpgradeModal({ feature, onClose }: { feature?: string; onClose: () => void }) {
  const { config } = useApp()
  const trialAvailable = (config?.trialState ?? '') !== 'used'

  const startTrial = async () => {
    onClose()
    await window.devpad.license.startTrial()
  }

  return (
    <Modal onClose={onClose} title="Zirtola Pro">
      <div className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-accent/15 text-accent-hover">
            <SparkleIcon width={16} height={16} />
          </span>
          <p className="text-sm text-slate-200">
            {feature ? `${feature} is a Pro feature.` : 'This is a Pro feature.'}
          </p>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-slate-500">
          Pro unlocks everything in Zirtola:
        </p>
        <ul className="mb-4 space-y-1.5">
          {PRO_FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2 text-xs text-slate-300">
              <span className="mt-0.5 text-accent-hover">✓</span>
              {f}
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2">
          {trialAvailable ? (
            <button
              onClick={startTrial}
              className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
            >
              Start free 7-day Pro trial
            </button>
          ) : (
            <button
              onClick={() => {
                window.devpad.license.openPricing()
                onClose()
              }}
              className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
            >
              Upgrade to Pro
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full rounded-md border border-panel-600 bg-panel-800 px-4 py-2 text-sm text-slate-300 hover:bg-panel-700"
          >
            Not now
          </button>
        </div>
      </div>
    </Modal>
  )
}
