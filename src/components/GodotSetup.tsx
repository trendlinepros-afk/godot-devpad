import { useEffect, useState } from 'react'
import type { DetectedGodot, GodotDownloadProgress } from '@shared/types'
import { useToast } from './Toast'
import { CheckIcon, RefreshIcon, FolderIcon } from './Icons'

// Beginner-grade Godot setup. A user who has never used Godot (or never coded)
// should get from "nothing installed" to "connected" without knowing what an
// executable is: we detect an existing copy, or download the official build for
// them, or let them point at it manually.

interface Props {
  /** Called with the chosen Godot executable path once connected. */
  onConnected: (path: string) => void
}

export function GodotSetup({ onConnected }: Props) {
  const { toast } = useToast()
  const [detected, setDetected] = useState<DetectedGodot[] | null>(null)
  const [scanning, setScanning] = useState(true)
  const [progress, setProgress] = useState<GodotDownloadProgress | null>(null)

  const scan = async () => {
    setScanning(true)
    const found = await window.devpad.godotInstall.detect()
    setDetected(found)
    setScanning(false)
  }

  useEffect(() => {
    scan()
    const off = window.devpad.godotInstall.onDownloadProgress(setProgress)
    return off
  }, [])

  const downloading =
    progress != null && progress.phase !== 'done' && progress.phase !== 'error'

  const download = async () => {
    setProgress({ phase: 'resolving', message: 'Starting…' })
    const result = await window.devpad.godotInstall.download()
    if (result.phase === 'done' && result.executablePath) {
      toast('Godot downloaded and connected!', 'success')
      onConnected(result.executablePath)
    } else if (result.phase === 'error') {
      toast(result.error ?? 'Download failed', 'error')
    }
  }

  const pickManually = async () => {
    const path = await window.devpad.dialog.pickFile({ title: 'Select the Godot application' })
    if (path) {
      toast('Godot connected', 'success')
      onConnected(path)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-slate-100">Let's set up Godot</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-400">
          Godot is the free game engine Zirtola builds your game in. You don't need to know anything
          about it — pick an option below and we'll handle the rest.
        </p>
      </div>

      {/* 1. Detected installs */}
      <div className="rounded-lg border border-panel-600 bg-panel-800 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-200">Found on your computer</span>
          <button
            onClick={scan}
            disabled={scanning}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200"
          >
            <RefreshIcon width={12} height={12} className={scanning ? 'animate-spin' : ''} />
            Rescan
          </button>
        </div>
        {scanning ? (
          <p className="text-xs text-slate-500">Looking for Godot…</p>
        ) : detected && detected.length > 0 ? (
          <div className="space-y-1.5">
            {detected.map((g) => (
              <button
                key={g.path}
                onClick={() => {
                  toast('Godot connected', 'success')
                  onConnected(g.path)
                }}
                className="flex w-full items-center gap-2 rounded-md border border-panel-600 bg-panel-700 px-3 py-2 text-left hover:border-accent"
              >
                <FolderIcon width={15} height={15} className="shrink-0 text-accent-hover" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-200">
                    Godot {g.version ?? ''}{' '}
                    <span className="text-xs text-slate-500">({g.source})</span>
                  </div>
                  <div className="truncate text-[11px] text-slate-500">{g.path}</div>
                </div>
                <span className="shrink-0 rounded bg-accent px-2 py-0.5 text-[11px] font-medium text-white">
                  Use this
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            No Godot found yet — no problem, download it below.
          </p>
        )}
      </div>

      {/* 2. Auto-download */}
      <div className="rounded-lg border border-accent/40 bg-accent/5 p-3">
        <div className="mb-1 text-sm font-medium text-slate-100">
          Download Godot automatically (recommended)
        </div>
        <p className="mb-3 text-xs leading-relaxed text-slate-400">
          We'll fetch the latest official version and set it up for you.
        </p>
        {downloading ? (
          <div>
            <div className="mb-1 text-xs text-slate-300">{progress?.message}</div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-panel-700">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${progress?.percent ?? 0}%` }}
              />
            </div>
          </div>
        ) : (
          <button
            onClick={download}
            className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            <CheckIcon width={15} height={15} /> Download &amp; Connect Godot
          </button>
        )}
        {progress?.phase === 'error' && (
          <p className="mt-2 text-xs text-red-300">
            {progress.error} —{' '}
            <button
              onClick={() => window.devpad.godotInstall.openDownloadPage()}
              className="underline hover:text-red-200"
            >
              download manually instead
            </button>
            .
          </p>
        )}
      </div>

      {/* 3. Manual */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Already have Godot somewhere else?</span>
        <button onClick={pickManually} className="text-accent-hover hover:underline">
          Choose the file myself
        </button>
      </div>
    </div>
  )
}
