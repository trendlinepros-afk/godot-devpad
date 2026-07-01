import type { SceneEditProposal } from '@shared/types'

// Parses assistant replies into text + edit + scene segments. The AI emits:
//   ```zirtola-edit path="res://…"   → a full-file write (diff card)
//   ```zirtola-scene                 → JSON scene operations (scene card)
// so the chat can render them as reviewable cards instead of raw code.

export interface TextSegment {
  type: 'text'
  value: string
}
export interface EditSegment {
  type: 'edit'
  path: string
  contents: string
}
export interface SceneSegment {
  type: 'scene'
  proposal: SceneEditProposal
}
export type Segment = TextSegment | EditSegment | SceneSegment

// The closing fence must sit ALONE at the start of its own line — matching any
// "```" (the old behaviour) truncated files that legitimately contain fences
// (markdown docs, GDScript doc comments) and, in Auto mode, wrote the truncated
// file to disk. The fence may be 3+ backticks (\1 backreference: the closer
// must match the opener's length) so models can wrap fence-containing files in
// a longer outer fence, exactly like GitHub-flavored markdown.
const BLOCK_RE =
  /(`{3,})zirtola-(edit|scene)(?:\s+path=["']([^"']+)["'])?[^\n]*\r?\n([\s\S]*?)\r?\n\1[ \t]*(?=\r?\n|$)/g

export function parseSegments(content: string): Segment[] {
  const segments: Segment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  BLOCK_RE.lastIndex = 0
  while ((match = BLOCK_RE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index)
      if (text.trim()) segments.push({ type: 'text', value: text })
    }

    const kind = match[2]
    const body = match[4]
    if (kind === 'edit') {
      segments.push({ type: 'edit', path: (match[3] ?? '').trim(), contents: body.replace(/\n$/, '') })
    } else {
      // scene
      try {
        const proposal = JSON.parse(body) as SceneEditProposal
        if (proposal && Array.isArray(proposal.ops)) {
          segments.push({ type: 'scene', proposal })
        } else {
          segments.push({ type: 'text', value: match[0] })
        }
      } catch {
        // Malformed JSON — show it as text so nothing is lost.
        segments.push({ type: 'text', value: match[0] })
      }
    }
    lastIndex = BLOCK_RE.lastIndex
  }

  if (lastIndex < content.length) {
    const text = content.slice(lastIndex)
    if (text.trim()) segments.push({ type: 'text', value: text })
  }

  if (segments.length === 0) segments.push({ type: 'text', value: content })
  return segments
}

export function hasEdits(content: string): boolean {
  BLOCK_RE.lastIndex = 0
  return BLOCK_RE.test(content)
}
