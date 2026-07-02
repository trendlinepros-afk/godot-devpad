import { useEffect, useRef, useState } from 'react'
import type { LicenseStatus } from '@shared/types'

// Tier gate. Decides whether the app renders based on the license state
// mirrored from electron/licensing.ts:
//   licensed (trial/pro) → app runs fully
//   free                 → app runs with Pro features locked (no gate)
//   needs_key            → welcome screen: one-click trial / enter key
//   blocked              → revoked / paid-expired: account link + free fallback
//   offline/server_error → retryable screens
//   checking             → spinner
// A one-time "your trial ended" interstitial shows on the transition to free.

const TRIAL_END_ACK_KEY = 'zirtola.trialEndAcked'

export function LicenseGate({
  status,
  children,
}: {
  status: LicenseStatus
  children: React.ReactNode
}) {
  const runs = status.state === 'licensed' || status.state === 'free'
  // Keep the app subtree MOUNTED (hidden) once it has run this session —
  // deactivate → re-activate must not wipe the chat and editor state.
  const [everRan, setEverRan] = useState(false)
  useEffect(() => {
    if (runs) setEverRan(true)
  }, [runs])

  // One-time interstitial when a trial ends (state 'free' with an errorCode).
  const [trialEndAcked, setTrialEndAcked] = useState(
    () => localStorage.getItem(TRIAL_END_ACK_KEY) === '1',
  )
  const showTrialEnded =
    status.state === 'free' &&
    !trialEndAcked &&
    (status.errorCode === 'expired' || status.errorCode === 'trial_already_used')
  const ackTrialEnd = () => {
    localStorage.setItem(TRIAL_END_ACK_KEY, '1')
    setTrialEndAcked(true)
  }

  const gateVisible = !runs || showTrialEnded
  return (
    <>
      {(runs || everRan) && (
        <div className={gateVisible ? 'hidden' : 'contents'}>{children}</div>
      )}
      {gateVisible &&
        (showTrialEnded ? (
          <TrialEndedScreen status={status} onContinueFree={ackTrialEnd} />
        ) : (
          <GateScreen status={status} />
        ))}
    </>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-full place-items-center bg-panel-900 p-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-base font-bold text-white">
            Z
          </span>
          <div>
            <h1 className="text-lg font-semibold text-slate-100">Zirtola</h1>
            <p className="text-xs text-slate-500">The AI Video Game Editor</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Shown once when the Pro trial ends: keep the user, sell the upgrade. */
function TrialEndedScreen({
  status,
  onContinueFree,
}: {
  status: LicenseStatus
  onContinueFree: () => void
}) {
  return (
    <Frame>
      <div className="rounded-md border border-panel-600 bg-panel-850 p-6">
        <h2 className="mb-1 text-sm font-semibold text-slate-200">Your Pro trial has ended</h2>
        <p className="mb-4 text-xs leading-relaxed text-slate-500">
          {status.message ??
            'You can keep using Zirtola on the Free plan — your projects, notes and AI chat (with your own API keys) all keep working. Upgrade to Pro to keep the embedded game window, Asset Studio, live scene editing and Auto mode.'}
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => window.devpad.license.openPricing()}
            className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            Upgrade to Pro
          </button>
          <button
            onClick={onContinueFree}
            className="w-full rounded-md border border-panel-600 bg-panel-800 px-4 py-2 text-sm text-slate-300 hover:bg-panel-700"
          >
            Continue on Free
          </button>
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">
          Already have a key? Enter it in Settings → License.
        </p>
      </div>
    </Frame>
  )
}

function GateScreen({ status }: { status: LicenseStatus }) {
  const [key, setKey] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [startingTrial, setStartingTrial] = useState(false)
  const [retrying, setRetrying] = useState(false)
  // Opt-in key entry (from the welcome or blocked screens).
  const [showKeyForm, setShowKeyForm] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // The opt-in key form is per-state: when the machine state changes (offline,
  // server error, back to blocked…) render that state's own screen.
  useEffect(() => {
    setShowKeyForm(false)
  }, [status.state])

  useEffect(() => {
    if (showKeyForm) inputRef.current?.focus()
  }, [showKeyForm])

  const activate = async () => {
    if (!key.trim() || submitting) return
    setSubmitting(true)
    try {
      await window.devpad.license.activate(key.trim())
      // The resulting status arrives via license:status and re-renders the gate.
    } finally {
      setSubmitting(false)
    }
  }

  const startTrial = async () => {
    if (startingTrial) return
    setStartingTrial(true)
    try {
      await window.devpad.license.startTrial()
    } finally {
      setStartingTrial(false)
    }
  }

  const retry = async () => {
    if (retrying) return
    setRetrying(true)
    try {
      await window.devpad.license.revalidate()
    } finally {
      setRetrying(false)
    }
  }

  const checking = status.state === 'checking'
  const retryable = status.state === 'offline' || status.state === 'server_error'
  // A key error from a previous activate attempt drops us into the form.
  const keyError = status.state === 'needs_key' && !!status.errorCode
  const keyFormOpen = showKeyForm || keyError

  const keyForm = (
    <div>
      {status.message && (keyFormOpen || status.state === 'needs_key') && (
        <div
          className={`mb-3 rounded-md border px-3 py-2 text-xs leading-relaxed ${
            status.errorCode
              ? 'border-red-600/50 bg-red-950/30 text-red-200'
              : 'border-panel-600 bg-panel-800 text-slate-300'
          }`}
        >
          {status.message}
        </div>
      )}
      <input
        ref={inputRef}
        value={key}
        onChange={(e) => setKey(e.target.value.toUpperCase())}
        onKeyDown={(e) => e.key === 'Enter' && activate()}
        placeholder="ZIRT-XXXXX-XXXXX-XXXXX-XXXXX"
        spellCheck={false}
        className="mb-3 w-full rounded-md border border-panel-600 bg-panel-800 px-3 py-2 text-center font-mono text-sm tracking-wider text-slate-200 placeholder:text-slate-600 focus:border-accent focus:outline-none"
      />
      <button
        onClick={activate}
        disabled={!key.trim() || submitting}
        className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-panel-600 disabled:text-slate-500"
      >
        {submitting ? 'Activating…' : 'Activate'}
      </button>
    </div>
  )

  return (
    <Frame>
      {checking && (
        <div className="rounded-md border border-panel-600 bg-panel-850 p-6 text-center">
          <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-panel-600 border-t-accent" />
          <p className="text-sm text-slate-300">Checking your license…</p>
          <p className="mt-1 text-xs text-slate-500">Contacting the licensing server.</p>
        </div>
      )}

      {!checking && status.state === 'needs_key' && (
        <div className="rounded-md border border-panel-600 bg-panel-850 p-6">
          {keyFormOpen ? (
            <>
              <h2 className="mb-1 text-sm font-semibold text-slate-200">Activate Zirtola</h2>
              <p className="mb-4 text-xs leading-relaxed text-slate-500">
                Enter the license key from your purchase. An internet connection is required.
              </p>
              {keyForm}
              <p className="mt-4 text-center text-xs text-slate-500">
                <button onClick={() => setShowKeyForm(false)} className="text-accent hover:underline">
                  ← Back
                </button>
              </p>
            </>
          ) : (
            <>
              <h2 className="mb-1 text-sm font-semibold text-slate-200">Try Zirtola Pro free</h2>
              <p className="mb-4 text-xs leading-relaxed text-slate-500">
                Everything unlocked for 7 days on this device — AI editing, embedded game window,
                Asset Studio, live scene editing. No credit card needed.
              </p>
              {status.message && !status.errorCode && (
                <div className="mb-3 rounded-md border border-panel-600 bg-panel-800 px-3 py-2 text-xs leading-relaxed text-slate-300">
                  {status.message}
                </div>
              )}
              <button
                onClick={startTrial}
                disabled={startingTrial}
                className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
                data-tour="start-trial"
              >
                {startingTrial ? 'Starting your trial…' : 'Start free 7-day Pro trial'}
              </button>
              <button
                onClick={() => setShowKeyForm(true)}
                className="mt-2 w-full rounded-md border border-panel-600 bg-panel-800 px-4 py-2 text-sm text-slate-300 hover:bg-panel-700"
              >
                I have a license key
              </button>
              <p className="mt-4 text-center text-xs text-slate-500">
                <button
                  onClick={() => window.devpad.license.openPricing()}
                  className="text-accent hover:underline"
                >
                  See plans &amp; pricing
                </button>
              </p>
            </>
          )}
        </div>
      )}

      {!checking && status.state === 'blocked' && (
        <div className="rounded-md border border-red-600/50 bg-red-950/20 p-6">
          <h2 className="mb-1 text-sm font-semibold text-red-200">License problem</h2>
          <p className="mb-4 text-xs leading-relaxed text-red-200/80">
            {status.message ?? 'This license can no longer be used.'}
          </p>
          {showKeyForm ? (
            keyForm
          ) : (
            <div className="flex flex-col gap-2">
              <button
                onClick={() => window.devpad.license.openAccount()}
                className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
              >
                Manage your license at zirtola.com
              </button>
              <button
                onClick={() => setShowKeyForm(true)}
                className="w-full rounded-md border border-panel-600 bg-panel-800 px-4 py-2 text-sm text-slate-300 hover:bg-panel-700"
              >
                Enter a different key
              </button>
              <button
                onClick={() => window.devpad.license.continueFree()}
                className="w-full rounded-md border border-panel-600 bg-panel-800 px-4 py-2 text-sm text-slate-300 hover:bg-panel-700"
              >
                Continue on Free
              </button>
            </div>
          )}
        </div>
      )}

      {!checking && retryable && (
        <div className="rounded-md border border-panel-600 bg-panel-850 p-6">
          <h2 className="mb-1 text-sm font-semibold text-slate-200">
            {status.state === 'offline' ? "Can't reach the licensing server" : 'Server unavailable'}
          </h2>
          <p className="mb-4 text-xs leading-relaxed text-slate-500">
            {status.message ??
              'The licensing server is temporarily unavailable — please try again shortly.'}
          </p>
          <button
            onClick={retry}
            disabled={retrying}
            className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {retrying ? 'Retrying…' : 'Retry'}
          </button>
          <p className="mt-3 text-center text-xs text-slate-600">
            Zirtola verifies trials and licenses online.
          </p>
        </div>
      )}
    </Frame>
  )
}
