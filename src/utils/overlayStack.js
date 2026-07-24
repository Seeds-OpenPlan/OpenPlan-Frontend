/*
  Module-level stack of currently-open Dialog/BottomSheet instances, SHARED
  between the two components (a desktop ConflictOverlay(Dialog) stacked over
  a desktop TaskEditModal(Dialog), or a mobile pair of BottomSheets, or a
  Dialog stacked over a BottomSheet on a resize — all share ONE stack,
  because the dismissal bug this fixes doesn't care which shell either
  overlay happens to render with).

  THE BUG (Thomas code review, MAJOR): every open Dialog/BottomSheet used to
  register its OWN `document`-level Esc listener independently. With two
  stacked — e.g. ConflictOverlay (intentionally non-dismissable, no onClose)
  opened over TaskEditModal (onClose = requestClose) — a single Esc press
  fired BOTH listeners: ConflictOverlay's own no-oped (nothing to call), but
  TaskEditModal's still called requestClose, popping a DiscardConfirmDialog
  OVER the supposedly-undismissable conflict overlay. Repro this fixes:
  409 conflict → ConflictOverlay opens → Esc → nothing should happen (AC-4,
  "a choice is the only forward path") — not a THIRD overlay appearing.

  THE FIX: every mounted Dialog/BottomSheet instance registers a stable id
  here for as long as it is open (regardless of whether it even HAS an
  onClose — see below), and consults `isTopmostOverlay(id)` before honoring
  Esc or a backdrop click. Only the LAST-registered (topmost, most-recently-
  opened) id may dismiss.

  WHY A NON-DISMISSABLE OVERLAY STILL REGISTERS: ConflictOverlay has no
  onClose, so ITS OWN Esc handler never calls anything regardless — but it
  must still OCCUPY the top of the stack while open, precisely so that
  whatever is stacked BENEATH it (which DOES have an onClose) is no longer
  topmost and correctly stops responding to Esc. Registration and "may this
  instance actually act on Esc" are two separate questions; only the second
  one cares about onClose.

  Esc/backdrop-click checks (isTopmostOverlay) are read IMPERATIVELY inside an
  event handler, at the moment the event fires — nothing needs to RE-RENDER
  for those, so a plain mutable module-level array is enough for them.

  SINGLE-SCRIM FIX (owner report, "뒷배경 반투명 중첩"): each Dialog/
  BottomSheet used to always paint its OWN scrim, so two stacked overlays
  (e.g. TaskEditPreviewOverlay over TaskEditModal, or ConflictOverlay over
  either) visually double-darkened the backdrop — two semi-transparent tints
  overlapping read as one much darker one. Only the BOTTOM-most open overlay
  should ever paint a visible scrim; everything stacked above it relies on
  that ONE tint already being there. UNLIKE the Esc/click checks, this has to
  be REACTIVE: whether a given instance is "the bottom-most" can change while
  it stays open (a SECOND overlay opening above it doesn't change who's
  bottom-most; the bottom-most overlay's own scrim visibility is decided once
  at open time — but a component still needs to re-render to LEARN whether a
  stack-mate opened/closed, e.g. so a topmost overlay's now-transparent
  backdrop becomes visible/tinted again once whatever was below it closes).
  `subscribeOverlayStack`/`getOverlayStackSnapshot` exist for exactly that —
  a `useSyncExternalStore` pair, notified on every push/pop.
*/

let stack = []
const listeners = new Set()

function notifyListeners() {
  listeners.forEach((listener) => listener())
}

/** Call when an overlay opens (or on mount while already open). */
export function pushOverlay(id) {
  stack = [...stack, id]
  notifyListeners()
}

/** Call when an overlay closes (or on unmount while still open). */
export function popOverlay(id) {
  stack = stack.filter((existingId) => existingId !== id)
  notifyListeners()
}

/** True only for the MOST RECENTLY pushed id still on the stack. Read
 * imperatively inside an Esc/backdrop-click handler — see this file's own
 * header on why that does not need to be reactive. */
export function isTopmostOverlay(id) {
  return stack.length > 0 && stack[stack.length - 1] === id
}

/** `useSyncExternalStore` subscribe function — see this file's own header
 * (SINGLE-SCRIM FIX) for why the scrim, unlike Esc/click, needs to be
 * reactive rather than read imperatively. */
export function subscribeOverlayStack(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** `useSyncExternalStore` getSnapshot function. Returns the SAME array
 * reference until the next push/pop, which is exactly what
 * useSyncExternalStore requires to know when to re-render. */
export function getOverlayStackSnapshot() {
  return stack
}
