// Tiny pub/sub so other panels (File Browser "Send to AI", the Godot console's
// "Fix this error") can push text into the Chat Panel — optionally submitting it
// immediately — without threading callbacks through the whole tree.

export interface InsertOptions {
  /** Submit the message immediately instead of just populating the input. */
  submit?: boolean
}

type Listener = (text: string, opts?: InsertOptions) => void
type AttachListener = (base64: string) => void

let listener: Listener | null = null
let attachListener: AttachListener | null = null

export const chatBus = {
  /** ChatPanel registers its text handler here on mount. */
  setListener(l: Listener | null) {
    listener = l
  },
  /** Insert (and optionally submit) text in the chat (no-op if not mounted). */
  insert(text: string, opts?: InsertOptions) {
    listener?.(text, opts)
  },
  /** ChatPanel registers its screenshot-attach handler here on mount. */
  setAttachListener(l: AttachListener | null) {
    attachListener = l
  },
  /** Attach a base64 PNG (no data: prefix) to the chat composer. */
  attach(base64: string) {
    attachListener?.(base64)
  },
}
