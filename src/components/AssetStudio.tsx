import { useState } from 'react'
import type { AssetKind } from '@shared/types'
import { Modal } from './Modal'
import { useToast } from './Toast'
import { chatBus } from '../state/chatBus'

// Describe → generate a game asset → save it straight into the project where
// Godot auto-imports it as a texture.

interface Props {
  onClose: () => void
  onOpenSettings: () => void
}

const KINDS: { value: AssetKind; label: string }[] = [
  { value: 'sprite', label: 'Sprite' },
  { value: 'tileset', label: 'Tile / Texture' },
  { value: 'background', label: 'Background' },
  { value: 'icon', label: 'UI Icon' },
  { value: 'concept', label: 'Concept art' },
]

const SIZES = ['1024x1024', '1024x1536', '1536x1024']

const inputClass =
  'w-full rounded-md border border-panel-600 bg-panel-800 px-3 py-2 text-sm text-slate-200 focus:border-accent focus:outline-none'

export function AssetStudio({ onClose, onOpenSettings }: Props) {
  const { toast } = useToast()
  const [prompt, setPrompt] = useState('')
  const [kind, setKind] = useState<AssetKind>('sprite')
  const [size, setSize] = useState(SIZES[0])
  const [busy, setBusy] = useState(false)
  const [image, setImage] = useState<string | null>(null)
  const [needsSettings, setNeedsSettings] = useState(false)
  const [savedPath, setSavedPath] = useState<string | null>(null)

  const generate = async () => {
    if (!prompt.trim() || busy) return
    setBusy(true)
    setNeedsSettings(false)
    setSavedPath(null)
    try {
      const res = await window.devpad.assets.generate({ prompt: prompt.trim(), kind, size })
      if (res.ok && res.base64) {
        setImage(res.base64)
      } else {
        setNeedsSettings(!!res.needsSettings)
        toast(res.error ?? 'Generation failed', 'error')
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Generation failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!image) return
    const res = await window.devpad.assets.save(image, prompt || kind)
    if (res.ok) {
      setSavedPath(res.resPath ?? null)
      toast(`Saved to ${res.resPath}`, 'success')
    } else {
      toast(res.error ?? 'Save failed', 'error')
    }
  }

  const sendToChat = () => {
    if (!image) return
    chatBus.attach(image)
    toast('Attached to chat', 'success')
    onClose()
  }

  return (
    <Modal title="Asset Studio" onClose={onClose}>
      <div className="grid max-h-[70vh] grid-cols-2 gap-4 overflow-auto p-5">
        {/* Controls */}
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Describe the asset</span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="e.g. a cute green slime enemy with big eyes"
              className={`${inputClass} resize-none`}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Type</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as AssetKind)} className={inputClass}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Size</span>
            <select value={size} onChange={(e) => setSize(e.target.value)} className={inputClass}>
              {SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={generate}
            disabled={busy || !prompt.trim()}
            className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? 'Generating…' : 'Generate'}
          </button>
          {needsSettings && (
            <button
              onClick={onOpenSettings}
              className="w-full rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
            >
              Add an OpenAI API key in Settings
            </button>
          )}
          <p className="text-[11px] leading-relaxed text-slate-500">
            Sprites, icons and tiles are generated with a transparent background. Saved assets land
            in <span className="font-mono">res://assets/generated/</span> and import automatically.
          </p>
        </div>

        {/* Preview */}
        <div className="flex flex-col">
          <div
            className="flex min-h-[16rem] flex-1 items-center justify-center rounded-lg border border-panel-600"
            style={{
              backgroundImage:
                'linear-gradient(45deg,#1d242e 25%,transparent 25%),linear-gradient(-45deg,#1d242e 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#1d242e 75%),linear-gradient(-45deg,transparent 75%,#1d242e 75%)',
              backgroundSize: '16px 16px',
              backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
            }}
          >
            {image ? (
              <img
                src={`data:image/png;base64,${image}`}
                alt="Generated asset"
                className="max-h-72 max-w-full object-contain"
              />
            ) : (
              <span className="text-sm text-slate-600">Preview appears here</span>
            )}
          </div>
          {image && (
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={save}
                className="flex-1 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
              >
                Save to Project
              </button>
              <button
                onClick={sendToChat}
                className="rounded-md border border-panel-600 bg-panel-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-panel-600"
              >
                Send to chat
              </button>
            </div>
          )}
          {savedPath && (
            <p className="mt-2 truncate text-[11px] text-emerald-400">Saved: {savedPath}</p>
          )}
        </div>
      </div>
    </Modal>
  )
}
