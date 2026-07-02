import { useEffect, useMemo, useRef, useState } from 'react'
import type { GodotLogEntry } from '@shared/types'
import { chatBus } from '../state/chatBus'
import { useToast } from './Toast'
import { ChevronDownIcon, ChevronRightIcon, TrashIcon, SparkleIcon } from './Icons'

interface Props {
  onShowChat: () => void
}

const MAX = 800

export function GodotConsole({ onShowChat }: Props) {
  const { toast } = useToast()
  const [logs, setLogs] = useState<GodotLogEntry[]>([])
  const [tab, setTab] = useState<'output' | 'problems'>('output')
  const [collapsed, setCollapsed] = useState(true)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Merge the initial snapshot with any live entries that raced ahead of it —
    // replacing state outright would drop events that arrived first.
    window.devpad.godot.getLogs().then((initial) => {
      setLogs((prev) => {
        const seen = new Set(initial.map((l) => l.id))
        const merged = [...initial, ...prev.filter((l) => !seen.has(l.id))]
        return merged.length > MAX ? merged.slice(merged.length - MAX) : merged
      })
    })
    const off = window.devpad.godot.onLog((entry) => {
      setLogs((prev) => {
        const next = [...prev, entry]
        return next.length > MAX ? next.slice(next.length - MAX) : next
      })
      // Auto-expand the console the first time a real error appears.
      if (entry.level === 'error') setCollapsed(false)
    })
    return off
  }, [])

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight })
  }, [logs, collapsed, tab])

  const problems = useMemo(() => logs.filter((l) => l.level === 'error' || l.level === 'warn'), [logs])
  const errorCount = useMemo(() => logs.filter((l) => l.level === 'error').length, [logs])
  const shown = tab === 'problems' ? problems : logs

  const clear = async () => {
    await window.devpad.godot.clearLogs()
    setLogs([])
  }

  const fix = (entry: GodotLogEntry) => {
    const location = entry.file
      ? `${entry.file}${entry.line ? `:${entry.line}` : ''}`
      : 'my Godot project'
    chatBus.insert(
      `My Godot game hit this error in ${location}:\n\n\`\`\`\n${entry.text}\n\`\`\`\n\nExplain what's wrong in simple terms and give me the corrected code.`,
      { submit: true },
    )
    onShowChat()
    toast('Sent the error to the AI chat', 'info')
  }

  // Bundle every current error (and warning) and ask the AI to fix them all.
  const fixAll = () => {
    const errs = logs.filter((l) => l.level === 'error')
    const list = (errs.length ? errs : problems)
      .slice(-60)
      .map((l) => {
        const loc = l.file ? ` [${l.file}${l.line ? `:${l.line}` : ''}]` : ''
        return `${l.level.toUpperCase()}${loc}: ${l.text}`
      })
      .join('\n')
    chatBus.insert(
      `My Godot game is producing these console errors when it runs:\n\n\`\`\`\n${list}\n\`\`\`\n\n` +
        `Read the relevant project files, find the root cause of each, and fix them directly with edits. ` +
        `Don't ask me to change anything in the editor — make the fixes yourself. ` +
        `Use the get_godot_errors tool to confirm they're resolved after your changes.`,
      { submit: true },
    )
    onShowChat()
    toast('Asked the AI to fix all console errors', 'info')
  }

  return (
    <div className="shrink-0 border-t border-panel-600 bg-panel-850">
      {/* Header bar */}
      <div className="flex h-8 items-center gap-2 px-3 text-xs">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1 text-slate-300 hover:text-slate-100"
        >
          {collapsed ? (
            <ChevronRightIcon width={12} height={12} />
          ) : (
            <ChevronDownIcon width={12} height={12} />
          )}
          <span className="font-semibold uppercase tracking-wide">Console</span>
        </button>
        {errorCount > 0 && (
          <span className="rounded-full bg-red-600/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {errorCount} error{errorCount > 1 ? 's' : ''}
          </span>
        )}
        {problems.length > 0 && (
          <button
            onClick={fixAll}
            title="Send all console errors to the AI to fix"
            className="rounded bg-accent px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-accent-hover"
          >
            ⚡ Fix {errorCount > 0 ? `${errorCount} error${errorCount > 1 ? 's' : ''}` : 'problems'} with AI
          </button>
        )}
        <div className="flex-1" />
        {!collapsed && (
          <>
            <div className="flex overflow-hidden rounded border border-panel-600">
              {(['output', 'problems'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-2 py-0.5 capitalize ${
                    tab === t ? 'bg-accent text-white' : 'bg-panel-700 text-slate-300 hover:bg-panel-600'
                  }`}
                >
                  {t === 'problems' ? `Problems (${problems.length})` : 'Output'}
                </button>
              ))}
            </div>
            <button
              onClick={clear}
              title="Clear console"
              className="grid h-6 w-6 place-items-center rounded text-slate-400 hover:bg-panel-600 hover:text-slate-200"
            >
              <TrashIcon width={13} height={13} />
            </button>
          </>
        )}
      </div>

      {/* Body */}
      {!collapsed && (
        <div ref={bodyRef} className="h-44 overflow-auto border-t border-panel-700 px-3 py-1.5 font-mono text-xs">
          {shown.length === 0 ? (
            <p className="py-6 text-center text-slate-600">
              {tab === 'problems'
                ? 'No errors or warnings. 🎉'
                : 'Run your game (▶) to see its output and errors here.'}
            </p>
          ) : (
            shown.map((entry) => (
              <div
                key={entry.id}
                className={`group flex items-start gap-2 whitespace-pre-wrap py-0.5 ${
                  entry.level === 'error'
                    ? 'text-red-300'
                    : entry.level === 'warn'
                      ? 'text-amber-300'
                      : 'text-slate-300'
                }`}
              >
                <span className="flex-1 break-words">{entry.text}</span>
                {entry.level === 'error' && (
                  <button
                    onClick={() => fix(entry)}
                    title="Ask the AI to fix this"
                    className="hidden shrink-0 items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-accent-hover group-hover:flex"
                  >
                    <SparkleIcon width={10} height={10} /> Fix
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
