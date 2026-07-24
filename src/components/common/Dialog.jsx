import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '../../hooks/useFocusTrap'

/*
  Centered modal dialog (components.md §6, desktop shell). Renders in a portal
  so it escapes ancestor overflow/stacking contexts.

  Dismissal is opt-in per surface:
  - onClose given → Esc and backdrop click call it (PTN-UNSAVED: Esc = safe
    "keep editing").
  - onClose omitted → no Esc, no backdrop dismiss (OVL-CONFLICT: a choice is the
    only exit).

  Focus is trapped and restored via useFocusTrap. `aria-modal` + aria-labelledby
  wire the dialog to its title for screen readers.

  Height contract matches BottomSheet's (a tall consumer — e.g. ReviewPanel with
  many warnings — used to overflow the viewport with no way to scroll to the
  rest, since body scroll is locked while open). The content box is capped at
  the viewport height MINUS the wrapper's own `p-4` (`calc(100vh-2rem)`; using
  bare `100vh` would let that padding push the dialog past the viewport again),
  and only the inner content scrolls — the outer box (radius, shadow) never
  grows past the cap. Short content (every `size="sm"` confirm dialog) never
  reaches that cap, so it keeps hugging its own height with no scrollbar, exactly
  as before this changed.

  `scrollBody` (default true) is that scrolling contract applied FOR the caller:
  Dialog pads the content and makes the whole thing one scrollable block. A
  caller with its own internal layout — a fixed header ABOVE a scrolling list,
  say — needs the opposite: no padding, no scroll, just a correctly-sized box
  to build that layout inside. `scrollBody={false}` opts out: Dialog still
  supplies the height cap and hands back a flex box sized to fill it
  (`flex-1 min-h-0`), but does none of the padding/overflow itself, leaving the
  caller free to put a non-scrolling header and its own `overflow-y-auto` region
  inside without nesting two scrollers (which would mean two scrollbars).
*/

export function Dialog({
  open,
  onClose,
  labelledById,
  initialFocusRef,
  returnFocusRef,
  size = 'sm', // 'sm' = small confirm; 'lg' = content modal; 'xl' = wide content modal
  scrollBody = true,
  children,
}) {
  const containerRef = useRef(null)

  useFocusTrap(containerRef, { open, initialFocusRef, returnFocusRef })

  // Lock background scroll while open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Esc closes only when dismissal is allowed (onClose present).
  useEffect(() => {
    if (!open || !onClose) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  // ST-F1-09 (owner review, modal-not-page decision): 'xl' added for
  // TaskEditModal — its AC-3 mini-week preview (7 columns) reads cramped in
  // 'lg' (max-w-lg, 512px). Additive only; every existing 'sm'/'lg' consumer
  // is unaffected.
  const WIDTH_CLASSES = { sm: 'max-w-sm', lg: 'max-w-lg', xl: 'max-w-2xl' }
  const widthClass = WIDTH_CLASSES[size] ?? WIDTH_CLASSES.sm

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Scrim. Backdrop click closes only when dismissal is allowed. */}
      <div
        className="absolute inset-0 bg-[var(--color-overlay-scrim)] motion-safe:transition-opacity motion-safe:duration-slow"
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
          // flex-col + overflow-hidden on the OUTER box, so its rounded corners
          // and shadow stay intact; the INNER div below is what actually
          // scrolls, keeping the padding it owns clear of the scrollbar gutter.
          'relative flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-sheet bg-surface shadow-modal',
          'motion-safe:transition-transform motion-safe:duration-slow motion-safe:ease-emphasized',
          widthClass,
        ].join(' ')}
      >
        {scrollBody ? (
          <div className="overflow-y-auto p-6">{children}</div>
        ) : (
          // `flex-1` claims the outer box's full (capped) height; `min-h-0`
          // is the part that is easy to skip and silently breaks this: a
          // flex item's default min-height is its content size, which for a
          // tall child would force THIS box past the max-height cap instead
          // of letting the child's own overflow region do the shrinking.
          // `overflow-hidden` also grants that same zero-floor per the flex
          // spec's own carve-out, but the class is kept explicit rather than
          // relied on implicitly — see the same reasoning repeated one level
          // down in ReviewPanel, where nothing carries `overflow-hidden` and
          // `min-h-0` is the ONLY thing granting it.
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
        )}
      </div>
    </div>,
    document.body,
  )
}

export default Dialog
