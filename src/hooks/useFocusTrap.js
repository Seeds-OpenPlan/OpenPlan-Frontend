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

  `manageFocus` (default true, PR #82 AI 리뷰 Blocking fix #2): every existing
  caller (Dialog, BottomSheet, ProjectWbsDrawer) wants `open` itself to BE the
  "move focus in / restore focus out" trigger — for them, `open` only ever
  flips on a real mount/unmount of that modal, so that's correct. But
  SettingsLayout.jsx's mobile detail panel derives its `open` from a LIVE
  media query (`isDesktop`) that can flip on a bare window resize or fold
  hinge move — WITHOUT the route (and therefore the user's actual intent)
  changing at all. If this hook still moved focus on every `open` flip, a
  resize alone would steal focus out of whatever field the user was mid-typing
  in. `manageFocus: false` keeps the Tab/Shift+Tab containment (still exactly
  what a modal needs, and safe to toggle on resize — it's not an explicit
  user action, just which keys get trapped) while leaving ALL focus-moving
  decisions to the caller, who can tie them to something narrower (e.g. route
  change) instead of `open`.
*/

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

export function useFocusTrap(containerRef, { open, initialFocusRef, returnFocusRef, manageFocus = true }) {
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
    if (manageFocus) focusFirst()

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
      if (manageFocus && restoreTarget && typeof restoreTarget.focus === 'function') {
        restoreTarget.focus()
      }
    }
  }, [open, containerRef, initialFocusRef, returnFocusRef, manageFocus])
}

export default useFocusTrap
