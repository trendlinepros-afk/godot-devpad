import { createRequire } from 'node:module'

// Windows-only, EXPERIMENTAL: dock the Godot game window (a separate OS process)
// over a region of the Zirtola window. We turn Godot's window into a borderless
// top-level window OWNED by ours and keep it positioned over the Game pane (via
// Win32 calls through koffi — no native compile step). It must be a top-level
// window, NOT a child: a child can never be the foreground window, and Godot's
// captured-mouse camera only receives raw mouse input while it is foreground.
// Everything here is wrapped so any failure degrades to the normal separate
// window behaviour — it must never crash the app.
//
// This is inherently fragile (focus, DPI, per-run window discovery) and cannot
// be tested from a headless environment, so it's opt-in and off by default.

const require = createRequire(import.meta.url)

// Win32 style constants (as BigInt for 64-bit style math).
const GWL_STYLE = -16
const GWLP_HWNDPARENT = -8 // sets the OWNER of a top-level window (not the parent)
const WS_CHILD = 0x40000000n
const WS_POPUP = 0x80000000n
const WS_CAPTION = 0x00c00000n
const WS_THICKFRAME = 0x00040000n
const WS_OVERLAPPEDWINDOW = 0x00cf0000n
const WS_VISIBLE = 0x10000000n
const SW_SHOW = 5
const SW_HIDE = 0

/** Physical-pixel screen rectangle for positioning the overlay window. */
interface ScreenRect {
  x: number
  y: number
  width: number
  height: number
}

type Handle = number | bigint

interface Win32 {
  MoveWindow: (h: Handle, x: number, y: number, w: number, h2: number, repaint: boolean) => boolean
  GetWindowLongPtr: (h: Handle, idx: number) => Handle
  SetWindowLongPtr: (h: Handle, idx: number, v: Handle) => Handle
  ShowWindow: (h: Handle, cmd: number) => boolean
  IsWindowVisible: (h: Handle) => boolean
  GetWindowThreadProcessId: (h: Handle, pidOut: number[]) => number
  EnumWindows: (cb: unknown, lparam: number) => boolean
  // Connects our GUI thread's input queue to Godot's so focus/keystrokes route
  // across the process boundary.
  AttachThreadInput: (from: number, to: number, attach: boolean) => boolean
  GetCurrentThreadId: () => number
  SetFocus: (h: Handle) => Handle
  SetForegroundWindow: (h: Handle) => boolean
  koffi: {
    proto: (s: string) => unknown
    pointer: (p: unknown) => unknown
    register: (fn: unknown, type: unknown) => unknown
    unregister: (h: unknown) => void
  }
}

let win32: Win32 | null = null
let loadAttempted = false
let loadError: string | null = null

// koffi.proto() registers a type in a PROCESS-GLOBAL namespace, so it must run
// exactly once — calling it again throws "Duplicate type name". findWindowByPid
// is called repeatedly (the embed poll loop runs it ~24×), so the proto is
// cached here instead of being recreated on every call.
let wndEnumProto: unknown = null

function load(): Win32 | null {
  if (loadAttempted) return win32
  loadAttempted = true
  if (process.platform !== 'win32') {
    loadError = 'Embedding is only available on Windows.'
    return null
  }
  try {
    const koffi = require('koffi')
    const user32 = koffi.load('user32.dll')
    win32 = {
      MoveWindow: user32.func('bool __stdcall MoveWindow(uintptr_t, int, int, int, int, bool)'),
      GetWindowLongPtr: user32.func('intptr_t __stdcall GetWindowLongPtrW(uintptr_t, int)'),
      SetWindowLongPtr: user32.func('intptr_t __stdcall SetWindowLongPtrW(uintptr_t, int, intptr_t)'),
      ShowWindow: user32.func('bool __stdcall ShowWindow(uintptr_t, int)'),
      IsWindowVisible: user32.func('bool __stdcall IsWindowVisible(uintptr_t)'),
      GetWindowThreadProcessId: user32.func(
        'uint32 __stdcall GetWindowThreadProcessId(uintptr_t, _Out_ uint32 *)',
      ),
      EnumWindows: user32.func('bool __stdcall EnumWindows(void *, intptr_t)'),
      AttachThreadInput: user32.func('bool __stdcall AttachThreadInput(uint32, uint32, bool)'),
      GetCurrentThreadId: koffi.load('kernel32.dll').func('uint32 __stdcall GetCurrentThreadId()'),
      SetFocus: user32.func('uintptr_t __stdcall SetFocus(uintptr_t)'),
      SetForegroundWindow: user32.func('bool __stdcall SetForegroundWindow(uintptr_t)'),
      koffi,
    }
  } catch (err) {
    loadError = `Native module failed to load: ${err instanceof Error ? err.message : String(err)}`
    console.warn('[embed] koffi/user32 unavailable, embedding disabled:', err)
    win32 = null
  }
  return win32
}

