import { WebSocketServer, WebSocket } from 'ws'
import type { BridgeStatus, BridgeEvent } from '@shared/types'

// Live bridge to the in-editor Zirtola addon (Godot side connects as a client).
//
// Zirtola hosts a small WebSocket server; the Godot EditorPlugin connects to it
// and speaks a tiny JSON-RPC dialect:
//   request:  { id, method, params }      (Zirtola → Godot)
//   response: { id, result } | { id, error }
//   event:    { type: "event", event, ... } (Godot → Zirtola, unsolicited)
//   hello:    { type: "hello", godotVersion, projectName }
//
// This is what makes Zirtola "engine-aware": live scene tree, in-editor capture,
// reload/run control — things an OS-level screenshot can never provide.

export const BRIDGE_PORT = 3728

let wss: WebSocketServer | null = null
let socket: WebSocket | null = null
let status: BridgeStatus = { connected: false, port: BRIDGE_PORT }

let onStatus: ((s: BridgeStatus) => void) | null = null
let onEvent: ((e: BridgeEvent) => void) | null = null

let reqId = 0
const pending = new Map<
  number,
  { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
>()

export function setBridgeHandlers(handlers: {
  onStatus: (s: BridgeStatus) => void
  onEvent: (e: BridgeEvent) => void
}): void {
  onStatus = handlers.onStatus
  onEvent = handlers.onEvent
}

export function getBridgeStatus(): BridgeStatus {
  return status
}

function setStatus(patch: Partial<BridgeStatus>): void {
  status = { ...status, ...patch }
  onStatus?.(status)
}

export function startBridgeServer(): void {
  if (wss) return
  wss = new WebSocketServer({ host: '127.0.0.1', port: BRIDGE_PORT })

  wss.on('connection', (ws) => {
    // Latest editor wins; drop any previous connection.
    if (socket && socket !== ws) {
      try {
        socket.close()
      } catch {
        /* ignore */
      }
    }
    socket = ws
    setStatus({ connected: true })

    ws.on('message', (data) => {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(data.toString())
      } catch {
        return
      }
      handleMessage(msg)
    })

    ws.on('close', () => {
      if (socket === ws) {
        socket = null
        setStatus({ connected: false, godotVersion: undefined, projectName: undefined })
        // Fail any in-flight requests.
        for (const [, p] of pending) {
          clearTimeout(p.timer)
          p.reject(new Error('Godot editor disconnected'))
        }
        pending.clear()
      }
    })

    ws.on('error', () => {
      /* connection-level errors surface via close */
    })
  })

  wss.on('error', (err) => {
    console.error('[bridge] server error', err)
  })

  console.log(`[bridge] listening on ws://127.0.0.1:${BRIDGE_PORT}`)
}

function handleMessage(msg: Record<string, unknown>): void {
  // Response to a pending request.
  if (typeof msg.id === 'number' && pending.has(msg.id)) {
    const p = pending.get(msg.id)!
    pending.delete(msg.id)
    clearTimeout(p.timer)
    if ('error' in msg && msg.error) p.reject(new Error(String(msg.error)))
    else p.resolve(msg.result)
    return
  }

  // Handshake.
  if (msg.type === 'hello') {
    setStatus({
      connected: true,
      godotVersion: typeof msg.godotVersion === 'string' ? msg.godotVersion : undefined,
      projectName: typeof msg.projectName === 'string' ? msg.projectName : undefined,
    })
    return
  }

  // Unsolicited event (errors, scene changes, runtime logs).
  if (msg.type === 'event') {
    onEvent?.(msg as BridgeEvent)
  }
}

/** Send a JSON-RPC request to the connected editor and await its response. */
export function bridgeRequest<T = unknown>(
  method: string,
  params?: Record<string, unknown>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      reject(new Error('The Zirtola Bridge addon is not connected. Open the project in Godot.'))
      return
    }
    const id = ++reqId
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`Godot did not respond to "${method}" in time.`))
    }, 12000)
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })
    socket.send(JSON.stringify({ id, method, params: params ?? {} }))
  })
}

export function stopBridgeServer(): void {
  for (const [, p] of pending) {
    clearTimeout(p.timer)
    p.reject(new Error('Bridge server stopping'))
  }
  pending.clear()
  try {
    socket?.close()
  } catch {
    /* ignore */
  }
  socket = null
  wss?.close()
  wss = null
}
