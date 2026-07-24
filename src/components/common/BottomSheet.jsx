import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { isTopmostOverlay, popOverlay, pushOverlay } from '../../utils/overlayStack'

/*
  Bottom sheet (components.md §6, mobile shell). Same accessibility contract and
  same content as Dialog — only the shell differs: it rises from the bottom with
  rounded top corners and a drag handle.

  Dismissal is opt-in exactly like Dialog: onClose present → Esc / backdrop /
  handle can close; onClose omitted → no dismissal (OVL-CONFLICT). The drag
  handle is a real 48px button so keyboard and touch users can both close.

  Content over 90vh scrolls inside the sheet; the page behind is scroll-locked.

  STACKED OVERLAYS: Esc/backdrop are scoped to the TOPMOST open overlay via
  the shared stack in utils/overlayStack.js — same fix, same reasoning as
  Dialog.jsx's own header comment (that file's own copy is the fuller
  version; not repeated here).

  `scrollBody` (default true) mirrors Dialog's own opt-out (see Dialog.jsx's
  comment for the full reasoning): a caller that owns its own fixed-header +
  scrolling-list layout passes `scrollBody={false}` to get an unpadded flex box
  sized to the sheet's available height instead of Dialog's default
  padded/scrolling one — so mobile gets the same layout as desktop, not a second
  nested scroller.
*/

export function BottomSheet({
  open,
  onClose,
  labelledById,
  initialFocusRef,
  returnFocusRef,
  scrollBody = true,
  children,
}) {
  const containerRef = useRef(null)
  const overlayId = useId()

  useFocusTrap(containerRef, { open, initialFocusRef, returnFocusRef })

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // See Dialog.jsx's own comment on why `onClose` is read via a ref inside
  // the handler rather than closed over directly (keeps the registration
  // effect's deps stable across re-renders, so this instance's stack
  // position never shuffles just because an unrelated prop changed).
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return undefined
    pushOverlay(overlayId)
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return
      if (!onCloseRef.current) return
      if (!isTopmostOverlay(overlayId)) return
      onCloseRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      popOverlay(overlayId)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, overlayId])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop click — topmost-only guard, same reasoning as Dialog.jsx's
          own (cheap; in practice a lower sheet's backdrop can never receive
          the click anyway). */}
      <div
        className="absolute inset-0 bg-[var(--color-overlay-scrim)]"
        onClick={onClose ? () => isTopmostOverlay(overlayId) && onClose() : undefined}
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
        {scrollBody ? (
          <div className="flex-1 overflow-y-auto p-6 pt-2">{children}</div>
        ) : (
          // Same box as Dialog's opt-out branch — `flex-1` fills the space
          // left by the drag handle above it, `min-h-0` lets it shrink below
          // its child's natural content size instead of pushing the sheet
          // past `max-h-[90vh]`. See Dialog.jsx for why `min-h-0` is kept
          // explicit even though `overflow-hidden` implies the same floor.
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
        )}
      </div>
    </div>,
    document.body,
  )
}

export default BottomSheet