export function isSupported(): boolean {
  return load() !== null
}

/** Why embedding is/ isn't available — surfaced to the UI for diagnosis. */
export function support(): { supported: boolean; reason?: string } {
  const ok = load() !== null
  return { supported: ok, reason: ok ? undefined : (loadError ?? 'Embedding unavailable.') }
}

/** Parent HWND (BigInt) read from Electron's getNativeWindowHandle() buffer. */
function handleFromBuffer(buf: Buffer): bigint {
  return buf.length >= 8 ? buf.readBigUInt64LE(0) : BigInt(buf.readUInt32LE(0))
}

/** Find the visible top-level window owned by `pid`. Returns its HWND or null. */
export function findWindowByPid(pid: number): Handle | null {
  const w = load()
  if (!w) return null
  let found: Handle | null = null
  try {
    if (!wndEnumProto) wndEnumProto = w.koffi.proto('bool __stdcall WndEnum(uintptr_t, intptr_t)')
    const proto = wndEnumProto
    const cb = w.koffi.register((hwnd: Handle) => {
      // Typed array for the koffi out-param (a plain [] can silently stay 0).
      const pidOut = new Uint32Array(1)
      w.GetWindowThreadProcessId(hwnd, pidOut as unknown as number[])
      if (pidOut[0] === pid && w.IsWindowVisible(hwnd)) {
        found = hwnd
        return false // stop enumeration
      }
      return true
    }, w.koffi.pointer(proto))
    try {
      w.EnumWindows(cb, 0)
    } finally {
      // koffi caps live registered callbacks; leak-free even if EnumWindows or
      // the JS callback throws (this poll runs ~24× per embed attempt).
      w.koffi.unregister(cb)
    }
  } catch (err) {
    console.warn('[embed] findWindowByPid failed:', err)
    return null
  }
  return found
}

// Window-MODIFYING Win32 calls (SetParent/ShowWindow/MoveWindow/SetWindowLongPtr)
// on a cross-process window do a synchronous round-trip between Godot's GUI
// thread and ours. If we run them on Electron's main/UI thread, that thread
// blocks inside the call and can't pump its own message loop — so the round-trip
// can never complete and the whole app deadlocks. koffi's `.async` runs the call
// on a libuv worker thread instead, leaving the UI thread free to service the
// messages, which breaks the deadlock. (Read-only calls like GetWindowLongPtr
// don't round-trip, so they stay synchronous.)
function callAsync<T = unknown>(fn: unknown, ...args: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const asyncFn = (fn as { async: (...a: unknown[]) => void }).async
    asyncFn(...args, (err: Error | null, res: T) => (err ? reject(err) : resolve(res)))
  })
}

/**
 * Dock the Godot window over `screenRect` (physical px). We make it a borderless
 * top-level window OWNED by the Zirtola window — NOT a child. A child window can
 * never be the foreground window, and Godot's captured-mouse camera reads Windows
 * raw input, which is only delivered to the foreground window. An owned top-level
 * window stays pinned above Zirtola (so it looks docked) yet can still take the
 * foreground, so mouse-look works. `screenRect` is already in physical screen px.
 */
