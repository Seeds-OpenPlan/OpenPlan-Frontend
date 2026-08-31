import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatMinutesLabel } from '../../features/plan/planTime'
import { PX_PER_MIN } from '../../features/plan/planGeometry'
import { AlertTriangleIcon, CheckCircleIcon } from '../common/statusIcons'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import {
  VIOLATION_BORDER_CLASSES,
  VIOLATION_CHIP_CLASSES,
  VIOLATION_STRIPES,
} from '../../features/plan/violationStyles'

// Below this rendered height a block can't show its title legibly, so a
// hover/focus detail card supplements it (readability aid — the block's
// aria-label already carries the full title+time for screen readers). This is
// an ABSOLUTE pixel figure (padding + one line of the time label + one line of
// the title, per the block's fixed font sizes/padding below) — it does NOT
// scale with the grid's vertical scale. 세로 축척은 이제 사용자가 확대/축소로
// 고르는 값이라(planGeometry의 HOUR_PX_STEPS) 이 문턱을 넘나드는 블록 집합도
// 그때그때 달라진다 — 넉넉히 볼수록 같은 길이의 블록이 화면에서 더 높아져 카드
// 없이도 제목이 읽히고, 촘촘히 볼수록 더 많은 블록이 카드에 기댄다. 그것이
// 의도한 동작이지, 이 상수를 축척에 맞춰 같이 키울 이유가 아니다.
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

/*
  블록 종류별 색 (2026-08-29: "고정일정·태스크·일정 색깔 다르게").

  세 종류가 각자 다른 계열을 쓴다 — 태스크=브랜드 파랑, 일정=초록, 고정 일정=
  회색(FixedScheduleBlock이 소유). 예전엔 일정이 `bg-surface`, 즉 빈 그리드와
  똑같은 흰 카드여서 테두리 하나로만 구분됐다.

  색만으로 구분하지는 않는다(NFR-017): 고정 일정은 자물쇠 글리프를, 일정·태스크는
  아래 종류 라벨을 aria-label에 싣고, 그리드 바로 위 요약 줄의 범례(SummaryBar의
  BlockLegend)가 세 색을 글자로 풀어 준다. 위반 표시(테두리+빗금+칩)는 이 위에 덧그려지며, 칩이 실제
  의미를 전달하므로 계열이 겹쳐도 오독되지 않는다.
*/
const TYPE_CLASSES = {
  TASK: 'bg-brand-50 border-brand-200 text-brand-900',
  SCHEDULE: 'bg-success-50 border-success-500 text-success-700',
}

const TYPE_LABELS = { TASK: '태스크', SCHEDULE: '일정' }

/*
  우선순위 강조 막대 ("우선순위에 따라 색상 다르게").
  블록 왼쪽 3px 띠로만 칠한다 — 배경 계열은 이미 종류를 뜻하므로, 우선순위까지
  배경에 실으면 둘을 구분할 수 없다.

  ⚠ 지금 실서버 GET /weekly-plans 의 PlanBlock 응답에는 priority 필드가 없다
  (openapi PlanBlock 스키마 참고). 그래서 실데이터에서는 이 띠가 뜨지 않는다 —
  BE가 필드를 실어 주는 순간 저절로 살아나도록 "값이 있을 때만" 그리는 형태로
  둔다. 값이 없다고 회색 띠를 그리면 "우선순위 낮음"이라는 거짓말이 된다.
*/
const PRIORITY_BAR_CLASSES = {
  1: 'bg-danger-600',
  2: 'bg-warning-500',
  3: 'bg-neutral-400',
}
const PRIORITY_LABELS = { 1: '높음', 2: '보통', 3: '낮음' }

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
  // 현재 세로 축척(분당 픽셀). 짧은 블록 판정이 이 값에 달려 있어, 사용자가
  // 축척을 바꾸면 hover 카드가 필요한 블록 집합도 함께 달라져야 한다.
  pxPerMin = PX_PER_MIN,
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
  const typeLabel = TYPE_LABELS[block.blockType] ?? TYPE_LABELS.TASK
  const priorityBar = PRIORITY_BAR_CLASSES[block.priority] ?? null
  const priorityLabel = PRIORITY_LABELS[block.priority] ?? null
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

    // 결정된 동작: the block should wobble AFTER it finishes sliding into
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
  const isShort = (endMin - startMin) * pxPerMin < SHORT_BLOCK_PX

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
      aria-label={`${typeLabel}, ${block.title}, ${timeLabel}${
        // 색으로만 전달되는 것이 없도록, 종류와 우선순위를 글자로도 싣는다
        // (NFR-017) — TYPE_CLASSES/PRIORITY_BAR_CLASSES 헤더 참고.
        priorityLabel ? `, 우선순위 ${priorityLabel}` : ''
      }${isDone ? ', 완료' : ''}${
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
      onClick={() => {
        /*
          2026-08-31 ("배치된 블록 누르면 그쪽으로 바로 스크롤 되어도
          괜찮을 것 같아"). 격자가 한 화면에 다 안 들어가는 경우 — 24시간
          모드나, 가시 범위가 너무 넓어 맞춤 축척이 바닥(FIT_HOUR_PX_MIN)에 닿은
          주 — 위아래 가장자리의 블록은 반쯤 잘린 채로 보인다. 그 조각을 누르면
          전체가 드러나도록 최소한만 스크롤한다.

          `block:'nearest'`가 핵심이다: 이미 통째로 보이는 블록에는 **아무 일도
          일어나지 않는다**(PLAN-23의 'center'와 다른 점 — 그쪽은 패널이 "이
          블록을 봐라"고 지목한 경우라 화면 한가운데로 끌어오는 게 맞다). 그래서
          맞춤 축척으로 전부 보이는 평소에는 이 핸들러가 사실상 없는 것과 같고,
          드래그 직후 따라오는 click 에서도 (블록이 커서 아래 = 보이는 상태라)
          조용하다.
        */
        rootRef.current?.scrollIntoView({
          block: 'nearest',
          inline: 'nearest',
          behavior: reducedMotion ? 'auto' : 'smooth',
        })
      }}
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
        // 우선순위 띠가 있을 때만 왼쪽 여백을 띠 폭만큼 넓힌다 — 없을 땐 예전
        // 여백 그대로라 블록 안 글자 위치가 달라지지 않는다.
        priorityBar ? 'pl-2.5' : '',
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
      {/* 우선순위 띠. 값이 있을 때만 그린다(PRIORITY_BAR_CLASSES 헤더).
          pointer-events-none이라 블록의 드래그·메뉴 동작을 가로채지 않는다. */}
      {priorityBar && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 left-0 w-[3px] ${priorityBar}`}
        />
      )}
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
        {/* text-current: 일정 블록이 초록 계열이 되면서 초록 체크가 배경에
            묻혔다. 완료 표시는 체크 글리프 + 취소선 + 흐리게(세 신호)가
            전달하므로, 아이콘 색은 블록 글자색을 그대로 따르면 된다. */}
        {isDone && <CheckCircleIcon className="mt-px shrink-0 text-current" size={12} />}
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
