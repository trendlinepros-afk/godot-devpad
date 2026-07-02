import { useEffect, useRef, useState } from 'react'
import type { LicenseStatus } from '@shared/types'

// Hard license gate. Rendered instead of the app until the main process
// confirms a valid, online-validated license. Mirrors electron/licensing.ts:
//   checking      → spinner
//   needs_key     → activation form (first run, invalid key, seat limit)
//   blocked       → revoked/expired: manage-account link + enter another key
//   offline       → internet required: retry (the app never runs unlicensed)
//   server_error  → licensing server problem: retry (NOT the user's fault)

export function LicenseGate({
  status,
  children,
}: {
  status: LicenseStatus
  children: React.ReactNode
}) {
  if (status.state === 'licensed') return <>{children}</>
  return <GateScreen status={status} />
}

function GateScreen({ status }: { status: LicenseStatus }) {
  const [key, setKey] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [retrying, setRetrying] = useState(false)
  // When blocked, the user can opt into entering a different key.
  const [showKeyForm, setShowKeyForm] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (status.state === 'needs_key') inputRef.current?.focus()
  }, [status.state])

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
  const needsKey = status.state === 'needs_key' || showKeyForm
  const retryable = status.state === 'offline' || status.state === 'server_error'

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

        {checking && (
          <div className="rounded-md border border-panel-600 bg-panel-850 p-6 text-center">
            <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-panel-600 border-t-accent" />
            <p className="text-sm text-slate-300">Checking your license…</p>
            <p className="mt-1 text-xs text-slate-500">Contacting the licensing server.</p>
          </div>
        )}

        {!checking && needsKey && (
          <div className="rounded-md border border-panel-600 bg-panel-850 p-6">
            <h2 className="mb-1 text-sm font-semibold text-slate-200">Activate Zirtola</h2>
            <p className="mb-4 text-xs leading-relaxed text-slate-500">
              Enter the license key from your purchase to activate this device. An internet
              connection is required.
            </p>
            {status.message && (
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
            <p className="mt-4 text-center text-xs text-slate-500">
              Don't have a key?{' '}
              <button
                onClick={() => window.devpad.license.openAccount()}
                className="text-accent hover:underline"
              >
                Get one at zirtola.com
              </button>
            </p>
          </div>
        )}

        {!checking && !needsKey && status.state === 'blocked' && (
          <div className="rounded-md border border-red-600/50 bg-red-950/20 p-6">
            <h2 className="mb-1 text-sm font-semibold text-red-200">License problem</h2>
            <p className="mb-4 text-xs leading-relaxed text-red-200/80">
              {status.message ?? 'This license can no longer be used.'}
            </p>
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
            </div>
          </div>
        )}

        {!checking && !needsKey && retryable && (
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
              Zirtola requires an internet connection to verify your license.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
