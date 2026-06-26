import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { XIcon } from './Icons'

export type ToastKind = 'info' | 'success' | 'error'

interface Toast {
  id: number
  message: string
  kind: ToastKind
}

interface ToastContextValue {
  toast: (message: string, kind?: ToastKind) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}

const KIND_STYLES: Record<ToastKind, string> = {
  info: 'border-accent-muted bg-panel-700',
  success: 'border-emerald-600/60 bg-panel-700',
  error: 'border-red-600/60 bg-panel-700',
}

const KIND_DOT: Record<ToastKind, string> = {
  info: 'bg-accent',
  success: 'bg-emerald-400',
  error: 'bg-red-400',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counter = useRef(0)

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const toast = useCallback((message: string, kind: ToastKind = 'info') => {
    counter.current += 1
    const id = counter.current
    setToasts((t) => [...t, { id, message, kind }])
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, toast.kind === 'error' ? 7000 : 4000)
    return () => clearTimeout(timer)
  }, [toast.kind, onClose])

  return (
    <div
      className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg ${KIND_STYLES[toast.kind]}`}
    >
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${KIND_DOT[toast.kind]}`} />
      <span className="flex-1 text-panel-100/90 text-[13px] leading-snug text-slate-200">
        {toast.message}
      </span>
      <button
        onClick={onClose}
        className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-panel-600 hover:text-slate-100"
        aria-label="Dismiss"
      >
        <XIcon width={13} height={13} />
      </button>
    </div>
  )
}
