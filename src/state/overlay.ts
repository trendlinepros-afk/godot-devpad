// Tracks how many full-screen overlays (modals, the settings drawer, the tour)
// are open. The embedded Godot window is a NATIVE child window that always
// paints above web content, so when any overlay is open the EmbedPane moves the
// game offscreen — otherwise the game would cover the modal.

let count = 0
const listeners = new Set<(n: number) => void>()

function emit() {
  for (const l of listeners) l(count)
}

export const overlay = {
  open() {
    count += 1
    emit()
  },
  close() {
    count = Math.max(0, count - 1)
    emit()
  },
  get(): number {
    return count
  },
  subscribe(fn: (n: number) => void): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
}
