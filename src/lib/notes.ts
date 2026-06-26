import type { Note } from '@shared/types'

// Pure helpers for the notes collection. CRUD is performed against the persisted
// config (electron-store) via the app's update() — these functions just produce
// the next notes array.

let counter = 0
function id(): string {
  counter += 1
  return `note-${Date.now().toString(36)}-${counter}`
}

export function newNote(partial?: Partial<Note>): Note {
  const now = Date.now()
  return {
    id: id(),
    title: '',
    content: '',
    pinnedToAi: true,
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}

export function upsertNote(notes: Note[], note: Note): Note[] {
  const exists = notes.some((n) => n.id === note.id)
  const stamped = { ...note, updatedAt: Date.now() }
  return exists ? notes.map((n) => (n.id === note.id ? stamped : n)) : [stamped, ...notes]
}

export function deleteNote(notes: Note[], noteId: string): Note[] {
  return notes.filter((n) => n.id !== noteId)
}

/** Newest-updated first. */
export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => b.updatedAt - a.updatedAt)
}

export function noteIsEmpty(note: Note): boolean {
  return !note.title.trim() && !note.content.trim()
}

/** A short preview line for the list view. */
export function notePreview(note: Note): string {
  const firstLine = note.content
    .replace(/[#>*_`~-]/g, '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  return firstLine ?? 'Empty note'
}

export function noteTitle(note: Note): string {
  if (note.title.trim()) return note.title.trim()
  return notePreview(note).slice(0, 48) || 'Untitled note'
}
