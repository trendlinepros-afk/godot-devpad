import { useEffect, useState } from 'react'
import type { MonitorPosition, DisplayInfo, ProviderId } from '@shared/types'
import { EULA_TEXT, EULA_VERSION } from '../lib/eula'
import { useApp } from '../state/app'
import { useToast } from './Toast'
import { detectVersionFromPath } from '../lib/godot-versions'
import { XIcon } from './Icons'
import { UpdateControls } from './UpdateControls'
import { GodotSetup } from './GodotSetup'
import { Modal } from './Modal'
import { overlay } from '../state/overlay'
import {
  DEFAULT_SELECTION,
  PROVIDER_LABELS,
  PROVIDER_TIERS,
  TIER_LABELS,
  TIER_LEVELS,
  TIER_PROVIDER_IDS,
  providerHasKey,
  resolveModel,
  type TierLevel,
} from '../lib/providerTiers'

type Section = 'ai' | 'godot' | 'mcp' | 'window' | 'versions' | 'updates' | 'license'

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'ai', label: 'AI / Models' },
  { key: 'godot', label: 'Godot' },
  { key: 'mcp', label: 'MCP Server' },
  { key: 'window', label: 'Window' },
  { key: 'versions', label: 'Godot Versions' },
  { key: 'updates', label: 'App Updates' },
  { key: 'license', label: 'License' },
]

interface Props {
  onClose: () => void
}

