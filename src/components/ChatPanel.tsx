import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessageInput } from '@shared/types'
import { Markdown } from './Markdown'
import { routeMessage } from '../lib/router'
import { useApp } from '../state/app'
import { useToast } from './Toast'
import { chatBus } from '../state/chatBus'
import { findProfile } from '../lib/profiles'
import { PaperclipIcon, SendIcon, XIcon, TrashIcon } from './Icons'

interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  screenshot?: string | null
  modelLabel?: string
  error?: boolean
  needsSettings?: boolean
}

interface ChatPanelProps {
  onOpenSettings: () => void
}

export function ChatPanel({ onOpenSettings }: ChatPanelProps) {
  const { config } = useApp()
  const { toast } = useToast()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [lastModel, setLastModel] = useState<string | null>(null)
  const counter = useRef(0)
  const feedRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const activeProfile = config ? findProfile(config.profiles, config.activeProfileId) : undefined

  // Allow the File Browser's "Send to AI" to push file contents into the input.
  useEffect(() => {
    chatBus.setListener((text) => {
      setInput((prev) => (prev ? `${prev}\n${text}` : text))
      inputRef.current?.focus()
    })
    return () => chatBus.setListener(null)
  }, [])

  // Auto-scroll to the newest message.
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  const nextId = () => {
    counter.current += 1
    return counter.current
  }

  const attachScreenshot = useCallback(async () => {
    const result = await window.devpad.capture.captureGodot()
    if (!result.ok || !result.screenshot) {
      toast(result.error ?? 'Screen capture failed', 'error')
      return
    }
    setScreenshot(result.screenshot)
    toast(result.source ? `Captured: ${result.source}` : 'Screenshot attached', 'success')
  }, [toast])

  const send = useCallback(async () => {
    const text = input.trim()
    if ((!text && !screenshot) || busy) return

    const history: ChatMessageInput[] = messages
      .filter((m) => !m.error)
      .map((m) => ({ role: m.role, content: m.content }))

    const userMsg: ChatMessage = {
      id: nextId(),
      role: 'user',
      content: text || '(screenshot)',
      screenshot,
    }
    setMessages((m) => [...m, userMsg])
    setInput('')
    const attached = screenshot
    setScreenshot(null)
    setBusy(true)

    const res = await routeMessage({ text, screenshot: attached, history })

    setBusy(false)
    if (res.ok) {
      setLastModel(res.modelLabel ?? res.modelId ?? null)
      setMessages((m) => [
        ...m,
        { id: nextId(), role: 'assistant', content: res.text, modelLabel: res.modelLabel },
      ])
    } else {
      setMessages((m) => [
        ...m,
        {
          id: nextId(),
          role: 'assistant',
          content: res.error ?? 'Something went wrong.',
          error: true,
          needsSettings: res.needsSettings,
        },
      ])
    }
  }, [input, screenshot, busy, messages])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const clearChat = () => {
    setMessages([])
    setLastModel(null)
  }

  return (
    <div className="flex h-full flex-col bg-panel-900">
      {/* Header with model badge + clear */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-panel-600 px-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          AI Chat
        </span>
        <div className="flex items-center gap-2">
          {lastModel && (
            <span className="flex items-center gap-1.5 rounded-full border border-panel-600 bg-panel-800 px-2.5 py-0.5 text-xs text-slate-300">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              {lastModel}
            </span>
          )}
          <button
            onClick={clearChat}
            title="Clear chat"
            className="grid h-6 w-6 place-items-center rounded text-slate-400 hover:bg-panel-600 hover:text-slate-200"
          >
            <TrashIcon width={14} height={14} />
          </button>
        </div>
      </div>

      {/* Message feed */}
      <div ref={feedRef} className="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="mx-auto mt-10 max-w-sm text-center text-sm text-slate-500">
            <p className="mb-2 text-slate-400">Ask anything about your Godot project.</p>
            <p className="text-xs leading-relaxed">
              Attach a screenshot with the 📎 button to have the AI look at your game window, or
              right-click a file in the browser and choose <em>Send to AI</em>.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} onOpenSettings={onOpenSettings} />
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span className="flex gap-1">
              <span className="h-2 w-2 animate-bounce rounded-full bg-slate-500 [animation-delay:-0.3s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-slate-500 [animation-delay:-0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-slate-500" />
            </span>
            Thinking…
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-panel-600 bg-panel-850 p-3">
        {screenshot && (
          <div className="relative mb-2 inline-block">
            <img
              src={`data:image/png;base64,${screenshot}`}
              alt="Attached screenshot"
              className="h-20 rounded-md border border-panel-600 object-cover"
            />
            <button
              onClick={() => setScreenshot(null)}
              className="absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-red-600 text-white hover:bg-red-500"
              title="Remove screenshot"
            >
              <XIcon width={12} height={12} />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <button
            onClick={attachScreenshot}
            title="Attach a screenshot of the Godot window"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-panel-600 bg-panel-700 text-slate-300 hover:bg-panel-600"
          >
            <PaperclipIcon width={16} height={16} />
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={
              activeProfile ? `Message ${activeProfile.name}…` : 'Type a message…'
            }
            className="max-h-40 min-h-[2.25rem] flex-1 resize-none rounded-md border border-panel-600 bg-panel-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-accent focus:outline-none"
          />
          <button
            onClick={send}
            disabled={busy || (!input.trim() && !screenshot)}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-panel-600 disabled:text-slate-500"
          >
            <SendIcon width={15} height={15} /> Send
          </button>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  onOpenSettings,
}: {
  message: ChatMessage
  onOpenSettings: () => void
}) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
          isUser
            ? 'bg-accent text-white'
            : message.error
              ? 'border border-red-600/50 bg-red-950/30 text-red-200'
              : 'border border-panel-600 bg-panel-800 text-slate-200'
        }`}
      >
        {message.screenshot && (
          <img
            src={`data:image/png;base64,${message.screenshot}`}
            alt="screenshot"
            className="mb-2 max-h-48 rounded-lg border border-white/20"
          />
        )}
        {isUser ? (
          <div className="markdown-body whitespace-pre-wrap text-sm">{message.content}</div>
        ) : (
          <div>
            <Markdown>{message.content}</Markdown>
            {message.needsSettings && (
              <button
                onClick={onOpenSettings}
                className="mt-2 rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-500"
              >
                Open Settings → API Keys
              </button>
            )}
            {message.modelLabel && (
              <div className="mt-1.5 text-[11px] text-slate-500">via {message.modelLabel}</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
