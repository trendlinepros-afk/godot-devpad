import { useEffect, useRef, useState } from 'react'
import { useApp } from '../state/app'
import { useToast } from './Toast'
import { useTour } from '../state/tour'
import { findProfile } from '../lib/profiles'
import { modelLabel } from '../lib/models'
import { CheckpointsModal } from './CheckpointsModal'
import { AssetStudio } from './AssetStudio'
import { WikiModal } from './WikiModal'
import {
  PlayIcon,
  StopIcon,
  RestartIcon,
  GearIcon,
  ChevronDownIcon,
  EditIcon,
  HistoryIcon,
  ImageIcon,
  HelpIcon,
} from './Icons'

interface ToolbarProps {
  onHome: () => void
  onOpenSettings: () => void
  onOpenProfiles: () => void
}

export function Toolbar({ onHome, onOpenSettings, onOpenProfiles }: ToolbarProps) {
  const { config, godotStatus, update, setGodotStatus } = useApp()
  const { toast } = useToast()
  const tour = useTour()
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [helpMenuOpen, setHelpMenuOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [assetsOpen, setAssetsOpen] = useState(false)
  const [wikiOpen, setWikiOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const helpRef = useRef<HTMLDivElement>(null)

  const running = godotStatus.state === 'running' || godotStatus.state === 'starting'

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false)
      }
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) {
        setHelpMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // Surface launcher errors (e.g. Godot not installed) coming from the main process.
  useEffect(() => {
    if (godotStatus.message) toast(godotStatus.message, 'error')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [godotStatus.message])

  // Respond to global hotkeys triggered from the main process so the toast/status
  // feedback is consistent with button clicks.
  useEffect(() => {
    const off = window.devpad.events.onHotkey(async (action) => {
      if (action === 'run') toast('Launching Godot (F5)…')
      if (action === 'stop') toast('Stopped Godot (F6)…')
      if (action === 'restart') toast('Restarting Godot (F7)…')
      setGodotStatus(await window.devpad.godot.status())
    })
    return off
  }, [toast, setGodotStatus])

  // Error messages are surfaced centrally by the godotStatus.message effect
  // above (covers button clicks, hotkeys, and async spawn/exit failures), so we
  // don't toast here to avoid duplicates.
  const run = async () => setGodotStatus(await window.devpad.godot.run())
  const stop = async () => setGodotStatus(await window.devpad.godot.stop())
  const restart = async () => setGodotStatus(await window.devpad.godot.restart())

  const activeProfile = config ? findProfile(config.profiles, config.activeProfileId) : undefined

  const switchProfile = async (id: string) => {
    await update({ activeProfileId: id })
    setProfileMenuOpen(false)
    const p = config && findProfile(config.profiles, id)
    if (p) toast(`Switched to "${p.name}" profile`, 'success')
  }

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-panel-600 bg-panel-850 px-3">
      {/* Brand — click to return to the project launcher */}
      <button
        onClick={onHome}
        title="Back to projects"
        className="mr-2 flex items-center gap-2 rounded-md px-1.5 py-1 font-semibold tracking-tight hover:bg-panel-700"
      >
        <span className="grid h-6 w-6 place-items-center rounded bg-accent text-xs font-bold text-white">
          Z
        </span>
        <span className="text-slate-100">Zirtola</span>
      </button>

      {/* Launcher controls */}
      <div className="flex items-center gap-1" data-tour="run">
        <button
          onClick={run}
          disabled={running}
          title="Run Godot (F5)"
          className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-panel-600 disabled:text-slate-500"
        >
          <PlayIcon width={14} height={14} /> Run
        </button>
        <button
          onClick={stop}
          disabled={!running}
          title="Stop Godot (F6)"
          className="flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-panel-600 disabled:text-slate-500"
        >
          <StopIcon width={14} height={14} /> Stop
        </button>
        <button
          onClick={restart}
          title="Restart Godot (F7)"
          className="flex items-center gap-1.5 rounded-md bg-panel-600 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-panel-500"
        >
          <RestartIcon width={14} height={14} /> Restart
        </button>
      </div>

      {/* Running indicator */}
      <div className="ml-1 flex items-center gap-1.5 text-xs text-slate-400">
        <span
          className={`h-2 w-2 rounded-full ${
            godotStatus.state === 'running'
              ? 'bg-emerald-400'
              : godotStatus.state === 'starting'
                ? 'animate-pulse bg-amber-400'
                : 'bg-slate-600'
          }`}
        />
        {godotStatus.state === 'running'
          ? 'Running'
          : godotStatus.state === 'starting'
            ? 'Starting…'
            : 'Stopped'}
      </div>

      {/* Current model indicator (which model the active profile uses for chat) */}
      {activeProfile && (
        <div
          data-tour="model"
          title={
            `Active models for "${activeProfile.name}":\n` +
            `chat: ${modelLabel(activeProfile.tasks.chat)}\n` +
            `vision: ${modelLabel(activeProfile.tasks.vision)}\n` +
            `vision → code: ${modelLabel(activeProfile.tasks.vision_to_code)}\n` +
            `file analysis: ${modelLabel(activeProfile.tasks.file_analysis)}`
          }
          className="ml-2 flex items-center gap-1.5 rounded-full border border-panel-600 bg-panel-800 px-2.5 py-0.5 text-xs text-slate-300"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          <span className="text-slate-500">Model:</span>
          {modelLabel(activeProfile.tasks.chat)}
        </div>
      )}

      <div className="flex-1" />

      {/* Profile quick-switch dropdown */}
      <div className="relative" ref={menuRef} data-tour="profile">
        <button
          onClick={() => setProfileMenuOpen((o) => !o)}
          className="flex items-center gap-2 rounded-md border border-panel-600 bg-panel-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-panel-600"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          {activeProfile?.name ?? 'Profile'}
          <ChevronDownIcon width={14} height={14} />
        </button>
        {profileMenuOpen && config && (
          <div className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-md border border-panel-600 bg-panel-800 py-1 shadow-xl">
            {config.profiles.map((p) => (
              <button
                key={p.id}
                onClick={() => switchProfile(p.id)}
                className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-panel-700 ${
                  p.id === config.activeProfileId ? 'text-accent-hover' : 'text-slate-300'
                }`}
              >
                <span>{p.name}</span>
                {p.id === config.activeProfileId && <span className="text-xs">active</span>}
              </button>
            ))}
            <div className="my-1 border-t border-panel-600" />
            <button
              onClick={() => {
                setProfileMenuOpen(false)
                onOpenProfiles()
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-slate-300 hover:bg-panel-700"
            >
              <EditIcon width={14} height={14} /> Manage profiles…
            </button>
          </div>
        )}
      </div>

      {/* Asset Studio */}
      <button
        onClick={() => setAssetsOpen(true)}
        title="Asset Studio (generate sprites & art)"
        data-tour="assets"
        className="grid h-8 w-8 place-items-center rounded-md border border-panel-600 bg-panel-700 text-slate-300 hover:bg-panel-600"
      >
        <ImageIcon width={16} height={16} />
      </button>

      {/* Checkpoints / history */}
      <button
        onClick={() => setHistoryOpen(true)}
        title="Checkpoints (undo AI edits)"
        data-tour="checkpoints"
        className="grid h-8 w-8 place-items-center rounded-md border border-panel-600 bg-panel-700 text-slate-300 hover:bg-panel-600"
      >
        <HistoryIcon width={16} height={16} />
      </button>

      {/* Help menu */}
      <div className="relative" ref={helpRef} data-tour="help">
        <button
          onClick={() => setHelpMenuOpen((o) => !o)}
          title="Help"
          className="grid h-8 w-8 place-items-center rounded-md border border-panel-600 bg-panel-700 text-slate-300 hover:bg-panel-600"
        >
          <HelpIcon width={16} height={16} />
        </button>
        {helpMenuOpen && (
          <div className="absolute right-0 z-30 mt-1 w-52 overflow-hidden rounded-md border border-panel-600 bg-panel-800 py-1 shadow-xl">
            <button
              onClick={() => {
                setHelpMenuOpen(false)
                tour.start()
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-slate-300 hover:bg-panel-700"
            >
              ▶ Replay guided tour
            </button>
            <button
              onClick={() => {
                setHelpMenuOpen(false)
                setWikiOpen(true)
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-slate-300 hover:bg-panel-700"
            >
              📖 Help &amp; Wiki
            </button>
          </div>
        )}
      </div>

      {/* Settings */}
      <button
        onClick={onOpenSettings}
        title="Settings"
        data-tour="settings"
        className="grid h-8 w-8 place-items-center rounded-md border border-panel-600 bg-panel-700 text-slate-300 hover:bg-panel-600"
      >
        <GearIcon width={16} height={16} />
      </button>

      {historyOpen && <CheckpointsModal onClose={() => setHistoryOpen(false)} />}
      {assetsOpen && (
        <AssetStudio onClose={() => setAssetsOpen(false)} onOpenSettings={onOpenSettings} />
      )}
      {wikiOpen && (
        <WikiModal
          onClose={() => setWikiOpen(false)}
          onReplayTour={() => {
            setWikiOpen(false)
            tour.start()
          }}
        />
      )}
    </div>
  )
}
