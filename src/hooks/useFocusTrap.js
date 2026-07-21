import { useEffect } from 'react'

/*
  Traps keyboard focus inside a modal container and restores focus to the
  trigger when it closes (ui-spec §0.4). Shared by Dialog and BottomSheet so
  both get identical, correct focus behavior.

  - On open: focus `initialFocusRef` if given, else the first focusable element.
  - Tab / Shift+Tab wrap within the container.
  - On close: focus returns to `returnFocusRef` if given, else the element that
    was focused before opening.

  Escape is intentionally NOT handled here — each surface decides its own Esc
  policy (UnsavedGuard: Esc = safe default; ConflictOverlay: Esc ignored).
*/

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

export function useFocusTrap(containerRef, { open, initialFocusRef, returnFocusRef }) {
  useEffect(() => {
    if (!open) return

    const container = containerRef.current
    if (!container) return

    // Remember what had focus so we can restore it on close. The explicit
    // returnFocusRef (the trigger, e.g. a save button) is captured now because
    // it is stable for a modal's lifetime; falling back to whatever had focus.
    const previouslyFocused = document.activeElement
    const restoreTarget = returnFocusRef?.current ?? previouslyFocused

    // Move focus in. Prefer the caller's initial target for predictable SR order.
    const focusFirst = () => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus()
        return
      }
      const focusables = container.querySelectorAll(FOCUSABLE)
      if (focusables.length > 0) focusables[0].focus()
      else container.focus()
    }
    focusFirst()

    const onKeyDown = (e) => {
      if (e.key !== 'Tab') return
      const focusables = Array.from(container.querySelectorAll(FOCUSABLE))
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    container.addEventListener('keydown', onKeyDown)
    return () => {
      container.removeEventListener('keydown', onKeyDown)
      if (restoreTarget && typeof restoreTarget.focus === 'function') {
        restoreTarget.focus()
      }
    }
  }, [open, containerRef, initialFocusRef, returnFocusRef])
}

export default useFocusTrap
