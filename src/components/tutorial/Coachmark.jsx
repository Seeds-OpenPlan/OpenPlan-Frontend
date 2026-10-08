import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../common/Button'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import { onboardingCopy } from '../../features/onboarding/onboardingCopy'
import { getOverlayStackSnapshot, subscribeOverlayStack } from '../../utils/overlayStack'

// Re-measured on a light interval rather than a per-frame rAF loop — this
// overlay only exists during the (rare, one-time) tutorial run, and its
// target never animates on its own; a 300ms poll plus immediate
// scroll/resize listeners is enough to follow an accordion expanding or the
// viewport resizing without costing a re-render every frame (perf budget —
// this component's own header note, Andrew persona §Craft Standards).
const POLL_MS = 300

/** A `display:none` (or detached) element still returns a DOMRect from
 * `getBoundingClientRect()` — all zeros, not null. Treat that the same as
 * "not found" so a hidden anchor never draws a highlight ring around the
 * viewport's top-left corner. */
function isRenderedRect(rect) {
  return rect.width > 0 || rect.height > 0
}

function useTargetRect(targetId) {
  const [rect, setRect] = useState(null)

  useEffect(() => {
    if (!targetId) return undefined
    let cancelled = false
    const measure = () => {
      if (cancelled) return
      /*
        querySelectorAll, not querySelector — ProjectsPage renders TWO buttons
        sharing the same `data-tut-id` for TUT-03 (a desktop header button,
        `hidden md:block`, and a separate mobile floating action button,
        `md:hidden`; see that file's own comments). A plain querySelector
        always returns the FIRST DOM match regardless of which one is
        actually visible at the current viewport width — on mobile that was
        the HIDDEN desktop button, whose zero-size rect drew a broken ring at
        (0,0) instead of highlighting the real FAB (owner report). Picking
        the first VISIBLE match among all same-id matches fixes both this
        specific pair and any future responsive-duplicate anchor the same
        way, with no per-step special-casing here.
      */
      const candidates = document.querySelectorAll(`[data-tut-id="${targetId}"]`)
      let found = null
      for (const el of candidates) {
        const r = el.getBoundingClientRect()
        if (isRenderedRect(r)) {
          found = r
          break
        }
      }
      setRect(found)
    }
    // First measurement deferred to a rAF callback (not called synchronously
    // in the effect body itself) — setState belongs in a callback the effect
    // SUBSCRIBES to, not a direct call inline in the effect (react-hooks
    // set-state-in-effect). The interval/resize/scroll listeners below are
    // that same subscription shape for every measurement after the first.
    const frame = requestAnimationFrame(measure)
    const interval = setInterval(measure, POLL_MS)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true) // capture: any scrollable ancestor
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      clearInterval(interval)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [targetId])

  // Mask stale rect from a PREVIOUS targetId the instant this one goes null
  // (e.g. a step with no anchor) — the effect above still owns clearing it
  // asynchronously on the next targetId change, this is just the synchronous
  // read-time guard so a consumer never briefly sees the wrong element's rect.
  return targetId ? rect : null
}

// Panel never grows wider than this, but on a narrow phone (e.g. a 320px-wide
// viewport) even this would overflow once side margins are subtracted — see
// `panelWidth` below, which clamps it to whatever actually fits.
const PANEL_MAX_WIDTH = 320
const PANEL_SIDE_MARGIN = 8
const GAP = 12

// The un-anchored (no `rect`) fallback used to sit at a bare `bottom: 24`
// (24px) regardless of viewport — on mobile that's UNDER BottomTabBar
// (`h-bar`, fixed, ~56px tall), so the panel's bottom edge rendered behind
// the tab bar (owner report, "코치마크가 하단 탭바에 가려 보인다"). 96px
// matches the SAME clearance every other bottom-fixed surface in this app
// already uses for the exact same bar — Toaster's `bottom-24`, AppLayout's
// own `pb-24` (see those files' own comments for the 56px bar + 40px
// breathing-room arithmetic). Desktop has no tab bar, so it keeps the
// original, tighter offset.
const MOBILE_FALLBACK_BOTTOM = 96
const DESKTOP_FALLBACK_BOTTOM = 24

/** Clamp the tooltip's left edge so it never overflows the viewport. */
function clampLeft(idealLeft, panelWidth) {
  return Math.min(Math.max(idealLeft, PANEL_SIDE_MARGIN), window.innerWidth - panelWidth - PANEL_SIDE_MARGIN)
}

/** Tracks `window.innerWidth` so the panel can re-clamp its own width across
 * a resize/orientation change while mounted (the un-anchored fallback has no
 * other listener that would otherwise trigger a re-render on resize — see
 * `useTargetRect` above, whose resize listener only attaches when `targetId`
 * is truthy). Cheap: one listener, only while a Coachmark is actually
 * mounted (tutorial run only — same perf budget as the rest of this file). */
