// Tiny pub/sub so the File Browser's "Send to AI" action can inject text into
// the Chat Panel's input without threading callbacks through the whole tree.

type Listener = (text: string) => void

let listener: Listener | null = null

export const chatBus = {
  /** ChatPanel registers its input-setter here on mount. */
  setListener(l: Listener | null) {
    listener = l
  },
  /** Insert/append text into the chat input (no-op if the panel isn't mounted). */
  insert(text: string) {
    listener?.(text)
  },
}
