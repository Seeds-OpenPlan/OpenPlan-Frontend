import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatMinutesLabel } from '../../features/plan/planTime'
import { PX_PER_MIN } from '../../features/plan/planGeometry'
import { AlertTriangleIcon, CheckCircleIcon } from '../common/statusIcons'
import { useReducedMotion } from '../../hooks/useReducedMotion'

// Below this rendered height a block can't show its title legibly, so a
// hover/focus detail card supplements it (readability aid — the block's
// aria-label already carries the full title+time for screen readers). This is
// an ABSOLUTE pixel figure (padding + one line of the time label + one line of
// the title, per the block's fixed font sizes/padding below) — it does NOT
// scale with planGeometry's HOUR_PX/PX_PER_MIN. Raising HOUR_PX makes any given
// DURATION taller on screen, so fewer blocks fall under this same px bar and
// need the popover — that's the intended effect, not something to compensate
// for by scaling this constant too.
const SHORT_BLOCK_PX = 46

/*
  A single plan block on the grid. It is the interaction surface for three inputs:
  - pointer drag  → move (PLAN-19) / week-boundary move (PLAN-20), started here,
                    computed by usePlanDrag in the parent.
  - context menu  → right-click (desktop) or the ⋯ affordance opens the action
                    menu (PLAN-09). Long-press is not used (it fights drag).
  - keyboard      → the block is focusable; Arrow keys nudge it (5-min / 1-day)
                    and Enter/Space opens the menu, so move is not pointer-only
                    (§A11Y keyboard map).

  Visual: TASK blocks use the brand tint, SCHEDULE blocks are a bordered surface
  card (design). Per-project block colors arrive with the projects surface
  (ST-F1-08); `block.tone` is carried but not yet mapped to a palette here.
*/

const TYPE_CLASSES = {
  TASK: 'bg-brand-50 border-brand-200 text-brand-900',
  SCHEDULE: 'bg-surface border-border text-text',
}

/*
  Validation marking (ST-F1-05, layer 1 of the 3-layer display). A violated block
  gets THREE independent signals so none of them is load-bearing on its own:
  a diagonal stripe, a recolored border, and a labelled chip. The chip's text is
  what actually communicates ("차단"/"경고" + count) — the stripe pattern
  distinguishes the two severities for anyone who can't separate red from amber,
  and the aria-label repeats it for screen readers (NFR-017: never color alone).

  The stripe is painted as the element's own backgroundImage rather than an
  absolutely-positioned overlay, because a positioned overlay paints ABOVE the
  block's static text and would wash out the title.
*/
const VIOLATION_BORDER_CLASSES = {
  blocking: 'border-danger-500',
  warning: 'border-warning-500',
}

const VIOLATION_CHIP_CLASSES = {
  blocking: 'bg-danger-600 text-white',
  warning: 'bg-warning-600 text-white',
}

// Blocking = tight, high-contrast hatch; warning = wider, softer hatch. The two
// patterns are distinguishable in greyscale.
const VIOLATION_STRIPES = {
  blocking:
    'repeating-linear-gradient(45deg, color-mix(in srgb, var(--color-danger-600) 20%, transparent) 0, color-mix(in srgb, var(--color-danger-600) 20%, transparent) 4px, transparent 4px, transparent 9px)',
  warning:
    'repeating-linear-gradient(45deg, color-mix(in srgb, var(--color-warning-600) 18%, transparent) 0, color-mix(in srgb, var(--color-warning-600) 18%, transparent) 3px, transparent 3px, transparent 14px)',
}