function useViewportWidth() {
  const [width, setWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return width
}

/*
  OVL-TUT coachmark (TUT-01/02 common pattern). Two shapes:
  - Anchored: a target element was found (`rect`) — a highlight ring is drawn
    exactly over it (pointer-events-none, so the user can still click the
    REAL button underneath — a coachmark that blocked its own target would
    defeat AC3's "실기능 재사용") and the instruction panel sits just below/
    above it, whichever has room.
  - Un-anchored (`rect` is null — no `targetId`, or the target isn't mounted
    right now, e.g. a dynamic drag/menu interaction, see tutorialSteps.js's
    own header): the panel docks to the bottom-center of the viewport instead,
    same content, no ring.

  NOT a modal: no backdrop, no focus trap. The user must be able to keep
  interacting with the real page (click the highlighted button, drag a task)
  while this floats on top — only the panel's own buttons capture focus/clicks.

  MODAL-AWARE (owner report, production/운영): this component's own z-[70]/
  z-[71] sit ABOVE Dialog/BottomSheet's z-50 — exactly the stacking a
  tooltip-style coachmark needs so its ring can sit over a real page button,
  but it also meant the ProjectCreateForm/TaskCreateForm modals TUT-03/04
  themselves tell the user to open rendered UNDER this panel, with the ring
  and instructions floating uselessly on top of the user's own form. Hidden
  (not unmounted — see the render guard below) for as long as
  utils/overlayStack.js reports ANY Dialog/BottomSheet open, reappearing on
  its own the instant the last one closes.
*/
export function Coachmark({ targetId, title, body, stepNumber, total, isLast, onNext, onPrev, onSkip }) {
  const rect = useTargetRect(targetId)
  const headingRef = useRef(null)
  const t = onboardingCopy.tutorial
  const isDesktop = useIsDesktop()
  const viewportWidth = useViewportWidth()
  // Reactive subscription (not an imperative read) — this component must
  // RE-RENDER the instant a modal opens/closes elsewhere in the tree, the
  // same reasoning Dialog.jsx's own scrim-visibility check already uses this
  // exact store for (see that file's header).
  const stackSnapshot = useSyncExternalStore(subscribeOverlayStack, getOverlayStackSnapshot)
  const modalOpen = stackSnapshot.length > 0

  // Move focus/SR-announce to the new step's heading, same reasoning
  // ErrorState's `page` variant gives for doing the same on mount — EXCEPT
  // while the user is actively editing some other on-page input that never
  // registers on the overlay stack at all (e.g. WeeklyPage's own inline
  // add-schedule popover for TUT-06/07 — not a Dialog/BottomSheet). Stealing
  // focus out from under it would cut off whatever the user was mid-typing
  // (owner report).
  //
  // Keyed ONLY on `title` (Thomas code review NIT, fixed 2026-10) — NOT
  // `modalOpen`. An earlier version also depended on `modalOpen` so it could
  // skip focusing while a modal was open, but a dependency re-runs the effect
  // on EITHER edge, not just the one it was written for: the moment the
  // user's form modal CLOSED (modalOpen true→false, same `title`, nothing
  // about the step changed), this fired again and yanked focus back onto the
  // coachmark heading right after the user had just finished dealing with
  // their own form. No explicit `modalOpen` check is needed for the
  // modal-open case either: this component returns null while a modal is
  // open (render guard below), which unmounts the heading and resets
  // `headingRef.current` to null before any effect runs, so `.focus()`
  // already no-ops there with no extra guard.
  useEffect(() => {
    const active = document.activeElement
    const isEditing =
      active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
    if (isEditing) return
    headingRef.current?.focus()
  }, [title])

  // Fixed 320px reads fine on desktop/tablet widths but overflows a narrow
  // phone (e.g. a 360px-wide viewport leaves only 20px on each side once
  // margins are subtracted) — clamp to whatever the viewport actually has
  // room for instead of a bare constant.
  const panelWidth = Math.max(0, Math.min(PANEL_MAX_WIDTH, viewportWidth - PANEL_SIDE_MARGIN * 2))
  const fallbackBottom = isDesktop ? DESKTOP_FALLBACK_BOTTOM : MOBILE_FALLBACK_BOTTOM

  const panelStyle = rect
    ? (() => {
        const spaceBelow = window.innerHeight - rect.bottom
        const placeBelow = spaceBelow > 180
        return {
          position: 'fixed',
          left: clampLeft(rect.left, panelWidth),
          top: placeBelow ? rect.bottom + GAP : undefined,
          bottom: placeBelow ? undefined : window.innerHeight - rect.top + GAP,
          width: panelWidth,
        }
      })()
    : { position: 'fixed', left: '50%', bottom: fallbackBottom, width: panelWidth, transform: 'translateX(-50%)' }

  // Hidden, not unmounted: `useTargetRect`'s poll/listeners and the focus
  // effect above keep running quietly while a modal is open, so the moment
  // it closes this reappears in place on the SAME instance — no remount,
  // no fresh focus-steal, no re-measuring flash.
  if (modalOpen) return null

  return createPortal(
    <>
      {rect && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[70] rounded-control ring-4 ring-brand-500 motion-safe:transition-[top,left,width,height] motion-safe:duration-fast"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
          }}
        />
      )}
      <div
        role="region"
        aria-label={`튜토리얼 ${t.progressLabel(stepNumber, total)}`}
        style={panelStyle}
        className="z-[71] flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-popover motion-safe:transition-[top,bottom,left] motion-safe:duration-fast"
      >
        <div className="flex items-center justify-between">
          <span className="text-caption font-medium text-brand-700">{t.progressLabel(stepNumber, total)}</span>
          <button
            type="button"
            onClick={onSkip}
            className="text-caption text-text-muted underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            {t.skip}
          </button>
        </div>
        <h2 ref={headingRef} tabIndex={-1} className="text-label font-semibold text-text outline-none">
          {title}
        </h2>
        <p className="text-caption text-text-muted">{body}</p>
        <div className="mt-1 flex justify-end gap-2">
          {stepNumber > 1 && (
            <Button variant="secondary" size="sm" onClick={onPrev}>
              {t.prev}
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={onNext}>
            {isLast ? t.done : t.next}
          </Button>
        </div>
      </div>
    </>,
    document.body,
  )
}

export default Coachmark
