import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react'
import { TOUR_STEPS, type TourStep } from '../lib/tourSteps'
import { useApp } from './app'

interface TourContextValue {
  start: () => void
  active: boolean
}

const TourContext = createContext<TourContextValue | null>(null)

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext)
  if (!ctx) throw new Error('useTour must be used within <TourProvider>')
  return ctx
}

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

const PAD = 6

export function TourProvider({ children }: { children: ReactNode }) {
  const { update } = useApp()
  const [active, setActive] = useState(false)
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)

  const start = useCallback(() => {
    setIndex(0)
    setActive(true)
  }, [])

  const finish = useCallback(() => {
    setActive(false)
    setRect(null)
    update({ tourComplete: true }).catch(() => {})
  }, [update])

  const step: TourStep | undefined = active ? TOUR_STEPS[index] : undefined

  // Measure the current step's target element (if any).
  useLayoutEffect(() => {
    if (!active || !step) return
    const measure = () => {
      if (!step.target) {
        setRect(null)
        return
      }
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)
      if (!el) {
        setRect(null)
        return
      }
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [active, step, index])

  // Allow Esc to dismiss, arrow keys to navigate.
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish()
      else if (e.key === 'ArrowRight') setIndex((i) => Math.min(TOUR_STEPS.length - 1, i + 1))
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, finish])

  const isLast = index === TOUR_STEPS.length - 1
  const next = () => (isLast ? finish() : setIndex((i) => i + 1))
  const back = () => setIndex((i) => Math.max(0, i - 1))

  return (
    <TourContext.Provider value={{ start, active }}>
      {children}
      {active && step && (
        <TourOverlay
          step={step}
          rect={rect}
          index={index}
          total={TOUR_STEPS.length}
          isLast={isLast}
          onNext={next}
          onBack={back}
          onSkip={finish}
        />
      )}
    </TourContext.Provider>
  )
}

function TourOverlay({
  step,
  rect,
  index,
  total,
  isLast,
  onNext,
  onBack,
  onSkip,
}: {
  step: TourStep
  rect: Rect | null
  index: number
  total: number
  isLast: boolean
  onNext: () => void
  onBack: () => void
  onSkip: () => void
}) {
  const CARD_W = 340
  const vw = window.innerWidth
  const vh = window.innerHeight

  // Card position: near the target per placement, else centered.
  let cardStyle: React.CSSProperties
  if (!rect) {
    cardStyle = {
      left: vw / 2 - CARD_W / 2,
      top: vh / 2 - 90,
      width: CARD_W,
    }
  } else {
    const placement = step.placement ?? 'bottom'
    let left = rect.left + rect.width / 2 - CARD_W / 2
    let top: number
    if (placement === 'top') top = rect.top - 12 - 150
    else if (placement === 'left') {
      left = rect.left - CARD_W - 16
      top = rect.top
    } else if (placement === 'right') {
      left = rect.left + rect.width + 16
      top = rect.top
    } else {
      top = rect.top + rect.height + 12
    }
    left = Math.max(12, Math.min(left, vw - CARD_W - 12))
    top = Math.max(12, Math.min(top, vh - 180))
    cardStyle = { left, top, width: CARD_W }
  }

  return (
    <div className="fixed inset-0 z-[80]">
      {/* Dimmer with a transparent spotlight hole over the target. */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-lg ring-2 ring-accent transition-all duration-200"
          style={{
            left: rect.left - PAD,
            top: rect.top - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgba(4,8,14,0.72)',
          }}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: 'rgba(4,8,14,0.72)' }} />
      )}

      {/* Tooltip card */}
      <div
        className="absolute rounded-xl border border-panel-600 bg-panel-850 p-4 shadow-2xl"
        style={cardStyle}
      >
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-accent-hover">
          Step {index + 1} of {total}
        </div>
        <h3 className="mb-1.5 text-sm font-semibold text-slate-100">{step.title}</h3>
        <p className="mb-3 text-[13px] leading-relaxed text-slate-300">{step.body}</p>
        <div className="flex items-center justify-between">
          <button
            onClick={onSkip}
            className="text-xs text-slate-500 hover:text-slate-300"
          >
            Skip tour
          </button>
          <div className="flex gap-2">
            {index > 0 && (
              <button
                onClick={onBack}
                className="rounded-md border border-panel-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-panel-700"
              >
                Back
              </button>
            )}
            <button
              onClick={onNext}
              className="rounded-md bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
            >
              {isLast ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