export function PlanBlock({
  block,
  style,
  startMin,
  endMin,
  dragging = false,
  boundary = null,
  disabled = false,
  // ST-F1-02 AC-5: a past week is read-only EXCEPT its TASK blocks' 완료 전환/
  // 실제 시간 기록, which stay reachable through this same menu — so a block
  // that still has actions can't use `disabled` (that also hides the menu).
  // `moveLocked` is the narrower lock: it blocks drag/resize/keyboard-nudge
  // (all plan-CHANGING moves) while leaving focus, the context menu, and
  // Enter/Space untouched. A fully `disabled` block is moveLocked too — see
  // `moveBlocked` below — so callers only need to set this for the
  // "read-only week, but this block still has actions" case.
  moveLocked = false,
  dragActive = false,
  resizing = false,
  pending = false, // optimistic block whose server id hasn't reconciled yet
  // { severity: 'blocking'|'warning', label, count } — the worst violation on
  // this block plus how many it has in total; null when the block is clean.
  violation = null,
  // Changes to a new number each time the review panel targets THIS block
  // (PLAN-23). The value itself is meaningless — only the change matters, which
  // is what lets the same block be re-focused repeatedly.
  focusToken = null,
  onPointerDown,
  onOpenMenu,
  onNudge,
  onResizeStart,
}) {
  // A pending (temp-id) block is shown but not yet interactable: acting on it
  // before the POST resolves would target a non-existent server id (temp-id race).
  // `locked` is the FULL lock (no menu either); `moveBlocked` additionally
  // covers the read-only-week-but-still-has-actions case above.
  const locked = disabled || pending
  const moveBlocked = locked || moveLocked
  const timeLabel = `${formatMinutesLabel(startMin)} - ${formatMinutesLabel(endMin)}`
  const typeClass = TYPE_CLASSES[block.blockType] ?? TYPE_CLASSES.TASK
  // Completed blocks read as done via a check + strikethrough + dimming, never by
  // color alone (PLAN-13 AC-2, NFR-017).
  const isDone = block.status === 'COMPLETED'
  const violationLabel = violation
    ? `${violation.label} ${violation.count > 1 ? `${violation.count}건` : ''}`.trim()
    : null

  const rootRef = useRef(null)
  const reducedMotion = useReducedMotion()

  /*
    PLAN-23: bring this block into view and give it keyboard focus when the review
    panel selects one of its issues. Both happen HERE (not in the panel) because
    only the block knows its own DOM node — the panel just names a target.

    `scrollIntoView` walks every scrollable ancestor, which is what we want: the
    grid body scrolls vertically, its wrapper scrolls horizontally on narrow
    screens, and the page may need to scroll too. `preventScroll` on focus stops
    the browser from doing a second, competing scroll of its own.
  */
  useEffect(() => {
    if (focusToken == null) return
    const el = rootRef.current
    if (!el) return
    el.scrollIntoView({
      block: 'center',
      inline: 'nearest',
      behavior: reducedMotion ? 'auto' : 'smooth',
    })
    el.focus({ preventScroll: true })

    // PLAN-23 shake: one horizontal wobble on the block, layered on the same
    // focusToken pulse-ring request (no separate state or timer). Skipped
    // under reduced motion — a lateral wobble is a vestibular trigger and has
    // no static substitute, so we simply don't run it.
    if (reducedMotion) return

    // Owner decision: the block should wobble AFTER it finishes sliding into
    // view, not mid-flight. scrollIntoView({behavior:'smooth'}) is async and
    // may scroll several ancestors at once, so instead of guessing which one
    // emits `scrollend` we watch this element's own viewport position across
    // animation frames and fire once it holds still for a frame. Driving the
    // animation imperatively (rather than a permanent className) means nothing
    // auto-plays before the scroll settles; the none→reflow→set trick makes it
    // replay cleanly even when the SAME block is re-selected (same class string
    // would otherwise not restart a CSS animation without a remount, and a
    // remount would drop the `.focus()` above).
    let raf = 0
    let prevTop = null
    let stable = 0
    const play = () => {
      el.style.animation = 'none'
      void el.offsetHeight
      el.style.animation =
        'block-focus-shake var(--duration-slow) var(--ease-standard) 1'
    }
    const tick = () => {
      const top = el.getBoundingClientRect().top
      if (prevTop !== null && Math.abs(top - prevTop) < 0.5) stable += 1
      else stable = 0
      prevTop = top
      if (stable >= 2) {
        play()
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [focusToken, reducedMotion])

  // Detail card for short blocks: anchored to the block's on-screen rect and
  // rendered in a portal so the grid's overflow can't clip it.
  const [detail, setDetail] = useState(null) // { left, top } | null
  const isShort = (endMin - startMin) * PX_PER_MIN < SHORT_BLOCK_PX

  const openDetail = (e) => {
    // Never open while ANY drag is in progress — during a drag the browser holds
    // pointer capture and won't fire mouseleave, which would strand the card.
    if (!isShort || dragging || dragActive) return
    const r = e.currentTarget.getBoundingClientRect()
    setDetail({ left: r.left, top: r.bottom + 4 })
  }
  const closeDetail = () => setDetail(null)

  // Any pointerdown anywhere (notably a drag/resize starting on another block)
  // dismisses the card. During a drag the browser holds pointer capture and won't
  // fire mouseleave, so without this a card opened just before would linger as a
  // "ghost". CAPTURE phase so a handler that calls stopPropagation (the resize
  // grips do) can't stop us from clearing. setState in the listener callback is
  // allowed by the react-hooks rules.
  useEffect(() => {
    const clear = () => setDetail(null)
    window.addEventListener('pointerdown', clear, true)
    return () => window.removeEventListener('pointerdown', clear, true)
  }, [])

  const openMenuFromEvent = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    onOpenMenu?.({ x: e.clientX || rect.right, y: e.clientY || rect.top })
  }

  const handleKeyDown = (e) => {
    if (locked) return
    switch (e.key) {
      // Arrow keys nudge (move) the block — still preventDefault even when
      // moveLocked so a focused, read-only-week block doesn't scroll the page
      // out from under the user on every arrow press; it just doesn't move.
      case 'ArrowUp':
        e.preventDefault()
        if (!moveLocked) onNudge?.({ dMin: -5 })
        break
      case 'ArrowDown':
        e.preventDefault()
        if (!moveLocked) onNudge?.({ dMin: 5 })
        break
      case 'ArrowLeft':
        e.preventDefault()
        if (!moveLocked) onNudge?.({ dDay: -1 })
        break
      case 'ArrowRight':
        e.preventDefault()
        if (!moveLocked) onNudge?.({ dDay: 1 })
        break
      // Opening the menu is never move-locked: it's the one path to a past
      // week's 완료 전환/실제 시간 기록 (AC-5).
      case 'Enter':
      case ' ':
        e.preventDefault()
        openMenuFromEvent(e)
        break
      default:
        break
    }
  }

  return (
    <>
    <div
      ref={rootRef}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={`${block.title}, ${timeLabel}${isDone ? ', 완료' : ''}${
        violationLabel ? `, ${violationLabel}` : ''
      }${
        // Fully disabled (no menu at all) vs. move-locked but still reachable
        // for 완료 전환/실제 시간 기록. Two DIFFERENT things can set moveLocked
        // now (plan-polish fix G added a second one) — a past week (AC-5) and
        // an auto-place draft under review (fix G) — so this stays worded
        // generically ("이동 불가", not "지난 주") rather than naming either
        // cause specifically; the visible banner (PlanHeader's read-only strip,
        // or AutoPlaceBar's own caption) is what states WHICH one applies.
        disabled ? ', 읽기 전용' : moveLocked ? ', 이동·리사이즈 불가 · 완료 전환·기록만 가능' : ''
      }`}
      aria-disabled={disabled || undefined}
      style={{
        ...style,
        // Stripe painted into the block's own background — see VIOLATION_STRIPES.
        ...(violation ? { backgroundImage: VIOLATION_STRIPES[violation.severity] } : null),
        touchAction: 'none',
      }}
      onPointerDown={
        moveBlocked
          ? undefined
          : (e) => {
              closeDetail()
              onPointerDown?.(e, block, startMin)
            }
      }
      onMouseEnter={openDetail}
      onMouseLeave={closeDetail}
      onFocus={openDetail}
      onBlur={closeDetail}
      onContextMenu={(e) => {
        e.preventDefault()
        // Keep a block right-click on the block: don't let it bubble to the grid
        // body's empty-slot placement menu (ST-F1-03 PLAN-07).
        e.stopPropagation()
        if (locked) return
        openMenuFromEvent(e)
      }}
      onKeyDown={handleKeyDown}
      className={[
        'absolute overflow-hidden rounded-control border p-1.5 text-caption',
        'select-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring',
        typeClass,
        violation ? VIOLATION_BORDER_CLASSES[violation.severity] : '',
        isDone ? 'opacity-60' : '',
        moveBlocked ? 'cursor-default' : 'cursor-grab',
        dragging ? 'z-30 cursor-grabbing opacity-90 shadow-modal ring-2 ring-focus-ring' : 'z-10 shadow-card',
        resizing ? 'ring-2 ring-focus-ring' : '',
        pending ? 'opacity-70' : '',
        // PLAN-23 shake is driven imperatively from the focusToken effect above
        // (inline `animation`, fired only after the scroll settles) rather than
        // by a class here — a permanent class would auto-play the wobble while
        // the block is still sliding into view, which the owner didn't want.
      ].join(' ')}
    >
      {/* A2 resize handles (top/bottom edge). Pointer-only; keyboard users edit
          time via the task/schedule form. onResizeStart stops propagation so it
          never starts a block MOVE. Group-hover reveals a subtle grip. */}
      {onResizeStart && !moveBlocked && !dragging && (
        <>
          <span
            aria-hidden="true"
            onPointerDown={(e) => onResizeStart('start', e)}
            style={{ touchAction: 'none' }}
            className="group/resize absolute inset-x-0 top-0 z-20 flex h-2 cursor-ns-resize items-start justify-center"
          >
            <span className="mt-px h-0.5 w-6 rounded-full bg-current opacity-0 transition-opacity group-hover/resize:opacity-40" />
          </span>
          <span
            aria-hidden="true"
            onPointerDown={(e) => onResizeStart('end', e)}
            style={{ touchAction: 'none' }}
            className="group/resize absolute inset-x-0 bottom-0 z-20 flex h-2 cursor-ns-resize items-end justify-center"
          >
            <span className="mb-px h-0.5 w-6 rounded-full bg-current opacity-0 transition-opacity group-hover/resize:opacity-40" />
          </span>
        </>
      )}
      {/* Time + violation chip share one row so the chip costs no extra height on
          short blocks; the time truncates first because the chip carries the more
          urgent information. */}
      <span className="flex items-center gap-1 leading-tight text-[0.65rem]">
        <span className="truncate opacity-80">{timeLabel}</span>
        {violation && (
          <span
            className={[
              'ml-auto inline-flex shrink-0 items-center gap-0.5 rounded-chip px-1 py-px',
              'text-[0.6rem] font-bold',
              VIOLATION_CHIP_CLASSES[violation.severity],
            ].join(' ')}
          >
            <AlertTriangleIcon size={9} />
            {violationLabel}
          </span>
        )}
      </span>
      <span className="mt-0.5 flex items-start gap-1 font-medium leading-tight">
        {isDone && <CheckCircleIcon className="mt-px shrink-0 text-success-600" size={12} />}
        <span className={`line-clamp-3 ${isDone ? 'line-through' : ''}`}>{block.title}</span>
      </span>

      {/* PLAN-23 highlight, keyed so re-selecting the SAME block restarts it.
          Programmatic .focus() does not reliably match :focus-visible, so this
          ring — not the focus outline — is what actually points the eye at the
          block. Under reduced motion the ring stays STATIC instead of pulsing:
          dropping it entirely would leave those users with no visible signal at
          all, and the global reduced-motion rule would have collapsed the
          animation to its invisible end state anyway.

          The animated variant starts at `opacity-0` because a CSS animation
          reverts to the element's BASE style when it finishes — without this the
          ring would fade in, pulse twice, and then sit there permanently at full
          opacity. Either way the page clears `focusRequest` shortly after
          (FOCUS_HIGHLIGHT_MS), which is what takes the static ring down too. */}
      {focusToken != null && (
        <span
          key={focusToken}
          aria-hidden="true"
          className={[
            'pointer-events-none absolute inset-0 z-20 rounded-control ring-2 ring-focus-ring',
            reducedMotion
              ? ''
              : 'opacity-0 animate-[block-focus-pulse_var(--duration-slow)_var(--ease-standard)_2]',
          ].join(' ')}
        />
      )}

      {dragging && boundary && (
        <span className="absolute inset-x-1 bottom-1 rounded bg-brand-600 px-1 py-0.5 text-center text-[0.6rem] font-semibold text-white">
          {boundary === 'prev' ? '이전 주차로 이동' : '다음 주차로 이동'}
        </span>
      )}
    </div>
    {detail && !dragActive &&
      createPortal(
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[70] max-w-56 rounded-card border border-border bg-surface p-2 shadow-popover"
          style={{ left: Math.min(detail.left, window.innerWidth - 240), top: detail.top }}
        >
          <p className="text-caption text-text-muted">{timeLabel}</p>
          <p className="mt-0.5 text-label font-medium leading-snug text-text">{block.title}</p>
        </div>,
        document.body,
      )}
    </>
  )
}

export default PlanBlock
