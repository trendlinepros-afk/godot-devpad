import { useCallback, useEffect, useRef, useState } from 'react'
import type { EmbedStatus } from '@shared/types'
import { useApp } from '../state/app'
import { PlayIcon } from './Icons'

// Host pane for the experimental Windows "embedded Godot" mode. When embedded
// mode is on and the game is running on Windows, the main process reparents the
// Godot window to sit exactly over this pane. This component just measures its
// own rectangle and reports it to the main process; the native window paints on
// top of this area.

interface Props {
  active: boolean
  onOpenSettings: () => void
}

const OFFSCREEN = { x: -20000, y: -20000, width: 400, height: 300 }

export function EmbedPane({ active, onOpenSettings }: Props) {
  const { config, godotStatus } = useApp()
  const ref = useRef<HTMLDivElement>(null)
  const mode = config?.godotWindowMode ?? 'separate'
  const [status, setStatus] = useState<EmbedStatus>({ supported: false, active: false })

  useEffect(() => {
    window.devpad.embed.getStatus().then(setStatus)
    return window.devpad.embed.onStatus(setStatus)
  }, [])

  const report = useCallback(() => {
    if (mode !== 'embedded') return
    const dpr = window.devicePixelRatio || 1
    if (!active) {
      window.devpad.embed.setBounds({ ...OFFSCREEN, dpr })
      return
    }
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    window.devpad.embed.setBounds({ x: r.left, y: r.top, width: r.width, height: r.height, dpr })
  }, [active, mode])

  // Report bounds when active/mode changes, and keep them in sync on resize.
  useEffect(() => {
    report()
    if (!active || mode !== 'embedded') return
    const ro = new ResizeObserver(report)
    if (ref.current) ro.observe(ref.current)
    window.addEventListener('resize', report)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', report)
    }
  }, [active, mode, report])

  // Leaving embedded mode detaches Godot back to its own window.
  useEffect(() => {
    if (mode !== 'embedded') window.devpad.embed.clear()
  }, [mode])

  const running = godotStatus.state === 'running' || godotStatus.state === 'starting'

  // Overlay messaging (shown behind / around the native window).
  let overlay: React.ReactNode = null
  if (mode !== 'embedded') {
    overlay = (
      <Message
        title="Embedded mode is off"
        body="Godot currently opens in its own window. Turn on embedded mode to dock it here."
        action={{ label: 'Open Settings → Window', onClick: onOpenSettings }}
      />
    )
  } else if (!status.supported) {
    overlay = (
      <Message
        title="Embedding is Windows-only"
        body="On this OS Godot runs in its own window. Everything else works the same."
      />
    )
  } else if (!running) {
    overlay = (
      <Message
        title="Run your game to dock it here"
        body="Press Run (F5). The Godot window will be embedded into this panel."
        icon
      />
    )
  } else if (!status.active) {
    overlay = (
      <Message
        title="Connecting to the Godot window…"
        body={status.message ?? 'Looking for the running game window to embed.'}
      />
    )
  }

  return (
    <div className="relative h-full w-full bg-black">
      {/* The native Godot window is positioned over this element by the main process. */}
      <div ref={ref} className="absolute inset-0" />
      {overlay && <div className="pointer-events-auto absolute inset-0">{overlay}</div>}
    </div>
  )
}

function Message({
  title,
  body,
  action,
  icon,
}: {
  title: string
  body: string
  action?: { label: string; onClick: () => void }
  icon?: boolean
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-panel-900 text-center">
      {icon && (
        <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-accent/15 text-accent-hover">
          <PlayIcon width={22} height={22} />
        </span>
      )}
      <p className="mb-1 text-slate-300">{title}</p>
      <p className="mb-4 max-w-sm text-xs leading-relaxed text-slate-500">{body}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
