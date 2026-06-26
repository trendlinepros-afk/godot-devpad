import { useEffect, useState } from 'react'
import type { MonitorPosition, DisplayInfo, ProviderId } from '@shared/types'
import { useApp } from '../state/app'
import { useToast } from './Toast'
import { detectVersionFromPath } from '../lib/godot-versions'
import { XIcon, StarIcon, EditIcon, PlusIcon } from './Icons'

type Section = 'ai' | 'godot' | 'mcp' | 'window' | 'versions'

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'ai', label: 'AI / Models' },
  { key: 'godot', label: 'Godot' },
  { key: 'mcp', label: 'MCP Server' },
  { key: 'window', label: 'Window' },
  { key: 'versions', label: 'Godot Versions' },
]

interface Props {
  onClose: () => void
  onOpenProfiles: () => void
}

export function SettingsPanel({ onClose, onOpenProfiles }: Props) {
  const [section, setSection] = useState<Section>('ai')

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
            {section === 'ai' && <AiSection onOpenProfiles={onOpenProfiles} />}
            {section === 'godot' && <GodotSection />}
            {section === 'mcp' && <McpSection />}
            {section === 'window' && <WindowSection />}
            {section === 'versions' && <VersionsSection />}
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

// ── AI / Models (API keys + profiles) — the dedicated AI settings page ────────

function AiSection({ onOpenProfiles }: { onOpenProfiles: () => void }) {
  const { config, update } = useApp()
  const { toast } = useToast()
  const [keys, setKeys] = useState(config?.apiKeys ?? { deepseek: '', gemini: '', openai: '' })
  const [testing, setTesting] = useState<ProviderId | null>(null)

  useEffect(() => {
    if (config) setKeys(config.apiKeys)
  }, [config])

  if (!config) return null

  const saveKeys = async (next: typeof keys) => {
    setKeys(next)
    await update({ apiKeys: next })
  }

  const test = async (provider: ProviderId) => {
    setTesting(provider)
    // Persist first so the main process tests the latest value.
    await update({ apiKeys: keys })
    const result = await window.devpad.ai.testConnection(provider)
    setTesting(null)
    toast(result.message, result.ok ? 'success' : 'error')
  }

  const keyRow = (label: string, provider: Exclude<ProviderId, 'mcp'>) => (
    <div className="mb-3">
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      <div className="flex gap-2">
        <input
          type="password"
          value={keys[provider]}
          placeholder={`${label}…`}
          onChange={(e) => setKeys({ ...keys, [provider]: e.target.value })}
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

  return (
    <div>
      <SectionTitle>API Keys</SectionTitle>
      <p className="mb-3 text-xs leading-relaxed text-slate-500">
        Keys are stored locally and encrypted in electron-store. Nothing is uploaded. At least one
        key is required to chat (MCP Mode needs none).
      </p>
      {keyRow('DeepSeek API Key', 'deepseek')}
      {keyRow('Gemini API Key', 'gemini')}
      {keyRow('OpenAI API Key', 'openai')}

      <div className="my-5 border-t border-panel-600" />

      <SectionTitle>Model Profiles</SectionTitle>
      <p className="mb-3 text-xs leading-relaxed text-slate-500">
        Profiles map each AI task (chat, vision, vision→code, file analysis) to a specific model.
        Switch the active profile here or in the toolbar.
      </p>
      <div className="mb-3 overflow-hidden rounded-md border border-panel-600">
        {config.profiles.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-2 border-b border-panel-700 px-3 py-2 last:border-b-0"
          >
            <span className="w-4">
              {p.id === config.activeProfileId && (
                <StarIcon width={13} height={13} className="text-accent-hover" />
              )}
            </span>
            <span className="flex-1 truncate text-sm text-slate-200">
              {p.name}
              {p.isDefault && <span className="ml-2 text-[10px] text-slate-500">built-in</span>}
            </span>
            {p.id !== config.activeProfileId && (
              <button
                onClick={() => update({ activeProfileId: p.id })}
                className="rounded border border-panel-600 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-panel-700"
              >
                Set active
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onOpenProfiles}
          className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
        >
          <EditIcon width={14} height={14} /> Manage Profiles
        </button>
        <button
          onClick={onOpenProfiles}
          className="flex items-center gap-1.5 rounded-md border border-panel-600 bg-panel-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-panel-600"
        >
          <PlusIcon width={14} height={14} /> New Profile
        </button>
      </div>
    </div>
  )
}

// ── Godot ─────────────────────────────────────────────────────────────────────

function GodotSection() {
  const { config, versions, update } = useApp()
  const { toast } = useToast()
  if (!config || !versions) return null

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
      <p className="text-xs leading-relaxed text-slate-500">
        The selected version's system prompt is prepended to every AI request, keeping suggestions
        on the right GDScript dialect.
      </p>
    </div>
  )
}

// ── MCP Server ────────────────────────────────────────────────────────────────

function McpSection() {
  const { mcpStatus, refreshMcp } = useApp()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)

  const toggle = async () => {
    setBusy(true)
    await window.devpad.mcp.setEnabled(!mcpStatus.enabled)
    await refreshMcp()
    setBusy(false)
  }

  const snippet = `{
  "mcpServers": {
    "devpad": {
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
            Lets Claude Code drive DevPad's tools locally.
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
        DevPad is designed to sit on a second monitor next to the Godot window. Only monitors that
        are actually connected are shown. Window size and position are remembered.
      </p>
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
    const result = await window.devpad.versions.checkUpdates()
    await refreshVersions()
    setChecking(false)
    toast(
      result.updated ? `Added: ${result.added.join(', ')}` : 'Version definitions are up to date',
      result.updated ? 'success' : 'info',
    )
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
