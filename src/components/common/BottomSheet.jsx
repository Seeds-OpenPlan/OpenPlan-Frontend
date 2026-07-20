import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '../../hooks/useFocusTrap'

/*
  Bottom sheet (components.md §6, mobile shell). Same accessibility contract and
  same content as Dialog — only the shell differs: it rises from the bottom with
  rounded top corners and a drag handle.

  Dismissal is opt-in exactly like Dialog: onClose present → Esc / backdrop /
  handle can close; onClose omitted → no dismissal (OVL-CONFLICT). The drag
  handle is a real 48px button so keyboard and touch users can both close.

  Content over 90vh scrolls inside the sheet; the page behind is scroll-locked.
*/

export function BottomSheet({
  open,
  onClose,
  labelledById,
  initialFocusRef,
  returnFocusRef,
  children,
}) {
  const containerRef = useRef(null)

  useFocusTrap(containerRef, { open, initialFocusRef, returnFocusRef })

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open || !onClose) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-[var(--color-overlay-scrim)]"
        onClick={onClose ? () => onClose() : undefined}
        aria-hidden="true"
      />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledById}
        tabIndex={-1}
        className={[
          'relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-sheet bg-surface shadow-modal',
          'motion-safe:transition-transform motion-safe:duration-slow motion-safe:ease-emphasized',
        ].join(' ')}
      >
        {/* Drag handle — a real button (48px target) so it can also close via
            keyboard when dismissal is allowed. Purely decorative if onClose is
            omitted, but still rendered for visual affordance. */}
        <div className="flex justify-center pt-2">
          {onClose ? (
            <button
              type="button"
              onClick={() => onClose()}
              aria-label="닫기"
              className="flex h-12 w-12 items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              <span className="h-1.5 w-10 rounded-full bg-border-strong" aria-hidden="true" />
            </button>
          ) : (
            <span className="my-4 h-1.5 w-10 rounded-full bg-border-strong" aria-hidden="true" />
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-6 pt-2">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

export default BottomSheet
