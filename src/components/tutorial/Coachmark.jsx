import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../common/Button'
import { onboardingCopy } from '../../features/onboarding/onboardingCopy'

// Re-measured on a light interval rather than a per-frame rAF loop — this
// overlay only exists during the (rare, one-time) tutorial run, and its
// target never animates on its own; a 300ms poll plus immediate
// scroll/resize listeners is enough to follow an accordion expanding or the
// viewport resizing without costing a re-render every frame (perf budget —
// this component's own header note, Andrew persona §Craft Standards).
const POLL_MS = 300

function useTargetRect(targetId) {
  const [rect, setRect] = useState(null)

  useEffect(() => {
    if (!targetId) return undefined
    let cancelled = false
    const measure = () => {
      if (cancelled) return
      const el = document.querySelector(`[data-tut-id="${targetId}"]`)
      setRect(el ? el.getBoundingClientRect() : null)
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

const PANEL_WIDTH = 320
const GAP = 12

/** Clamp the tooltip's left edge so it never overflows the viewport. */
function clampLeft(idealLeft) {
  const margin = 8
  return Math.min(Math.max(idealLeft, margin), window.innerWidth - PANEL_WIDTH - margin)
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
*/
export function Coachmark({ targetId, title, body, stepNumber, total, isLast, onNext, onPrev, onSkip }) {
  const rect = useTargetRect(targetId)
  const headingRef = useRef(null)
  const t = onboardingCopy.tutorial

  // Move focus/SR-announce to the new step's heading, same reasoning
  // ErrorState's `page` variant gives for doing the same on mount.
  useEffect(() => {
    headingRef.current?.focus()
  }, [title])

  const panelStyle = rect
    ? (() => {
        const spaceBelow = window.innerHeight - rect.bottom
        const placeBelow = spaceBelow > 180
        return {
          position: 'fixed',
          left: clampLeft(rect.left),
          top: placeBelow ? rect.bottom + GAP : undefined,
          bottom: placeBelow ? undefined : window.innerHeight - rect.top + GAP,
          width: PANEL_WIDTH,
        }
      })()
    : { position: 'fixed', left: '50%', bottom: 24, width: PANEL_WIDTH, transform: 'translateX(-50%)' }

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
