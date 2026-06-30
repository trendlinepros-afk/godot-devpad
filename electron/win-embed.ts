import { createRequire } from 'node:module'
import type { EmbedRect } from '@shared/types'

// Windows-only, EXPERIMENTAL: reparent the Godot game window (a separate OS
// process) into a region of the Zirtola window using Win32 SetParent/MoveWindow
// via koffi (no native compile step). Everything here is wrapped so any failure
// degrades to the normal separate-window behaviour — it must never crash the app.
//
// This is inherently fragile (focus, DPI, per-run window discovery) and cannot
// be tested from a headless environment, so it's opt-in and off by default.

const require = createRequire(import.meta.url)

// Win32 style constants (as BigInt for 64-bit style math).
const GWL_STYLE = -16
const WS_CHILD = 0x40000000n
const WS_POPUP = 0x80000000n
const WS_CAPTION = 0x00c00000n
const WS_THICKFRAME = 0x00040000n
const WS_OVERLAPPEDWINDOW = 0x00cf0000n
const WS_VISIBLE = 0x10000000n
const SW_SHOW = 5

type Handle = number | bigint

interface Win32 {
  SetParent: (child: Handle, parent: Handle) => Handle
  MoveWindow: (h: Handle, x: number, y: number, w: number, h2: number, repaint: boolean) => boolean
  GetWindowLongPtr: (h: Handle, idx: number) => Handle
  SetWindowLongPtr: (h: Handle, idx: number, v: Handle) => Handle
  ShowWindow: (h: Handle, cmd: number) => boolean
  IsWindowVisible: (h: Handle) => boolean
  GetWindowThreadProcessId: (h: Handle, pidOut: number[]) => number
  EnumWindows: (cb: unknown, lparam: number) => boolean
  koffi: {
    proto: (s: string) => unknown
    pointer: (p: unknown) => unknown
    register: (fn: unknown, type: unknown) => unknown
    unregister: (h: unknown) => void
  }
}

let win32: Win32 | null = null
let loadAttempted = false

function load(): Win32 | null {
  if (loadAttempted) return win32
  loadAttempted = true
  if (process.platform !== 'win32') return null
  try {
    const koffi = require('koffi')
    const user32 = koffi.load('user32.dll')
    win32 = {
      SetParent: user32.func('uintptr_t __stdcall SetParent(uintptr_t, uintptr_t)'),
      MoveWindow: user32.func('bool __stdcall MoveWindow(uintptr_t, int, int, int, int, bool)'),
      GetWindowLongPtr: user32.func('intptr_t __stdcall GetWindowLongPtrW(uintptr_t, int)'),
      SetWindowLongPtr: user32.func('intptr_t __stdcall SetWindowLongPtrW(uintptr_t, int, intptr_t)'),
      ShowWindow: user32.func('bool __stdcall ShowWindow(uintptr_t, int)'),
      IsWindowVisible: user32.func('bool __stdcall IsWindowVisible(uintptr_t)'),
      GetWindowThreadProcessId: user32.func(
        'uint32 __stdcall GetWindowThreadProcessId(uintptr_t, _Out_ uint32 *)',
      ),
      EnumWindows: user32.func('bool __stdcall EnumWindows(void *, intptr_t)'),
      koffi,
    }
  } catch (err) {
    console.warn('[embed] koffi/user32 unavailable, embedding disabled:', err)
    win32 = null
  }
  return win32
}

export function isSupported(): boolean {
  return load() !== null
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
    const proto = w.koffi.proto('bool __stdcall WndEnum(uintptr_t, intptr_t)')
    const cb = w.koffi.register((hwnd: Handle) => {
      const pidOut = [0]
      w.GetWindowThreadProcessId(hwnd, pidOut)
      if (pidOut[0] === pid && w.IsWindowVisible(hwnd)) {
        found = hwnd
        return false // stop enumeration
      }
      return true
    }, w.koffi.pointer(proto))
    w.EnumWindows(cb, 0)
    w.koffi.unregister(cb)
  } catch (err) {
    console.warn('[embed] findWindowByPid failed:', err)
    return null
  }
  return found
}

function physical(rect: EmbedRect) {
  const s = rect.dpr || 1
  return {
    x: Math.round(rect.x * s),
    y: Math.round(rect.y * s),
    w: Math.max(1, Math.round(rect.width * s)),
    h: Math.max(1, Math.round(rect.height * s)),
  }
}

/** Reparent `childHwnd` into the Zirtola window and position it over `rect`. */
export function embed(parentHandle: Buffer, childHwnd: Handle, rect: EmbedRect): boolean {
  const w = load()
  if (!w) return false
  try {
    const parent = handleFromBuffer(parentHandle)
    // Make it a borderless child of our window.
    let style = BigInt(w.GetWindowLongPtr(childHwnd, GWL_STYLE) as unknown as bigint)
    style = (style & ~(WS_POPUP | WS_CAPTION | WS_THICKFRAME)) | WS_CHILD | WS_VISIBLE
    w.SetWindowLongPtr(childHwnd, GWL_STYLE, style)
    w.SetParent(childHwnd, parent)
    const p = physical(rect)
    w.MoveWindow(childHwnd, p.x, p.y, p.w, p.h, true)
    w.ShowWindow(childHwnd, SW_SHOW)
    return true
  } catch (err) {
    console.warn('[embed] embed failed:', err)
    return false
  }
}

/** Reposition an already-embedded child to a new rect. */
export function moveEmbedded(childHwnd: Handle, rect: EmbedRect): boolean {
  const w = load()
  if (!w) return false
  try {
    const p = physical(rect)
    return w.MoveWindow(childHwnd, p.x, p.y, p.w, p.h, true)
  } catch {
    return false
  }
}

/** Detach: restore the child to a normal standalone window. */
export function detach(childHwnd: Handle): boolean {
  const w = load()
  if (!w) return false
  try {
    w.SetParent(childHwnd, 0)
    w.SetWindowLongPtr(childHwnd, GWL_STYLE, WS_OVERLAPPEDWINDOW | WS_VISIBLE)
    w.ShowWindow(childHwnd, SW_SHOW)
    return true
  } catch {
    return false
  }
}
