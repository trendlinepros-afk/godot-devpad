import { useEffect, useRef, useState } from 'react'
import { useApp } from '../state/app'
import { useToast } from './Toast'
import { useTour } from '../state/tour'
import { overlay } from '../state/overlay'
import type { ProviderId } from '@shared/types'
import {
  DEFAULT_SELECTION,
  PROVIDER_LABELS,
  TIER_LABELS,
  TIER_LEVELS,
  TIER_PROVIDER_IDS,
  providerHasKey,
  resolveModel,
  type TierLevel,
} from '../lib/providerTiers'
import { CheckpointsModal } from './CheckpointsModal'
import { AssetStudio } from './AssetStudio'
import { WikiModal } from './WikiModal'
import { UpgradeModal } from './UpgradeModal'
import {
  PlayIcon,
  StopIcon,
  RestartIcon,
  GearIcon,
  ChevronDownIcon,
  HistoryIcon,
  ImageIcon,
  HelpIcon,
} from './Icons'

interface ToolbarProps {
  onHome: () => void
  onOpenSettings: () => void
}

export function Toolbar({ onHome, onOpenSettings }: ToolbarProps) {
  const { config, godotStatus, update, setGodotStatus, license, tier } = useApp()
  const { toast } = useToast()
  const tour = useTour()
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [helpMenuOpen, setHelpMenuOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [assetsOpen, setAssetsOpen] = useState(false)
  const [wikiOpen, setWikiOpen] = useState(false)
  // Locked Pro feature name to pitch, '' = generic pitch, null = closed.
  const [upgradeFeature, setUpgradeFeature] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const helpRef = useRef<HTMLDivElement>(null)

  const running = godotStatus.state === 'running' || godotStatus.state === 'starting'

  // Toolbar dropdowns open over the main area — hide the embedded game while
  // one is open so it doesn't paint over the menu.
  useEffect(() => {
    if (modelMenuOpen || helpMenuOpen) {
      overlay.open()
      return () => overlay.close()
    }
  }, [modelMenuOpen, helpMenuOpen])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setModelMenuOpen(false)
      }
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) {
        setHelpMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // Surface launcher errors (e.g. Godot not installed) coming from the main
  // process. Keyed on the status OBJECT (new on every update), not the message
  // string — pressing Run twice with the same failure must toast both times.
  useEffect(() => {
    if (godotStatus.message) toast(godotStatus.message, 'error')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [godotStatus])

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

  const selection = config?.modelSelection ?? DEFAULT_SELECTION
  const resolved = resolveModel(config?.modelSelection)

  const setProvider = async (provider: ProviderId) => {
    await update({ modelSelection: { provider, tier: selection.tier } })
  }
  const setTier = async (t: TierLevel) => {
    await update({ modelSelection: { provider: selection.provider, tier: t } })
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

      {/* Agent autonomy mode */}
      <div
        data-tour="chat-mode"
        className="ml-2 flex overflow-hidden rounded-md border border-panel-600"
      >
        {(
          [
            ['chat', 'Chat', 'Read-only — answers & plans, never edits files'],
            ['ask', 'Ask', 'Proposes edits you approve one by one'],
            ['auto', 'Auto', 'Applies edits automatically (a checkpoint is saved first)'],
          ] as const
        ).map(([value, label, tip]) => (
          <button
            key={value}
            onClick={() => {
              // Auto mode is Pro — Free users get the upgrade pitch instead.
              if (value === 'auto' && tier === 'free') {
                setUpgradeFeature('Auto mode')
                return
              }
              update({ agentMode: value })
            }}
            title={value === 'auto' && tier === 'free' ? 'Auto mode is a Pro feature' : tip}
            className={`px-2.5 py-1 text-xs ${
              config?.agentMode === value
                ? value === 'auto'
                  ? 'bg-amber-600 text-white'
                  : value === 'chat'
                    ? 'bg-panel-500 text-white'
                    : 'bg-accent text-white'
                : 'bg-panel-700 text-slate-300 hover:bg-panel-600'
            }`}
          >
            {value === 'auto' && tier === 'free' ? `${label} 🔒` : label}
          </button>
        ))}
      </div>

      {/* Tier badge: trial countdown (urgency) or Free upsell; nothing on Pro */}
      {tier === 'trial' && (
        <button
          onClick={() => window.devpad.license.openPricing()}
          title="You're on the full Pro trial — click to see plans"
          className={`ml-2 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
            (license.trialDaysLeft ?? 7) <= 2
              ? 'border-amber-600/60 bg-amber-950/40 text-amber-200 hover:bg-amber-900/40'
              : 'border-accent/50 bg-accent/15 text-accent-hover hover:bg-accent/25'
          }`}
        >
          Pro trial — {license.trialDaysLeft ?? '?'} day{(license.trialDaysLeft ?? 0) === 1 ? '' : 's'} left
        </button>
      )}
      {tier === 'free' && (
        <button
          onClick={() => setUpgradeFeature('')}
          title="You're on the Free plan — click to see what Pro unlocks"
          className="ml-2 rounded-full border border-panel-600 bg-panel-800 px-2.5 py-0.5 text-xs text-slate-400 hover:text-slate-200"
        >
          Free plan
        </button>
      )}

      {/* Current model indicator — the exact model answering right now */}
      <div
        data-tour="model"
        title={resolved.isAdaptive ? 'Adaptive — best model chosen per task' : `Model in use: ${resolved.apiModel}`}
        className="ml-2 flex items-center gap-1.5 rounded-full border border-panel-600 bg-panel-800 px-2.5 py-0.5 text-xs text-slate-300"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        <span className="text-slate-500">Model:</span>
        {resolved.isAdaptive ? (
          <span>✨ Adaptive</span>
        ) : (
          <span className="font-mono">{resolved.apiModel}</span>
        )}
      </div>

      <div className="flex-1" />

      {/* Model quick-switch dropdown (provider + cheap/mild/expensive tier) */}
      <div className="relative" ref={menuRef} data-tour="profile">
        <button
          onClick={() => setModelMenuOpen((o) => !o)}
          title="Switch AI provider & tier"
          className="flex items-center gap-2 rounded-md border border-panel-600 bg-panel-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-panel-600"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          {resolved.isAdaptive ? '✨ Adaptive' : PROVIDER_LABELS[selection.provider]}
          {selection.provider !== 'mcp' && selection.provider !== 'adaptive' && (
            <span className="text-xs text-slate-400">· {TIER_LABELS[selection.tier]}</span>
          )}
          <ChevronDownIcon width={14} height={14} />
        </button>
        {modelMenuOpen && config && (
          <div className="absolute right-0 z-30 mt-1 w-64 overflow-hidden rounded-md border border-panel-600 bg-panel-800 py-1 shadow-xl">
            <button
              disabled={!providerHasKey(config.apiKeys, 'adaptive')}
              onClick={async () => {
                await setProvider('adaptive')
                setModelMenuOpen(false)
              }}
              className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-panel-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${
                selection.provider === 'adaptive' ? 'text-accent-hover' : 'text-slate-200'
              }`}
            >
              <span>✨ Adaptive — best model per task</span>
              {selection.provider === 'adaptive' && <span className="text-xs">active</span>}
            </button>
            <div className="my-1 border-t border-panel-600" />
            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Or pick one provider
            </div>
            {TIER_PROVIDER_IDS.map((p) => {
              const has = providerHasKey(config.apiKeys, p)
              return (
                <button
                  key={p}
                  disabled={!has}
                  onClick={async () => {
                    await setProvider(p)
                    setModelMenuOpen(false)
                  }}
                  className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-panel-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${
                    selection.provider === p ? 'text-accent-hover' : 'text-slate-300'
                  }`}
                >
                  <span>{PROVIDER_LABELS[p]}</span>
                  {selection.provider === p ? (
                    <span className="text-xs">active</span>
                  ) : !has ? (
                    <span className="text-[10px] text-slate-500">add key</span>
                  ) : null}
                </button>
              )
            })}
            <button
              disabled={tier === 'free'}
              onClick={async () => {
                await setProvider('mcp')
                setModelMenuOpen(false)
              }}
              className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-panel-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${
                selection.provider === 'mcp' ? 'text-accent-hover' : 'text-slate-300'
              }`}
            >
              <span>{PROVIDER_LABELS.mcp}</span>
              {selection.provider === 'mcp' ? (
                <span className="text-xs">active</span>
              ) : tier === 'free' ? (
                <span className="text-[10px] text-slate-500">Pro</span>
              ) : null}
            </button>

            {selection.provider !== 'mcp' && selection.provider !== 'adaptive' && (
              <>
                <div className="my-1 border-t border-panel-600" />
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Tier
                </div>
                <div className="flex gap-1 px-3 pb-2">
                  {TIER_LEVELS.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTier(t)}
                      className={`flex-1 rounded px-2 py-1 text-xs ${
                        selection.tier === t
                          ? 'bg-accent text-white'
                          : 'bg-panel-700 text-slate-300 hover:bg-panel-600'
                      }`}
                    >
                      {TIER_LABELS[t]}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="my-1 border-t border-panel-600" />
            <div className="px-3 py-1.5 text-[11px] text-slate-500">
              {resolved.isAdaptive ? (
                'Chooses the cheapest capable model per task'
              ) : (
                <>
                  Using <span className="font-mono text-slate-300">{resolved.apiModel}</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Asset Studio */}
      <button
        onClick={() => (tier === 'free' ? setUpgradeFeature('Asset Studio') : setAssetsOpen(true))}
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
      {upgradeFeature !== null && (
        <UpgradeModal
          feature={upgradeFeature || undefined}
          onClose={() => setUpgradeFeature(null)}
        />
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
