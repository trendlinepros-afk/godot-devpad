// Minimal line-level diff (LCS) used to preview an AI edit before it's applied.

export type DiffRowType = 'add' | 'del' | 'ctx'

export interface DiffRow {
  type: DiffRowType
  text: string
}

export interface DiffResult {
  rows: DiffRow[]
  added: number
  removed: number
  /** True when the inputs were too large and we skipped the line-by-line LCS. */
  truncated: boolean
}

const MAX_LINES = 1500

export function diffLines(oldStr: string, newStr: string): DiffResult {
  const a = oldStr.length ? oldStr.split('\n') : []
  const b = newStr.length ? newStr.split('\n') : []

  // Guard against pathological inputs (O(n*m) DP) — just show the new file.
  if (a.length > MAX_LINES || b.length > MAX_LINES) {
    return {
      rows: b.map((text) => ({ type: 'add', text })),
      added: b.length,
      removed: a.length,
      truncated: true,
    }
  }

  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const rows: DiffRow[] = []
  let added = 0
  let removed = 0
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ type: 'ctx', text: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ type: 'del', text: a[i] })
      removed++
      i++
    } else {
      rows.push({ type: 'add', text: b[j] })
      added++
      j++
    }
  }
  while (i < n) {
    rows.push({ type: 'del', text: a[i++] })
    removed++
  }
  while (j < m) {
    rows.push({ type: 'add', text: b[j++] })
    added++
  }

  return { rows, added, removed, truncated: false }
}
