import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../common/Button'
import { CheckCircleIcon } from '../common/statusIcons'
import { useIsDesktop, useMediaQuery } from '../../hooks/useMediaQuery'
import { onboardingCopy } from '../../features/onboarding/onboardingCopy'
import { getOverlayStackSnapshot, subscribeOverlayStack } from '../../utils/overlayStack'

/*
  DELETE_SAMPLE's own `body` (tutorialSteps.js) is a DATA object
  (`{ checklist, footer }`), not a plain string like every other step's —
  that file stays a plain `.js` module (no JSX, so no Fast-Refresh
  component-boundary rule to satisfy) and hands the shape to THIS component
  to actually render, since this file already owns every other `body`
  render site below. `renderBody` is the single seam both of those sites
  (the anchored panel, and the modal-open top strip) call through, so
  neither has to duplicate the "is this a checklist or a plain string"
  branch.
*/
function renderBody(body) {
  if (body && typeof body === 'object' && Array.isArray(body.checklist)) {
    return <TutorialChecklist checklist={body.checklist} footer={body.footer} />
  }
  return body
}

/*
  Progress checklist (owner report, 2026-10: DELETE_SAMPLE's old static copy
  never said both items had to clear, claimed a highlight it couldn't always
  deliver, and talked about "a block" singular for a task that can be split
  across several — see tutorialSteps.js's own header for the full reasoning;
  this component only renders the DATA it hands back).

  Same checklist SHAPE as PasswordChecklist.jsx (not reused directly — that
  one is password-policy-specific — but deliberately identical): an icon
  that changes SHAPE, not just color, between done/pending (NFR-017), plus
  `sr-only` text carrying "정리됨"/"남음" so a screen reader gets the SAME
  information a sighted user reads off the icon shape alone.
*/
function TutorialChecklist({ checklist, footer }) {
  return (
    <>
      <ul role="status" aria-live="polite" className="flex flex-col gap-1">
        {checklist.map((item, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {item.done ? (
              <CheckCircleIcon size={14} className="shrink-0" />
            ) : (
              <span
                aria-hidden="true"
                className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-current"
              />
            )}
            <span>
              {item.label}
              <span className="sr-only">{item.done ? ' (정리됨)' : ' (남음)'}</span>
            </span>
          </li>
        ))}
      </ul>
      {footer && <p className="mt-1">{footer}</p>}
    </>
  )
}

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

  MODAL-AWARE, THIRD SHAPE (owner report #78, 2026-10 — supersedes the #74
  design this replaces): this component's own z-[70]/z-[71] sit ABOVE
  Dialog/BottomSheet's z-50 — exactly the stacking a tooltip-style coachmark
  needs so its ring can sit over a real page button — which ALSO meant the
  ProjectCreateForm/TaskCreateForm modals TUT-03/04/06 themselves auto-open
  rendered UNDER this panel, with the ring and instructions floating
  uselessly on top of the user's own form. The #74 fix was to hide this
  component ENTIRELY while any modal was open (utils/overlayStack.js) — which
  traded "floating uselessly on top" for "no guidance at all while the user
  is actually filling in the form", the exact moment guidance matters most
  (owner report: "폼이 자동으로 열리면 튜토리얼 메시지가 안 보인다").

  The fix is a THIRD render shape, not a toggle between the two above: a
  slim, INFORMATION-ONLY strip pinned to the very top of the viewport,
  ABOVE the modal (z-[80], still higher than Dialog/BottomSheet's z-50),
  shown for as long as `modalOpen` — see the render branch below for the
  full reasoning (sizing, pointer-events, focus/ARIA trade-offs). The
  anchored/un-anchored shapes above are UNCHANGED and resume the instant
  `modalOpen` goes false (same instance — see the render guard below, this
  component is never unmounted while a modal opens/closes, so its own
  internal state — `useTargetRect`'s poll, the focus-steal effect — keeps
  running quietly underneath exactly as it already did pre-#78).
*/
export function Coachmark({
  targetId,
  title,
  body,
  stepNumber,
  total,
  isLast,
  // AUTO-PROGRESS ONLY (owner decision, 2026-10 — removes [이전]/[다음]):
  // every non-last step now advances purely from TutorialOverlay's own
  // event/state detection, never a manual click — see that file's own
  // header for why this is judged safe (완료 조건이 최대한 현재 상태로도
  // 판정되고, 그래도 막히면 [건너뛰기]가 유일하고 항상 available한 탈출구).
  // `onComplete` is the ONE remaining manual action, and only for the LAST
  // step (TUT-08 has nothing to auto-detect — it is a plain "you're done"
  // screen). [다시 열기] re-sends whatever auto-open request this step
  // already made once — see TutorialOverlay's own comment on
  // `showReopen`/`onReopen`.
  showReopen = false,
  onReopen,
  onComplete,
  onSkip,
}) {
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
  // Same breakpoint WeeklyPage's own D4 fold-handling already uses for "not
  // enough vertical room to show everything" — reused here (not a new
  // threshold) so the top strip's own body line drops at the SAME point a
  // short/landscape viewport already starts trimming other floating chrome.
  const shortViewport = useMediaQuery('(max-height: 480px)')

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

  // Not hidden anymore, not unmounted either (#78 fix — see this file's own
  // header): `useTargetRect`'s poll/listeners and the focus-steal effect
  // above keep running quietly underneath this branch exactly as they did
  // when this used to return null, so the moment the modal closes the
  // anchored shape below reappears in place on the SAME instance — no
  // remount, no fresh focus-steal, no re-measuring flash.
  if (modalOpen) {
    return createPortal(
      <div
        // `role="status"` (implicit `aria-live="polite"` + `aria-atomic="true"`
        // — explicit `aria-live` kept alongside it for clarity, not because
        // it adds anything `role="status"` doesn't already imply) so a
        // SCREEN READER announces the step changing while the modal is open,
        // not just while the anchored panel is visible.
        //
        // BEST-EFFORT, NOT GUARANTEED (this file's own header, and the task
        // that added this branch, both flag this): this strip is a sibling
        // of the Dialog/BottomSheet's own portal under `document.body`, OUTSIDE
        // that modal's `aria-modal="true"` subtree. Per the ARIA modal
        // pattern, assistive tech is expected to treat everything outside an
        // open modal's subtree as inert while it's open — in practice this
        // codebase's Dialog/BottomSheet never actually applies `aria-hidden`/
        // `inert` to the REST of the page to enforce that (no such code in
        // either component), so most screen readers (NVDA/JAWS + Firefox/
        // Chrome, VoiceOver in most configurations) DO still announce a
        // body-level live region like this one even while focus is trapped
        // inside the modal — but a fully spec-compliant AT that hides
        // everything outside the modal subtree could legitimately suppress
        // it. Closing that gap for certain would mean rendering this text
        // INSIDE Dialog/BottomSheet's own DOM subtree, which would require
        // those two shared, tutorial-agnostic components to know about the
        // tutorial specifically — a coupling judged not worth it for a
        // best-effort, not safety-critical, announcement (the step's own
        // instructions are still fully available the moment the modal
        // closes, same as before this change).
        role="status"
        aria-live="polite"
        className={[
          // Highest z-layer in the app on purpose — above Dialog/BottomSheet's
          // OWN z-50 content AND their z-50 backdrop (same stacking context,
          // so no separate "above the backdrop, below the content" layer is
          // needed). `pointer-events-none`: this strip is READ-ONLY — see
          // this file's own header for why [건너뛰기]/[다음]/[이전] stay on the
          // anchored panel instead of living here too (would sit above the
          // modal's own backdrop click-catcher/focus trap and risks being
          // mistaken for part of the form).
          'pointer-events-none fixed inset-x-0 top-0 z-[80] flex flex-col items-center gap-0.5',
          'bg-brand-700 px-4 text-center text-caption text-white shadow-popover',
          // `env(safe-area-inset-top)` (#68 D2 convention — see MobileTopBar's
          // own identical `pt-[env(safe-area-inset-top)]`) keeps this clear of
          // a notch/status bar on mobile. Kept DELIBERATELY SHORT (small
          // vertical padding, one or two lines of `text-caption`, no icon/
          // close button) — see this file's own header on why minimizing this
          // strip's own height is the chosen mitigation against covering a
          // tall Dialog/BottomSheet's own top content, rather than teaching
          // those two shared components to reserve space for it.
          'py-1.5 pt-[calc(0.375rem+env(safe-area-inset-top))]',
        ].join(' ')}
      >
        <span className="font-medium">
          {t.progressLabel(stepNumber, total)} · {title}
        </span>
        {/* Dropped on a short/landscape viewport (`shortViewport` above) —
            the step+title line alone is already the load-bearing part (it is
            what tells the user "this form IS the tutorial step"); the fuller
            instructions are redundant with the form's own labels in a pinch
            and the first thing worth shedding to keep this strip from
            crowding a Dialog/BottomSheet that is ALSO fighting for vertical
            room on the same short screen. */}
        {/* `<div>`, not `<span>` — DELETE_SAMPLE's own checklist body
            (renderBody above) can return a `<ul>`/`<p>` fragment, which is
            invalid inside an inline `<span>`. */}
        {!shortViewport && <div className="text-white/90">{renderBody(body)}</div>}
      </div>,
      document.body,
    )
  }

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
        {/* `<div>`, not `<p>` — same reasoning as the top strip's own render
            site above: a checklist body is a `<ul>`/`<p>` fragment, invalid
            nested inside a `<p>`. */}
        <div className="text-caption text-text-muted">{renderBody(body)}</div>
        {/* [다시 열기] sits on its OWN line, left-aligned — it is a recovery
            action ("I closed the thing you opened for me"), not a step of
            the same weight as 건너뛰기/완료, so it doesn't compete with them
            for the same row. The only OTHER control this panel ever shows
            now (AUTO-PROGRESS ONLY, see this component's own header on
            `onComplete`) — a non-last step has NO button here at all; it
            simply disappears the instant TutorialOverlay's own detection
            advances past it. */}
        {showReopen && (
          <button
            type="button"
            onClick={onReopen}
            className="self-start text-caption font-medium text-brand-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            {t.reopen}
          </button>
        )}
        {/* [완료] — the ONE manual button left, and only on the LAST step
            (TUT-08): see this component's own header on `onComplete` for why
            every OTHER step has nothing to click here at all. */}
        {isLast && (
          <div className="mt-1 flex justify-end">
            <Button variant="primary" size="sm" onClick={onComplete}>
              {t.done}
            </Button>
          </div>
        )}
      </div>
    </>,
    document.body,
  )
}

export default Coachmark
