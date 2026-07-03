import { useEffect } from 'react'
import { overlay } from '../state/overlay'
import { XIcon } from './Icons'

/** Shared centered modal dialog used across the app. */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  // Mark an overlay as open so the embedded Godot window hides behind it.
  useEffect(() => {
    overlay.open()
    return () => overlay.close()
  }, [])
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-3xl overflow-hidden rounded-xl border border-panel-600 bg-panel-850 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-panel-600 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-panel-700 hover:text-slate-200"
          >
            <XIcon width={16} height={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
