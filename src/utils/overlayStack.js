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

  Deliberately NOT a hook / NOT React state: Dialog/BottomSideet only need to
  ANSWER "am I topmost?" at the moment a keydown/click event actually fires —
  nothing needs to RE-RENDER when the stack changes, so a plain mutable
  module-level array (read imperatively inside an event handler) is the
  simplest correct implementation, with no extra subscription machinery.
*/

let stack = []

/** Call when an overlay opens (or on mount while already open). */
export function pushOverlay(id) {
  stack = [...stack, id]
}

/** Call when an overlay closes (or on unmount while still open). */
export function popOverlay(id) {
  stack = stack.filter((existingId) => existingId !== id)
}

/** True only for the MOST RECENTLY pushed id still on the stack. */
export function isTopmostOverlay(id) {
  return stack.length > 0 && stack[stack.length - 1] === id
}