export function SettingsPanel({ onClose }: Props) {
  const [section, setSection] = useState<Section>('ai')

  // Hide the embedded Godot window while this drawer is open.
  useEffect(() => {
    overlay.open()
    return () => overlay.close()
  }, [])

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/50" onMouseDown={onClose}>
      <div
        className="flex h-full w-[34rem] max-w-full flex-col border-l border-panel-600 bg-panel-850 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-panel-600 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-100">Settings</h2>
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-panel-700 hover:text-slate-200"
          >
            <XIcon width={16} height={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Section nav */}
          <nav className="w-40 shrink-0 border-r border-panel-600 py-2">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                className={`block w-full px-4 py-2 text-left text-sm ${
                  section === s.key
                    ? 'border-l-2 border-accent bg-panel-700 text-slate-100'
                    : 'border-l-2 border-transparent text-slate-400 hover:bg-panel-800 hover:text-slate-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </nav>

          {/* Section body */}
          <div className="min-w-0 flex-1 overflow-auto p-5">
            {section === 'ai' && <AiSection />}
            {section === 'godot' && <GodotSection />}
            {section === 'mcp' && <McpSection />}
            {section === 'window' && <WindowSection />}
            {section === 'versions' && <VersionsSection />}
            {section === 'updates' && <UpdatesSection />}
            {section === 'license' && <LicenseSection />}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Reusable bits ─────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 text-sm font-semibold text-slate-100">{children}</h3>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      {children}
    </label>
  )
}

const inputClass =
  'w-full rounded-md border border-panel-600 bg-panel-800 px-3 py-1.5 text-sm text-slate-200 focus:border-accent focus:outline-none'

// ── AI / Models (API keys + model selector) — the dedicated AI settings page ──

const EMPTY_KEYS = { deepseek: '', gemini: '', openai: '', anthropic: '' }

function AiSection() {
  const { config, update, tier } = useApp()
  const { toast } = useToast()
  const [keys, setKeys] = useState(config?.apiKeys ?? EMPTY_KEYS)
  const [testing, setTesting] = useState<ProviderId | null>(null)
  const [keysDirty, setKeysDirty] = useState(false)

  // Re-sync from config only when there's no key mid-edit — any unrelated
  // config write would otherwise wipe a key typed but not yet blurred.
  useEffect(() => {
    if (config && !keysDirty) setKeys(config.apiKeys)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config])

  if (!config) return null

  const editKeys = (next: typeof keys) => {
    setKeys(next)
    setKeysDirty(true)
  }

  const saveKeys = async (next: typeof keys) => {
    setKeys(next)
    await update({ apiKeys: next })
    setKeysDirty(false)
  }

  const test = async (provider: ProviderId) => {
    setTesting(provider)
    try {
      // Persist first so the main process tests the latest value.
      await saveKeys(keys)
      const result = await window.devpad.ai.testConnection(provider)
      toast(result.message, result.ok ? 'success' : 'error')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Connection test failed', 'error')
    } finally {
      setTesting(null)
    }
  }

  const keyRow = (label: string, provider: Exclude<ProviderId, 'mcp'>) => (
    <div className="mb-3">
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      <div className="flex gap-2">
        <input
          type="password"
          value={keys[provider]}
          placeholder={`${label}…`}
          onChange={(e) => editKeys({ ...keys, [provider]: e.target.value })}
          onBlur={() => saveKeys(keys)}
          className={inputClass}
        />
        <button
          onClick={() => test(provider)}
          disabled={testing !== null}
          className="shrink-0 rounded-md border border-panel-600 bg-panel-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-panel-600 disabled:opacity-50"
        >
          {testing === provider ? 'Testing…' : 'Test'}
        </button>
      </div>
    </div>
  )

  // ── Model selector (provider + cheap/mild/expensive) ────────────────────────
  const selection = config.modelSelection ?? DEFAULT_SELECTION
  const resolved = resolveModel(config.modelSelection)
  const setProvider = (provider: ProviderId) =>
    update({ modelSelection: { provider, tier: selection.tier } })
  const setTier = (t: TierLevel) =>
    update({ modelSelection: { provider: selection.provider, tier: t } })

  return (
    <div>
      <SectionTitle>API Keys</SectionTitle>
      <p className="mb-3 text-xs leading-relaxed text-slate-500">
        Keys are stored locally and encrypted in electron-store. Nothing is uploaded. Add a key for
        any provider you want to use, then pick its model below (MCP mode needs no key).
      </p>
      {keyRow('Anthropic API Key (Claude)', 'anthropic')}
      {keyRow('OpenAI API Key', 'openai')}
      {keyRow('Gemini API Key', 'gemini')}
      {keyRow('DeepSeek API Key', 'deepseek')}

      <div className="my-5 border-t border-panel-600" />

      <SectionTitle>Model</SectionTitle>
      <p className="mb-3 text-xs leading-relaxed text-slate-500">
        Pick a provider and a tier. This one model handles all AI tasks. Use the tiers to A/B test
        models — the exact model in use is shown below.
      </p>

      <Field label="Provider">
        <select
          value={selection.provider}
          onChange={(e) => setProvider(e.target.value as ProviderId)}
          className={inputClass}
        >
          {TIER_PROVIDER_IDS.map((p) => {
            const has = providerHasKey(config.apiKeys, p)
            return (
              <option key={p} value={p} disabled={!has}>
                {PROVIDER_LABELS[p]}
                {has ? '' : ' — add key above'}
              </option>
            )
          })}
          <option value="mcp" disabled={tier === 'free'}>
            {PROVIDER_LABELS.mcp}
            {tier === 'free' ? ' (Pro)' : ''}
          </option>
        </select>
      </Field>

      {selection.provider !== 'mcp' && (
        <Field label="Tier">
          <div className="flex overflow-hidden rounded-md border border-panel-600">
            {TIER_LEVELS.map((t) => (
              <button
                key={t}
                onClick={() => setTier(t)}
                title={PROVIDER_TIERS[selection.provider as keyof typeof PROVIDER_TIERS]?.[t]?.apiModel}
                className={`flex-1 px-3 py-1.5 text-xs ${
                  selection.tier === t
                    ? 'bg-accent text-white'
                    : 'bg-panel-700 text-slate-300 hover:bg-panel-600'
                }`}
              >
                {TIER_LABELS[t]}
              </button>
            ))}
          </div>
        </Field>
      )}

      {/* The exact model being used — the "let me know what llm is being used" line */}
      <div className="mt-2 rounded-md border border-panel-600 bg-panel-800 px-3 py-2.5">
        <div className="flex items-center gap-2 text-sm">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          <span className="text-slate-400">Using:</span>
          <span className="font-mono text-slate-100">{resolved.apiModel}</span>
          {!resolved.vision && (
            <span className="rounded bg-panel-700 px-1.5 py-0.5 text-[10px] text-slate-400">
              no vision
            </span>
          )}
        </div>
        <div className="mt-1 text-[11px] text-slate-500">
          {resolved.label}
          {resolved.note ? ` — ${resolved.note}` : ''}
          {!resolved.vision && ' · screenshots use a vision-capable provider you have a key for'}
        </div>
      </div>
    </div>
  )
}

// ── Godot ─────────────────────────────────────────────────────────────────────

function GodotSection() {
  const { config, versions, update } = useApp()
  const { toast } = useToast()
  const [showSetup, setShowSetup] = useState(false)
  if (!config || !versions) return null

  const connect = async (path: string) => {
    const detected = detectVersionFromPath(versions, path)
    await update({
      godotExecutablePath: path,
      ...(detected ? { activeVersionId: detected } : {}),
    })
    setShowSetup(false)
  }

  const pickExe = async () => {
    const path = await window.devpad.dialog.pickFile({ title: 'Select the Godot executable' })
    if (!path) return
    const detected = detectVersionFromPath(versions, path)
    await update({
      godotExecutablePath: path,
      ...(detected ? { activeVersionId: detected } : {}),
    })
    if (detected) {
      const label = versions.versions.find((v) => v.id === detected)?.label
      toast(`Detected ${label ?? detected} from executable name`, 'success')
    }
  }

  const pickFolder = async () => {
    const path = await window.devpad.dialog.pickFolder({ title: 'Select your Godot project folder' })
    if (path) await update({ projectDir: path })
  }

  return (
    <div>
      <SectionTitle>Godot</SectionTitle>
      <Field label="Executable Path">
        <div className="flex gap-2">
          <input readOnly value={config.godotExecutablePath} placeholder="Not set" className={inputClass} />
          <button
            onClick={pickExe}
            className="shrink-0 rounded-md border border-panel-600 bg-panel-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-panel-600"
          >
            Browse
          </button>
        </div>
      </Field>
      <button
        onClick={() => setShowSetup(true)}
        className="mb-3 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
      >
        {config.godotExecutablePath ? 'Set up / Download Godot' : 'Download & set up Godot'}
      </button>
      {showSetup && (
        <Modal title="Set up Godot" onClose={() => setShowSetup(false)}>
          <div className="max-h-[70vh] overflow-auto p-5">
            <GodotSetup onConnected={connect} />
          </div>
        </Modal>
      )}
      <Field label="Project Folder">
        <div className="flex gap-2">
          <input readOnly value={config.projectDir} placeholder="Not set" className={inputClass} />
          <button
            onClick={pickFolder}
            className="shrink-0 rounded-md border border-panel-600 bg-panel-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-panel-600"
          >
            Browse
          </button>
        </div>
      </Field>
      <Field label="Godot Version">
        <select
          value={config.activeVersionId}
          onChange={(e) => update({ activeVersionId: e.target.value })}
          className={inputClass}
        >
          {versions.versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      </Field>
      <p className="mb-4 text-xs leading-relaxed text-slate-500">
        The selected version's system prompt is prepended to every AI request, keeping suggestions
        on the right GDScript dialect.
      </p>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-panel-600 bg-panel-800 px-3 py-2.5">
        <input
          type="checkbox"
          checked={config.checkpointsEnabled}
          onChange={(e) => update({ checkpointsEnabled: e.target.checked })}
          className="mt-0.5 accent-accent"
        />
        <span>
          <span className="block text-sm text-slate-200">Checkpoint before AI edits</span>
          <span className="block text-xs text-slate-500">
            Take a git snapshot before the AI writes files so you can undo from the Checkpoints
            (↺ history) menu. Recommended.
          </span>
        </span>
      </label>
    </div>
  )
}

// ── MCP Server ────────────────────────────────────────────────────────────────

function McpSection() {
  const { mcpStatus, refreshMcp, tier } = useApp()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)

  if (tier === 'free') {
    return (
      <div>
        <SectionTitle>MCP Server</SectionTitle>
        <p className="mb-3 text-xs leading-relaxed text-slate-500">
          🔒 The MCP server (lets external AI tools like Claude Code control Zirtola) is a Pro
          feature.
        </p>
        <button
          onClick={() => window.devpad.license.openPricing()}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
        >
          See Pro plans
        </button>
      </div>
    )
  }

  const toggle = async () => {
    setBusy(true)
    try {
      await window.devpad.mcp.setEnabled(!mcpStatus.enabled)
      await refreshMcp()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not toggle the MCP server', 'error')
    } finally {
      setBusy(false)
    }
  }

  const snippet = `{
  "mcpServers": {
    "zirtola": {
      "url": "http://localhost:${mcpStatus.port}/manifest"
    }
  }
}`

  const copy = async () => {
    await navigator.clipboard.writeText(snippet)
    toast('Config snippet copied', 'success')
  }

  return (
    <div>
      <SectionTitle>MCP Server</SectionTitle>
      <div className="mb-3 flex items-center justify-between rounded-md border border-panel-600 bg-panel-800 px-3 py-2.5">
        <div>
          <div className="text-sm text-slate-200">Enable MCP Server</div>
          <div className="text-xs text-slate-500">
            Lets Claude Code drive Zirtola's tools locally.
          </div>
        </div>
        <button
          onClick={toggle}
          disabled={busy}
          className={`relative h-6 w-11 rounded-full transition ${
            mcpStatus.enabled ? 'bg-accent' : 'bg-panel-600'
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
              mcpStatus.enabled ? 'left-[22px]' : 'left-0.5'
            }`}
          />
        </button>
      </div>

      <div className="mb-3 flex items-center gap-4 text-sm">
        <span className="text-slate-400">Port</span>
        <span className="font-mono text-slate-200">{mcpStatus.port}</span>
        <span className="text-slate-400">Status</span>
        <span
          className={`flex items-center gap-1.5 ${
            mcpStatus.running ? 'text-emerald-400' : 'text-slate-500'
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              mcpStatus.running ? 'bg-emerald-400' : 'bg-slate-600'
            }`}
          />
          {mcpStatus.running ? `Running on ${mcpStatus.port}` : 'Stopped'}
        </span>
      </div>

      <Field label="Claude Code Setup">
        <pre className="overflow-auto rounded-md border border-panel-600 bg-panel-900 p-3 text-xs text-slate-300">
          {snippet}
        </pre>
      </Field>
      <button
        onClick={copy}
        className="rounded-md border border-panel-600 bg-panel-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-panel-600"
      >
        Copy config snippet
      </button>
    </div>
  )
}

// ── Window / multi-monitor ────────────────────────────────────────────────────

function WindowSection() {
  const { config, update } = useApp()
  const [displays, setDisplays] = useState<DisplayInfo[]>([])

  useEffect(() => {
    window.devpad.window.getDisplays().then(setDisplays)
  }, [])

  if (!config) return null

  const options: { value: MonitorPosition; label: string }[] = [
    { value: 'auto', label: 'Auto (default)' },
    ...displays.map((d) => ({
      value: d.index as MonitorPosition,
      label: `${d.label} Monitor (${d.bounds.width}×${d.bounds.height})`,
    })),
  ]

  const onChange = async (value: string) => {
    const position: MonitorPosition = value === 'auto' ? 'auto' : (Number(value) as MonitorPosition)
    await update({ monitorPosition: position })
    await window.devpad.window.setMonitor(position)
  }

  return (
    <div>
      <SectionTitle>Window</SectionTitle>
      <Field label="Godot Game Window">
        <select
          value={config.godotWindowMode}
          onChange={(e) => update({ godotWindowMode: e.target.value as 'separate' | 'embedded' })}
          className={inputClass}
        >
          <option value="separate">Separate window (recommended)</option>
          <option value="embedded">Embedded in Zirtola (experimental, Windows)</option>
        </select>
      </Field>
      <p className="mb-4 text-xs leading-relaxed text-slate-500">
        <strong>Separate</strong> runs Godot in its own window (works everywhere) — pair it with the
        monitor setting below to put it on a second screen. <strong>Embedded</strong> docks the
        running game inside Zirtola's <em>Game</em> tab; it's experimental and Windows-only (other
        platforms fall back to a separate window).
      </p>
      <Field label="Monitor Position">
        <select
          value={String(config.monitorPosition)}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        >
          {options.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <p className="text-xs leading-relaxed text-slate-500">
        Zirtola is designed to sit on a second monitor next to the Godot window. Only monitors that
        are actually connected are shown. Window size and position are remembered.
      </p>
    </div>
  )
}

// ── App Updates ───────────────────────────────────────────────────────────────

function UpdatesSection() {
  return (
    <div>
      <SectionTitle>App Updates</SectionTitle>
      <p className="mb-4 text-xs leading-relaxed text-slate-500">
        Zirtola checks GitHub Releases for a newer installer. When an update is found it downloads
        automatically and prompts you to restart and install.
      </p>
      <UpdateControls />
    </div>
  )
}

// ── Godot Versions ────────────────────────────────────────────────────────────

function VersionsSection() {
  const { versions, refreshVersions } = useApp()
  const { toast } = useToast()
  const [checking, setChecking] = useState(false)

  const check = async () => {
    setChecking(true)
    try {
      const result = await window.devpad.versions.checkUpdates()
      await refreshVersions()
      toast(
        result.updated ? `Added: ${result.added.join(', ')}` : 'Version definitions are up to date',
        result.updated ? 'success' : 'info',
      )
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Version check failed', 'error')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div>
      <SectionTitle>Godot Versions</SectionTitle>
      <button
        onClick={check}
        disabled={checking}
        className="mb-4 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
      >
        {checking ? 'Checking…' : 'Check for Updates'}
      </button>
      <div className="overflow-hidden rounded-md border border-panel-600">
        {versions?.versions.map((v) => (
          <div
            key={v.id}
            className="border-b border-panel-700 px-3 py-2 last:border-b-0"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-200">{v.label}</span>
              <span className="font-mono text-xs text-slate-500">{v.id}</span>
            </div>
            <div className="text-[11px] text-slate-500">hint: {v.executableHint}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── License section ───────────────────────────────────────────────────────────

function LicenseSection() {
  const { toast } = useToast()
  const { license: status, tier, config } = useApp()
  const [deactivating, setDeactivating] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [showEula, setShowEula] = useState(false)
  const [key, setKey] = useState('')
  const [activating, setActivating] = useState(false)
  const [startingTrial, setStartingTrial] = useState(false)

  const activate = async () => {
    if (!key.trim() || activating) return
    setActivating(true)
    try {
      const next = await window.devpad.license.activate(key.trim())
      if (next.state !== 'licensed') {
        toast(next.message ?? 'Activation failed', 'error')
      } else {
        setKey('')
      }
    } finally {
      setActivating(false)
    }
  }

  const startTrial = async () => {
    setStartingTrial(true)
    try {
      const next = await window.devpad.license.startTrial()
      if (next.state !== 'licensed' && next.message) toast(next.message, 'info')
    } finally {
      setStartingTrial(false)
    }
  }

  const deactivate = async () => {
    setDeactivating(true)
    try {
      const result = await window.devpad.license.deactivate()
      if (result.ok) {
        toast('This device was deactivated.', 'success')
      } else {
        toast(result.error ?? 'Deactivation failed — please try again.', 'error')
      }
    } finally {
      setDeactivating(false)
      setConfirming(false)
    }
  }

  const info = status.info

  return (
    <div>
      <SectionTitle>License</SectionTitle>

      {/* Plan summary */}
      <div className="mb-3 flex items-center gap-2 text-sm">
        <span className="text-slate-400">Current plan:</span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            tier === 'pro'
              ? 'bg-accent/15 text-accent-hover'
              : tier === 'trial'
                ? 'bg-amber-950/40 text-amber-200'
                : 'bg-panel-700 text-slate-300'
          }`}
        >
          {tier === 'pro'
            ? 'Pro'
            : tier === 'trial'
              ? `Pro trial — ${status.trialDaysLeft ?? '?'} day${(status.trialDaysLeft ?? 0) === 1 ? '' : 's'} left`
              : 'Free'}
        </span>
      </div>

      {info ? (
        <div className="mb-4 overflow-hidden rounded-md border border-panel-600">
          <Row label="Product" value={info.productName} />
          <Row label="License type" value={friendlyLicenseType(info.type)} />
          <Row label="Key" value={info.key} mono />
          <Row
            label="Devices"
            value={`${info.seatsUsed} of ${info.maxActivations} activations used`}
          />
          <Row
            label="Expires"
            value={info.expiresAt ? new Date(info.expiresAt).toLocaleDateString() : 'Never'}
          />
        </div>
      ) : (
        <p className="mb-4 text-xs text-slate-500">
          {status.state === 'checking'
            ? 'Checking your license…'
            : (status.message ??
              (tier === 'free'
                ? "You're on the Free plan — core features with your own API keys. Upgrade to Pro for the embedded game window, Asset Studio, live scene editing and Auto mode."
                : 'No license is active on this device.'))}
        </p>
      )}

      {/* Free tier: enter a key / start trial right here */}
      {tier === 'free' && (
        <div className="mb-4 rounded-md border border-panel-600 bg-panel-800 p-3">
          <p className="mb-2 text-xs font-medium text-slate-400">Have a license key?</p>
          <div className="flex gap-2">
            <input
              value={key}
              onChange={(e) => setKey(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && activate()}
              placeholder="ZIRT-XXXXX-XXXXX-XXXXX-XXXXX"
              spellCheck={false}
              className={`${inputClass} font-mono`}
            />
            <button
              onClick={activate}
              disabled={!key.trim() || activating}
              className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {activating ? 'Activating…' : 'Activate'}
            </button>
          </div>
          {(config?.trialState ?? '') !== 'used' && (
            <button
              onClick={startTrial}
              disabled={startingTrial}
              className="mt-2 w-full rounded-md border border-accent/50 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent-hover hover:bg-accent/20 disabled:opacity-50"
            >
              {startingTrial ? 'Starting…' : 'Start free 7-day Pro trial'}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <button
          onClick={() => (tier === 'pro' ? window.devpad.license.openAccount() : window.devpad.license.openPricing())}
          className="w-fit rounded-md border border-panel-600 bg-panel-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-panel-600"
        >
          {tier === 'pro' ? 'Manage your license at zirtola.com' : 'See plans & pricing at zirtola.com'}
        </button>
        {info &&
          (confirming ? (
            <div className="flex items-center gap-2 rounded-md border border-amber-600/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
              <span className="flex-1">
                Deactivate this device? Zirtola will lock until a key is activated again.
              </span>
              <button
                onClick={deactivate}
                disabled={deactivating}
                className="shrink-0 rounded-md bg-red-600 px-2.5 py-1 font-medium text-white hover:bg-red-500 disabled:opacity-60"
              >
                {deactivating ? 'Deactivating…' : 'Deactivate'}
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="shrink-0 rounded-md border border-panel-600 px-2.5 py-1 text-slate-300 hover:bg-panel-700"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="w-fit rounded-md border border-panel-600 bg-panel-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-panel-600"
            >
              Deactivate this device
            </button>
          ))}
        <button
          onClick={() => setShowEula((v) => !v)}
          className="w-fit rounded-md border border-panel-600 bg-panel-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-panel-600"
        >
          {showEula ? 'Hide License Agreement' : `View License Agreement (v${EULA_VERSION})`}
        </button>
      </div>

      {showEula && (
        <div className="mt-3 max-h-72 overflow-auto rounded-md border border-panel-600 bg-panel-800 p-3">
          <pre className="whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-slate-400">
            {EULA_TEXT}
          </pre>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-panel-600 bg-panel-800 px-3 py-2 text-xs last:border-b-0">
      <span className="text-slate-500">{label}</span>
      <span className={mono ? 'font-mono text-slate-300' : 'text-slate-300'}>{value}</span>
    </div>
  )
}

/** Server type values are case-varied (TRIAL / PERPETUAL / SUBSCRIPTION…). */
function friendlyLicenseType(type: string): string {
  switch (type.toLowerCase()) {
    case 'trial':
      return 'Trial'
    case 'perpetual':
      return 'Perpetual (one-time purchase)'
    case 'subscription':
      return 'Subscription'
    default:
      return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()
  }
}
