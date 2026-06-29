// Parses assistant replies into text + edit segments. The AI emits file edits as
// fenced ```zirtola-edit path="res://…"  blocks (see EDIT_PROTOCOL_PROMPT in
// electron/ai/router.ts); we split those out so the chat can render them as
// reviewable diff cards instead of raw code.

export interface TextSegment {
  type: 'text'
  value: string
}
export interface EditSegment {
  type: 'edit'
  path: string
  contents: string
}
export type Segment = TextSegment | EditSegment

// path="..." or path='...'; tolerate extra whitespace and an optional language hint.
const EDIT_RE = /```zirtola-edit\s+path=["']([^"']+)["'][^\n]*\r?\n([\s\S]*?)```/g

export function parseSegments(content: string): Segment[] {
  const segments: Segment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  EDIT_RE.lastIndex = 0
  while ((match = EDIT_RE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index)
      if (text.trim()) segments.push({ type: 'text', value: text })
    }
    segments.push({
      type: 'edit',
      path: match[1].trim(),
      // Drop the single trailing newline before the closing fence.
      contents: match[2].replace(/\n$/, ''),
    })
    lastIndex = EDIT_RE.lastIndex
  }

  if (lastIndex < content.length) {
    const text = content.slice(lastIndex)
    if (text.trim()) segments.push({ type: 'text', value: text })
  }

  // If nothing matched, return the whole thing as one text segment.
  if (segments.length === 0) segments.push({ type: 'text', value: content })
  return segments
}

export function hasEdits(content: string): boolean {
  EDIT_RE.lastIndex = 0
  return EDIT_RE.test(content)
}
