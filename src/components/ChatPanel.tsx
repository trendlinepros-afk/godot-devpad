import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessageInput } from '@shared/types'
import { Markdown } from './Markdown'
import { routeMessage } from '../lib/router'
import { useApp } from '../state/app'
import { useToast } from './Toast'
import { chatBus } from '../state/chatBus'
import { findProfile } from '../lib/profiles'
import { parseSegments } from '../lib/edits'
import {
  PROJECT_MEMORY_ID,
  PROJECT_MEMORY_TITLE,
  SUMMARY_INTERVAL_MS,
  buildSummaryPrompt,
  buildTranscript,
  findProjectMemory,
} from '../lib/projectMemory'
import { upsertNote } from '../lib/notes'
import { EditCard } from './EditCard'
import { SceneEditCard } from './SceneEditCard'
import { PaperclipIcon, SendIcon, XIcon, TrashIcon } from './Icons'

interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  screenshot?: string | null
  modelLabel?: string
  error?: boolean
  needsSettings?: boolean
  // Captured at the moment the reply arrived — switching the toolbar to Auto
  // later must NOT retroactively apply old pending edit cards.
  autoApply?: boolean
}

interface ChatPanelProps {
  onOpenSettings: () => void
}

export function ChatPanel({ onOpenSettings }: ChatPanelProps) {
  const { config, update, tier } = useApp()
  const { toast } = useToast()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [lastModel, setLastModel] = useState<string | null>(null)
  // Autonomy mode is global (toolbar): 'chat' read-only, 'ask' approve, 'auto' apply.
  const agentMode = config?.agentMode ?? 'ask'
  const counter = useRef(0)
  const feedRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const activeProfile = config ? findProfile(config.profiles, config.activeProfileId) : undefined

  // Let other panels push text into the chat. With { submit:true } (the Godot
  // console's "Fix" button) the message is sent immediately via sendRef.
  useEffect(() => {
    chatBus.setListener((text, opts) => {
      if (opts?.submit) {
        void sendRef.current({ text }).then((sent) => {
          // Chat was busy — don't drop the request silently; queue it in the
          // composer and tell the user.
          if (!sent) {
            setInput((prev) => (prev ? `${prev}\n${text}` : text))
            inputRef.current?.focus()
            toast('The AI is busy — your request is in the message box, press Send.', 'info')
          }
        })
        return
      }
      setInput((prev) => (prev ? `${prev}\n${text}` : text))
      inputRef.current?.focus()
    })
    chatBus.setAttachListener((base64) => {
      setScreenshot(base64)
      inputRef.current?.focus()
    })
    return () => {
      chatBus.setListener(null)
      chatBus.setAttachListener(null)
    }
  }, [toast])

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

  const send = useCallback(
    async (override?: { text?: string; mode?: 'plan' | 'build' }): Promise<boolean> => {
      const text = (override?.text ?? input).trim()
      if ((!text && !screenshot) || busy) return false

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

      try {
        const res = await routeMessage({
          text,
          screenshot: attached,
          history,
          mode: override?.mode ?? (agentMode === 'chat' ? 'plan' : 'build'),
        })

        if (res.ok) {
          setLastModel(res.modelLabel ?? res.modelId ?? null)
          setMessages((m) => [
            ...m,
            {
              id: nextId(),
              role: 'assistant',
              content: res.text,
              modelLabel: res.modelLabel,
              // Auto mode is a Pro feature — Free tier always reviews edits.
              autoApply: agentMode === 'auto' && tier !== 'free',
            },
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
      } finally {
        // Never leave the "Thinking…" state stuck if routing throws.
        setBusy(false)
      }
      return true
    },
    [input, screenshot, busy, messages, agentMode, tier],
  )

  // Keep a ref to the latest send so the chatBus listener can submit.
  const sendRef = useRef(send)
  sendRef.current = send

  // ── Project Memory: AI-maintained summary note ─────────────────────────────
  // Every SUMMARY_INTERVAL_MS of chat activity (and on demand) the conversation
  // is distilled into the pinned "Project Summary" note, so brand-new chats
  // start with full project context instead of re-reviewing everything.
  const [summarizing, setSummarizing] = useState(false)
  const summarizedCount = useRef(0) // messages already covered by the summary

  const updateSummary = useCallback(
    async (manual = false): Promise<void> => {
      if (summarizing) return
      const turns = messages
        .filter((m) => !m.error)
        .map((m) => ({ role: m.role, content: m.content }))
      if (turns.length < 2) {
        if (manual) toast('Chat a bit first — there is nothing to summarize yet.', 'info')
        return
      }
      if (!manual && turns.length === summarizedCount.current) return // nothing new
      setSummarizing(true)
      try {
        const existing = findProjectMemory(config?.notes ?? [])
        const res = await routeMessage({
          text: buildSummaryPrompt(existing?.content ?? '', buildTranscript(turns)),
          history: [],
          fileAnalysis: true,
          mode: 'plan', // summarization must never emit edit blocks
        })
        if (!res.ok || !res.text.trim()) {
          if (manual) toast(res.error ?? 'Could not update the summary.', 'error')
          return
        }
        const now = Date.now()
        const note = {
          id: PROJECT_MEMORY_ID,
          title: PROJECT_MEMORY_TITLE,
          content: res.text.trim(),
          pinnedToAi: true,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        }
        await update({ notes: upsertNote(config?.notes ?? [], note) })
        summarizedCount.current = turns.length
        toast('Project summary updated — see the Notes tab', 'success')
      } finally {
        setSummarizing(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, summarizing, config?.notes, update, toast],
  )
  const updateSummaryRef = useRef(updateSummary)
  updateSummaryRef.current = updateSummary

  const busyRef = useRef(busy)
  busyRef.current = busy

  // Interval-driven refresh — runs only when there's new conversation and the
  // chat isn't mid-request (the refs always see the latest state).
  useEffect(() => {
    const t = setInterval(() => {
      if (!busyRef.current) void updateSummaryRef.current(false)
    }, SUMMARY_INTERVAL_MS)
    return () => clearInterval(t)
  }, [])

  // Approve the plan: switch to Ask mode and tell the AI to implement it.
  // The mode is passed explicitly — `send`'s closure still sees the old
  // agentMode ('chat' → 'plan') until the config update re-renders, which
  // would make the AI answer with yet another plan instead of building.
  const approvePlan = async () => {
    await update({ agentMode: 'ask' })
    sendRef.current({
      text: 'The plan looks good. Implement it now — make the file and scene edits.',
      mode: 'build',
    })
  }

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
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            AI Chat
          </span>
          <span className="rounded-full border border-panel-600 bg-panel-800 px-2 py-0.5 text-[11px] text-slate-400">
            {agentMode === 'chat'
              ? 'Read-only'
              : agentMode === 'auto'
                ? 'Auto-applying edits'
                : 'Asks before editing'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {lastModel && (
            <span className="flex items-center gap-1.5 rounded-full border border-panel-600 bg-panel-800 px-2.5 py-0.5 text-xs text-slate-300">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              {lastModel}
            </span>
          )}
          <button
            onClick={() => updateSummary(true)}
            disabled={summarizing || busy}
            title="Summarize this conversation into the Project Summary note (auto-updates every 15 min)"
            className="flex items-center gap-1 rounded-md border border-panel-600 bg-panel-700 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-panel-600 disabled:opacity-50"
          >
            {summarizing ? (
              <span className="h-3 w-3 animate-spin rounded-full border border-panel-500 border-t-accent" />
            ) : (
              '🧠'
            )}
            {summarizing ? 'Summarizing…' : 'Update summary'}
          </button>
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
      <div className="shrink-0 border-t border-panel-600 bg-panel-850 p-3" data-tour="composer">
        {agentMode === 'chat' && (
          <div className="mb-2 flex items-center gap-2 rounded-md border border-amber-600/40 bg-amber-950/20 px-3 py-1.5 text-xs text-amber-200">
            <span className="flex-1">
              Read-only mode — the AI answers and plans but won't edit files.
            </span>
            <button
              onClick={approvePlan}
              disabled={busy || messages.length === 0}
              className="shrink-0 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50"
            >
              Approve &amp; Build
            </button>
          </div>
        )}
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
            onClick={() => send()}
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
  // Per-message: only replies that arrived while in Auto mode self-apply.
  const autoApply = message.autoApply ?? false
  const isUser = message.role === 'user'
  const segments = !isUser && !message.error ? parseSegments(message.content) : null
  const containsEdit = segments?.some((s) => s.type === 'edit' || s.type === 'scene') ?? false
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`rounded-2xl px-4 py-2.5 ${containsEdit ? 'w-full max-w-full' : 'max-w-[85%]'} ${
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
            {segments ? (
              segments.map((seg, i) =>
                seg.type === 'edit' ? (
                  <EditCard key={i} path={seg.path} contents={seg.contents} autoApply={autoApply} />
                ) : seg.type === 'scene' ? (
                  <SceneEditCard key={i} proposal={seg.proposal} autoApply={autoApply} />
                ) : (
                  <Markdown key={i}>{seg.value}</Markdown>
                ),
              )
            ) : (
              <Markdown>{message.content}</Markdown>
            )}
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