export async function embed(
  parentHandle: Buffer,
  childHwnd: Handle,
  screenRect: ScreenRect,
): Promise<boolean> {
  const w = load()
  if (!w) return false
  try {
    const owner = handleFromBuffer(parentHandle)
    // Hide first so there are no repaint/DWM round-trips while we restyle/move it.
    await callAsync(w.ShowWindow, childHwnd, SW_HIDE)
    // Borderless top-level popup (read style sync, write async).
    let style = BigInt(w.GetWindowLongPtr(childHwnd, GWL_STYLE) as unknown as bigint)
    style = (style & ~(WS_CHILD | WS_CAPTION | WS_THICKFRAME)) | WS_POPUP
    await callAsync(w.SetWindowLongPtr, childHwnd, GWL_STYLE, style)
    // Own it to the Zirtola window so it stays pinned above and minimises with us.
    await callAsync(w.SetWindowLongPtr, childHwnd, GWLP_HWNDPARENT, owner)
    const r = screenRect
    await callAsync(w.MoveWindow, childHwnd, r.x, r.y, Math.max(1, r.width), Math.max(1, r.height), false)
    await callAsync(w.ShowWindow, childHwnd, SW_SHOW)
    return true
  } catch (err) {
    console.warn('[embed] embed failed:', err)
    // We hid the window first — if anything after that failed, the user's game
    // is invisible and half-restyled. Best-effort restore to a normal window.
    try {
      await callAsync(w.SetWindowLongPtr, childHwnd, GWLP_HWNDPARENT, 0)
      await callAsync(w.SetWindowLongPtr, childHwnd, GWL_STYLE, WS_OVERLAPPEDWINDOW | WS_VISIBLE)
      await callAsync(w.ShowWindow, childHwnd, SW_SHOW)
    } catch {
      /* window may already be gone */
    }
    return false
  }
}

/** Reposition the docked window to a new physical screen rect. */
export async function moveEmbedded(childHwnd: Handle, screenRect: ScreenRect): Promise<boolean> {
  const w = load()
  if (!w) return false
  try {
    const r = screenRect
    await callAsync(w.MoveWindow, childHwnd, r.x, r.y, Math.max(1, r.width), Math.max(1, r.height), false)
    return true
  } catch {
    return false
  }
}

// The embedded game lives on another process's GUI thread. For focus/keystrokes
// to route across the boundary, our UI thread's input queue must stay attached
// to the game's thread while it's on-screen — a one-shot SetFocus is ignored
// once the queues detach. We keep the attach alive and toggle it with the
// game's on-screen state.
let attachedChildThread: number | null = null

/**
 * Connect our input queue to the embedded game's thread and focus it. Pass
 * `foreground=true` to also pull the game to the foreground (done once, right
 * after embedding, so its captured-mouse camera gets raw input immediately).
 * We do NOT force foreground on later calls — the game is a normal top-level
 * window that takes focus when clicked, and stealing it back would stop the
 * user from clicking Zirtola's own toolbar/tabs.
 *
 * AttachThreadInput/SetFocus/SetForegroundWindow run SYNCHRONOUSLY on the UI
 * thread (not via callAsync): they're cheap, don't do the heavy cross-window
 * round-trip that deadlocks, and SetFocus only works from the thread that is
 * actually attached to the game — a worker thread isn't, so it would no-op.
 */
export async function attachInput(childHwnd: Handle, foreground = false): Promise<void> {
  const w = load()
  if (!w) return
  try {
    const uiThread = w.GetCurrentThreadId()
    const childThread = w.GetWindowThreadProcessId(childHwnd, new Uint32Array(1) as unknown as number[])
    if (!childThread || uiThread === childThread) return
    if (attachedChildThread !== childThread) {
      if (attachedChildThread != null) w.AttachThreadInput(uiThread, attachedChildThread, false)
      w.AttachThreadInput(uiThread, childThread, true)
      attachedChildThread = childThread
    }
    w.SetFocus(childHwnd)
    if (foreground) w.SetForegroundWindow(childHwnd)
  } catch (err) {
    console.warn('[embed] attachInput failed:', err)
  }
}

/** Disconnect our input queue from the embedded game's thread. */
export async function detachInput(): Promise<void> {
  const w = load()
  if (!w || attachedChildThread == null) return
  try {
    const uiThread = w.GetCurrentThreadId()
    const child = attachedChildThread
    attachedChildThread = null
    w.AttachThreadInput(uiThread, child, false)
  } catch (err) {
    console.warn('[embed] detachInput failed:', err)
  }
}

/** Detach: restore the game to a normal standalone window. */
export async function detach(childHwnd: Handle): Promise<boolean> {
  const w = load()
  if (!w) return false
  try {
    // Drop the owner and restore a normal titled, resizable window.
    await callAsync(w.SetWindowLongPtr, childHwnd, GWLP_HWNDPARENT, 0)
    await callAsync(w.SetWindowLongPtr, childHwnd, GWL_STYLE, WS_OVERLAPPEDWINDOW | WS_VISIBLE)
    await callAsync(w.ShowWindow, childHwnd, SW_SHOW)
    return true
  } catch {
    return false
  }
}
