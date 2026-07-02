import type { Note } from '@shared/types'

// The "Project Summary" note — Zirtola's persistent project memory. The AI
// rewrites it from the chat conversation (every ~15 minutes of activity, or
// on demand) and, because it's pinned to AI context like any other pinned
// note, every NEW chat starts already knowing the project — no re-explaining.

export const PROJECT_MEMORY_ID = 'project-memory'
export const PROJECT_MEMORY_TITLE = '📌 Project Summary (AI Memory)'

/** How often the summary refreshes while the user chats. */
export const SUMMARY_INTERVAL_MS = 15 * 60 * 1000

export function isProjectMemory(note: Pick<Note, 'id'>): boolean {
  return note.id === PROJECT_MEMORY_ID
}

export function findProjectMemory(notes: Note[]): Note | undefined {
  return notes.find(isProjectMemory)
}

/**
 * Prompt for updating the memory note. Includes the previous summary so the
 * model UPDATES it (preserving long-term facts) instead of rewriting from
 * only the current conversation window.
 */
export function buildSummaryPrompt(existingSummary: string, transcript: string): string {
  return `You maintain the "Project Summary" note for this Godot project — the persistent memory that future AI chats read to understand the project without re-reviewing everything.

Update the note using the previous version plus the latest conversation. Keep it as ONE well-structured markdown document with these sections (omit a section only if truly empty):

# Project Summary
## What this game is
## Current state (what exists and works)
## Recent changes (latest first, keep ~10)
## Architecture & key files
## Decisions & conventions
## Known issues / rough edges
## Next steps / ideas

Rules:
- PRESERVE still-true facts from the previous summary; merge in what's new; drop what's obsolete.
- Concrete over vague: name files (res:// paths), nodes, scripts and settings that were discussed or changed.
- Plain markdown only. NO code fences around the whole document, NO zirtola-edit blocks, NO commentary before or after — your entire reply becomes the note's content.

PREVIOUS SUMMARY:
${existingSummary.trim() ? existingSummary : '(none yet — this is the first summary)'}

LATEST CONVERSATION:
${transcript}`
}

/** Compact transcript of chat turns, newest-biased to fit a budget. */
export function buildTranscript(
  turns: Array<{ role: 'user' | 'assistant'; content: string }>,
  budget = 24_000,
): string {
  const lines = turns.map(
    (t) => `${t.role === 'user' ? 'User' : 'AI'}: ${t.content}`,
  )
  let out = lines.join('\n\n')
  // Keep the newest conversation when over budget.
  if (out.length > budget) out = `…(earlier conversation trimmed)…\n\n${out.slice(-budget)}`
  return out
}
