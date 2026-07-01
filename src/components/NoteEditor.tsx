import { useCallback, useEffect, useRef, useState } from 'react'
import type { Note } from '@shared/types'
import { useApp } from '../state/app'
import { useToast } from './Toast'
import { Markdown } from './Markdown'
import { deleteNote, upsertNote, newNote } from '../lib/notes'
import { TrashIcon, SparkleIcon, NoteIcon, PlusIcon } from './Icons'

type ViewMode = 'write' | 'split' | 'preview'

interface Props {
  noteId: string | null
  onSelect: (id: string | null) => void
}

export function NoteEditor({ noteId, onSelect }: Props) {
  const { config, update } = useApp()
  const { toast } = useToast()
  const note = config?.notes.find((n) => n.id === noteId) ?? null

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [pinned, setPinned] = useState(true)
  const [view, setView] = useState<ViewMode>('split')
  const [saved, setSaved] = useState(true)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Holds the latest edited note so we can flush-save when switching notes.
  const latest = useRef<Note | null>(null)

  // Load the selected note into local edit state (only when the note id changes).
  useEffect(() => {
    if (note) {
      setTitle(note.title)
      setContent(note.content)
      setPinned(note.pinnedToAi)
      setSaved(true)
      latest.current = note
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId])

  const persist = useCallback(
    async (next: Note) => {
      latest.current = next
      await update({ notes: upsertNote(config?.notes ?? [], next) })
      setSaved(true)
    },
    [config?.notes, update],
  )

  const scheduleSave = useCallback(
    (patch: Partial<Note>) => {
      if (!note) return
      const next: Note = { ...note, ...latest.current, ...patch }
      latest.current = next
      setSaved(false)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => persist(next), 500)
    },
    [note, persist],
  )

  // Flush any pending (debounced) save immediately. Kept in a ref so the
  // unmount/switch cleanup always calls the latest version — otherwise it would
  // close over a stale `saved`/`persist` and silently drop the last edit.
  const flush = () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
      if (latest.current) persist(latest.current)
    }
  }
  const flushRef = useRef(flush)
  flushRef.current = flush

  // Flush the pending save when unmounting or switching notes.
  useEffect(() => {
    return () => flushRef.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId])

  const onTitle = (v: string) => {
    setTitle(v)
    scheduleSave({ title: v })
  }
  const onContent = (v: string) => {
    setContent(v)
    scheduleSave({ content: v })
  }
  const togglePin = () => {
    const v = !pinned
    setPinned(v)
    scheduleSave({ pinnedToAi: v })
    toast(v ? 'Note shared with AI context' : 'Note removed from AI context', 'info')
  }

  const remove = async () => {
    if (!note) return
    // Cancel any pending debounced save first — the note-switch cleanup would
    // otherwise flush it and resurrect the note we just deleted.
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    latest.current = null
    await update({ notes: deleteNote(config?.notes ?? [], note.id) })
    onSelect(null)
    toast('Note deleted', 'info')
  }

  const create = async () => {
    const n = newNote()
    await update({ notes: [n, ...(config?.notes ?? [])] })
    onSelect(n.id)
  }

  // ── Markdown formatting helpers ─────────────────────────────────────────────

  const surround = (before: string, after = before, placeholder = 'text') => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = content.slice(start, end) || placeholder
    const next = content.slice(0, start) + before + selected + after + content.slice(end)
    onContent(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.selectionStart = start + before.length
      ta.selectionEnd = start + before.length + selected.length
    })
  }

  const prefixLines = (prefix: string) => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const lineStart = content.lastIndexOf('\n', start - 1) + 1
    const block = content.slice(lineStart, end)
    const transformed = block
      .split('\n')
      .map((l) => (l.startsWith(prefix) ? l : prefix + l))
      .join('\n')
    const next = content.slice(0, lineStart) + transformed + content.slice(end)
    onContent(next)
    requestAnimationFrame(() => ta.focus())
  }

  const fmtButtons: { label: string; title: string; run: () => void }[] = [
    { label: 'B', title: 'Bold', run: () => surround('**') },
    { label: 'I', title: 'Italic', run: () => surround('*') },
    { label: 'H', title: 'Heading', run: () => prefixLines('## ') },
    { label: '“”', title: 'Quote', run: () => prefixLines('> ') },
    { label: '•', title: 'Bullet list', run: () => prefixLines('- ') },
    { label: '1.', title: 'Numbered list', run: () => prefixLines('1. ') },
    { label: '☑', title: 'Checklist', run: () => prefixLines('- [ ] ') },
    { label: '</>', title: 'Inline code', run: () => surround('`') },
    { label: '{ }', title: 'Code block', run: () => surround('\n```\n', '\n```\n', 'code') },
    { label: '🔗', title: 'Link', run: () => surround('[', '](https://)', 'label') },
  ]

  // ── Empty state ─────────────────────────────────────────────────────────────

  if (!note) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-panel-900 text-center text-slate-500">
        <NoteIcon width={40} height={40} className="mb-3 text-slate-600" />
        <p className="mb-1 text-slate-400">No note selected</p>
        <p className="mb-4 max-w-xs text-xs leading-relaxed">
          Keep your ideas, todos and plans in one place. Notes you pin are shared with every AI so
          they understand the bigger picture and where the project is headed.
        </p>
        <button
          onClick={create}
          className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
        >
          <PlusIcon width={15} height={15} /> New Note
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-panel-900">
      {/* Header: title + actions */}
      <div className="flex shrink-0 items-center gap-2 border-b border-panel-600 px-3 py-2">
        <input
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          placeholder="Note title…"
          className="flex-1 bg-transparent text-base font-medium text-slate-100 placeholder:text-slate-600 focus:outline-none"
        />
        <span className="text-[11px] text-slate-600">{saved ? 'Saved' : 'Saving…'}</span>
        <button
          onClick={togglePin}
          title={pinned ? 'Shared with AI — click to stop sharing' : 'Share this note with AI'}
          className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
            pinned
              ? 'border-accent bg-accent/15 text-accent-hover'
              : 'border-panel-600 bg-panel-700 text-slate-400 hover:bg-panel-600'
          }`}
        >
          <SparkleIcon width={13} height={13} /> AI
        </button>
        <button
          onClick={remove}
          title="Delete note"
          className="grid h-7 w-7 place-items-center rounded-md border border-panel-600 bg-panel-700 text-slate-400 hover:bg-red-900/40 hover:text-red-300"
        >
          <TrashIcon width={14} height={14} />
        </button>
      </div>

      {/* Toolbar: formatting + view mode */}
      <div className="flex shrink-0 items-center gap-1 border-b border-panel-700 px-2 py-1.5">
        {fmtButtons.map((b) => (
          <button
            key={b.title}
            onClick={b.run}
            title={b.title}
            className="grid h-7 min-w-7 place-items-center rounded px-1.5 text-xs font-semibold text-slate-300 hover:bg-panel-700"
          >
            {b.label}
          </button>
        ))}
        <div className="flex-1" />
        <div className="flex overflow-hidden rounded-md border border-panel-600">
          {(['write', 'split', 'preview'] as ViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setView(m)}
              className={`px-2.5 py-1 text-xs capitalize ${
                view === m ? 'bg-accent text-white' : 'bg-panel-700 text-slate-300 hover:bg-panel-600'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {(view === 'write' || view === 'split') && (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => onContent(e.target.value)}
            placeholder="Write in markdown… (current state, goals, todos, future plans)"
            className={`min-h-0 resize-none bg-panel-900 p-4 font-mono text-sm leading-relaxed text-slate-200 placeholder:text-slate-600 focus:outline-none ${
              view === 'split' ? 'w-1/2 border-r border-panel-700' : 'w-full'
            }`}
          />
        )}
        {(view === 'preview' || view === 'split') && (
          <div className={`min-h-0 overflow-auto p-4 ${view === 'split' ? 'w-1/2' : 'w-full'}`}>
            {content.trim() ? (
              <Markdown>{content}</Markdown>
            ) : (
              <p className="text-sm text-slate-600">Preview will appear here.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
