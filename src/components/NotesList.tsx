import { useMemo, useState } from 'react'
import { useApp } from '../state/app'
import { newNote, sortNotes, noteTitle, notePreview } from '../lib/notes'
import { PlusIcon, SearchIcon, SparkleIcon } from './Icons'

interface Props {
  selectedId: string | null
  onSelect: (id: string) => void
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(ts).toLocaleDateString()
}

export function NotesList({ selectedId, onSelect }: Props) {
  const { config, update } = useApp()
  const [query, setQuery] = useState('')

  const notes = useMemo(() => sortNotes(config?.notes ?? []), [config?.notes])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return notes
    return notes.filter(
      (n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q),
    )
  }, [notes, query])

  const pinnedCount = notes.filter((n) => n.pinnedToAi).length

  const create = async () => {
    const note = newNote()
    await update({ notes: [note, ...(config?.notes ?? [])] })
    onSelect(note.id)
  }

  return (
    <div className="flex h-full flex-col bg-panel-850">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-panel-600 px-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Notes</span>
        <button
          onClick={create}
          title="New note"
          className="grid h-6 w-6 place-items-center rounded text-slate-400 hover:bg-panel-600 hover:text-slate-200"
        >
          <PlusIcon width={15} height={15} />
        </button>
      </div>

      {/* Search */}
      <div className="border-b border-panel-700 p-2">
        <div className="flex items-center gap-2 rounded-md border border-panel-600 bg-panel-800 px-2">
          <SearchIcon width={13} height={13} className="text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes…"
            className="w-full bg-transparent py-1.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
          />
        </div>
      </div>

      {/* AI-context hint */}
      <div className="flex items-center gap-1.5 border-b border-panel-700 px-3 py-1.5 text-[11px] text-slate-500">
        <SparkleIcon width={12} height={12} className="text-accent-hover" />
        {pinnedCount > 0
          ? `${pinnedCount} note${pinnedCount > 1 ? 's' : ''} shared with AI`
          : 'No notes shared with AI yet'}
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-auto">
        {filtered.length === 0 && (
          <p className="px-3 py-4 text-xs leading-relaxed text-slate-500">
            {notes.length === 0
              ? 'No notes yet. Click + to capture ideas, todos, and plans — pinned notes are shared with every AI so they understand the bigger picture.'
              : 'No notes match your search.'}
          </p>
        )}
        {filtered.map((n) => (
          <button
            key={n.id}
            onClick={() => onSelect(n.id)}
            className={`block w-full border-b border-panel-800 px-3 py-2 text-left ${
              n.id === selectedId ? 'bg-panel-700' : 'hover:bg-panel-800'
            }`}
          >
            <div className="flex items-center gap-1.5">
              {n.pinnedToAi && (
                <SparkleIcon width={11} height={11} className="shrink-0 text-accent-hover" />
              )}
              <span className="flex-1 truncate text-sm text-slate-200">{noteTitle(n)}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="flex-1 truncate text-[11px] text-slate-500">{notePreview(n)}</span>
              <span className="shrink-0 text-[10px] text-slate-600">{relativeTime(n.updatedAt)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
