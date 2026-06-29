// Tiny pub/sub so other panels (File Browser "Send to AI", the Godot console's
// "Fix this error") can push text into the Chat Panel — optionally submitting it
// immediately — without threading callbacks through the whole tree.

export interface InsertOptions {
  /** Submit the message immediately instead of just populating the input. */
  submit?: boolean
}

type Listener = (text: string, opts?: InsertOptions) => void

let listener: Listener | null = null

export const chatBus = {
  /** ChatPanel registers its handler here on mount. */
  setListener(l: Listener | null) {
    listener = l
  },
  /** Insert (and optionally submit) text in the chat (no-op if not mounted). */
  insert(text: string, opts?: InsertOptions) {
    listener?.(text, opts)
  },
}
