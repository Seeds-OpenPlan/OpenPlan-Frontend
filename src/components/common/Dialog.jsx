import { useEffect, useId, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import {
  getOverlayStackSnapshot,
  isTopmostOverlay,
  popOverlay,
  pushOverlay,
  subscribeOverlayStack,
} from '../../utils/overlayStack'

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

  STACKED OVERLAYS (Thomas code review, MAJOR): Esc/backdrop are scoped to the
  TOPMOST open Dialog/BottomSheet via the shared module-level stack in
  utils/overlayStack.js — see that file's own header for the full bug this
  fixes (an Esc used to fire every stacked instance's listener at once).
  Every instance registers on the stack while open REGARDLESS of whether it
  has an `onClose` (a non-dismissable overlay like ConflictOverlay must still
  occupy the top slot, or Esc would fall through to whatever is beneath it).

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

  `boxRef` (optional, additive) forwards the SAME node `containerRef` below
  points at, out to the caller — for a caller that needs to MEASURE this
  dialog's own rendered box (TaskEditModal passes its own boxRef so
  TaskEditPreviewOverlay can size itself to match — see that component's own
  comment). `heightPx` (optional, additive) is the other half of that: a
  fixed pixel height applied as an inline style, for a caller matching ITS
  OWN size to something it measured elsewhere (rather than shrink-wrapping
  content, the default). Both are no-ops for every other consumer.

  SINGLE SCRIM (owner report, "뒷배경 반투명 중첩"): only the BOTTOM-most open
  overlay on the shared stack paints a VISIBLE scrim tint — see
  utils/overlayStack.js's own header for the full reasoning. Every instance
  still renders a full-viewport backdrop div (for click-catching — Esc's
  cousin, "click outside to dismiss" needs to keep working for whichever
  overlay actually IS topmost), just with a transparent background when it
  is not the bottom-most.
*/

export function Dialog({
  open,
  onClose,
  labelledById,
  initialFocusRef,
  returnFocusRef,
  size = 'sm', // 'sm' = small confirm; 'lg' = content modal; 'xl' = wide content modal
  scrollBody = true,
  boxRef,
  heightPx,
  children,
}) {
  const containerRef = useRef(null)
  const overlayId = useId()
  // Reactive (unlike isTopmostOverlay below) — see overlayStack.js's own
  // header on why the scrim specifically needs a re-render when the stack
  // changes, not just an event-time check.
  const stackSnapshot = useSyncExternalStore(subscribeOverlayStack, getOverlayStackSnapshot)

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

  // `onClose` is very often a fresh arrow-function reference every render
  // (every caller in this codebase passes one inline) — a ref, read inside
  // the handler below rather than closed over directly, keeps the
  // REGISTRATION effect's own deps down to `[open, overlayId]` (both stable
  // across re-renders). Without this split, an unrelated re-render while
  // open would pop-then-repush this instance on EVERY render, silently
  // moving it to the top of the stack even though nothing about its
  // open/closed state actually changed — exactly the kind of stacking-order
  // bug this whole mechanism exists to prevent.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  // Register on the shared stack (regardless of `onClose` — see this file's
  // own header) and respond to Esc ONLY while topmost.
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

  // ST-F1-09 (owner review, modal-not-page decision): 'xl' added for
  // TaskEditModal — its AC-3 mini-week preview (7 columns) reads cramped in
  // 'lg' (max-w-lg, 512px). Additive only; every existing 'sm'/'lg' consumer
  // is unaffected.
  const WIDTH_CLASSES = { sm: 'max-w-sm', lg: 'max-w-lg', xl: 'max-w-2xl' }
  const widthClass = WIDTH_CLASSES[size] ?? WIDTH_CLASSES.sm

  // Bottom-most on the shared stack (or the ONLY one open) → visible scrim.
  // Stacked above something else → transparent (that lower one's scrim is
  // already tinting the backdrop; painting a second one on top is what
  // double-darkened it — owner report).
  const showScrim = stackSnapshot.length === 0 || stackSnapshot[0] === overlayId

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop click-catcher — ALWAYS present (so "click outside to
          dismiss" keeps working for whichever overlay is topmost), only
          ever VISIBLY tinted when this instance is bottom-most (showScrim).
          Dismissal itself stays gated to the topmost instance, same guard
          as Esc above; a lower overlay's own click-catcher can never
          receive the click anyway (the topmost one covers the full
          viewport and is later in DOM/paint order), but the explicit check
          costs nothing and removes any doubt. */}
      <div
        className={[
          'absolute inset-0 motion-safe:transition-opacity motion-safe:duration-slow',
          showScrim ? 'bg-[var(--color-overlay-scrim)]' : 'bg-transparent',
        ].join(' ')}
        onClick={onClose ? () => isTopmostOverlay(overlayId) && onClose() : undefined}
        aria-hidden="true"
      />
      <div
        ref={(node) => {
          containerRef.current = node
          if (boxRef) boxRef.current = node
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledById}
        tabIndex={-1}
        style={heightPx != null ? { height: heightPx } : undefined}
        className={[
          // flex-col + overflow-hidden on the OUTER box, so its rounded corners
          // and shadow stay intact; the INNER div below is what actually
          // scrolls, keeping the padding it owns clear of the scrollbar gutter.
          // max-h caps it at the viewport regardless — a `heightPx` shorter
          // than that wins (a fixed height under its own max), and one
          // somehow taller still can't push the dialog off-screen.
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
