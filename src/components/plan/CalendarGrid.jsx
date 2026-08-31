import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { PlanBlock } from './PlanBlock'
import { FixedScheduleBlock } from './FixedScheduleBlock'
import { usePlanDrag } from '../../features/plan/usePlanDrag'
import {
  availabilityForColumn,
  blockRect,
  hourTicks,
  PX_PER_MIN,
  pxToMinutes,
  rangeHeightPx,
  resolveGridSlot,
} from '../../features/plan/planGeometry'
// 이 파일의 축척은 전부 `pxPerMin` prop 하나에서 나온다 — 모듈 상수(PX_PER_MIN)는
// prop을 안 넘긴 호출부의 기본값 자리로만 남는다. 한 군데라도 상수를 직접 쓰면
// 사용자가 확대/축소했을 때 그 부분만 옛 축척으로 그려져 어긋난다.
import {
  clampBlockSpan,
  dateOf,
  formatISODate,
  formatMinutesLabel,
  minutesOfDay,
  parseISODate,
  snapMinutes,
  WEEKDAY_KEYS,
  WEEKDAY_LABELS_KO,
  WEEKEND_COLUMN_INDICES,
} from '../../features/plan/planTime'

const DEFAULT_BODY_MAX_HEIGHT = '62vh'

/* Column header: 요일 label + date, with today circled (design). */
function DayHeader({ dayISO, columnIndex, todayISO }) {
  const date = parseISODate(dayISO)
  const isToday = dayISO === todayISO
  const weekend = WEEKEND_COLUMN_INDICES.has(columnIndex)
  return (
    <div
      className={[
        'flex flex-col items-center gap-1 border-l border-border py-2 text-caption',
        weekend ? 'bg-surface-sunken' : '',
      ].join(' ')}
    >
      <span className={weekend ? 'text-text-muted' : 'text-text-muted'}>
        {WEEKDAY_LABELS_KO[columnIndex]}
      </span>
      <span
        className={[
          'flex h-6 w-6 items-center justify-center rounded-full text-label font-semibold',
          isToday ? 'bg-brand-600 text-white' : 'text-text',
        ].join(' ')}
      >
        {date.getDate()}
      </span>
    </div>
  )
}

/*
  Background column. AVAILABLE time is clean white; everything else — outside the
  availability window, and weekends entirely (they have no window) — carries the
  sunken tint, so the usable band is what reads as "open".
*/
function BgColumn({ availWindow, range, pxPerMin }) {
  const band = availWindow
    ? blockRect(availWindow.startMinutes, availWindow.endMinutes, range, pxPerMin)
    : null
  return (
    <div className="relative border-l border-border bg-surface-sunken">
      {band && (
        <div
          className="absolute inset-x-0 bg-surface"
          style={{ top: band.top, height: band.height }}
          aria-hidden="true"
        />
      )}
    </div>
  )
}

/*
  Availability-edge drag handle (PLAN-32) — rendered ONLY in 24h mode. Dragging
  the top/bottom edge of a day's availability band changes that day's start/end
  in 5-minute steps; release commits via PUT (onCommit). A live preview minute is
  reported through onPreview so the band tracks the drag before it commits.
*/
function AvailabilityHandle({ columnIndex, edge, minutes, gridRef, range, pxPerMin, onPreview, onCommit }) {
  const onPointerDown = (e) => {
    e.stopPropagation()
    e.preventDefault()
    const compute = (clientY) => {
      const rect = gridRef.current.getBoundingClientRect()
      return snapMinutes(pxToMinutes(clientY - rect.top, range, pxPerMin))
    }
    const move = (ev) => onPreview(columnIndex, edge, compute(ev.clientY))
    const up = (ev) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      onCommit(columnIndex, edge, compute(ev.clientY))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const top = (minutes - range.startMinutes) * pxPerMin
  return (
    <button
      type="button"
      aria-label={`${WEEKDAY_LABELS_KO[columnIndex]} 가용 ${edge === 'start' ? '시작' : '종료'} ${formatMinutesLabel(minutes)}`}
      onPointerDown={onPointerDown}
      style={{ top: top - 7, left: `calc(${columnIndex} / 7 * 100%)`, width: `calc(100% / 7)`, touchAction: 'none' }}
      className="group/avail absolute z-20 flex h-3.5 cursor-ns-resize items-center justify-center"
    >
      {/* Hidden until THIS handle's strip is hovered/focused (like the block resize
          grips). The edge reads as a thin rule across the column with a small
          centered grip — quieter than a solid pill. */}
      <span
        className="absolute inset-x-1 h-px bg-brand-500 opacity-0 transition-opacity group-hover/avail:opacity-70 group-focus-within/avail:opacity-70"
        aria-hidden="true"
      />
      <span
        className="relative h-1.5 w-9 rounded-full border border-brand-500/70 bg-surface opacity-0 shadow-card transition-opacity group-hover/avail:opacity-100 group-focus-within/avail:opacity-100"
        aria-hidden="true"
      />
    </button>
  )
}

/*
  The calendar body: 7 day columns × a time axis, with an absolutely-positioned
  block layer on top so a block can be dragged freely across columns (PLAN-19/20).
  usePlanDrag lives here because it needs the body's geometry. Keyboard nudging
  and drag both funnel into the single `onMoveCommit` the page provides.
*/
export function CalendarGrid({
  weekDays,
  range,
  mode,
  blocks,
  availability,
  readOnly,
  onMoveCommit,
  onOpenMenu,
  onAvailabilityCommit,
  bodyRef,
  placement = null,
  draftBlocks = null,
  onEmptySlot,
  onResizeCommit,
  onBlockDropOutside,
  // ST-F1-05: { [planBlockId]: { severity, label, count } } — the validation
  // marking for each violated block, and { planBlockId, token } naming the block
  // the review panel most recently asked to focus (PLAN-23).
  violationsByBlockId = null,
  focusRequest = null,
  // ST-F1-06: this week's recurring fixed schedules (weekday + minutes, plus
  // activeThisWeek) and the handler that opens their block-action menu.
  fixedSchedules = null,
  onOpenFixedMenu,
  bodyMaxHeight = DEFAULT_BODY_MAX_HEIGHT,
  // 요일 헤더 줄의 실측 높이를 페이지로 올려 준다 (2026-08-31 맞춤 축척).
  // 페이지는 달력 상자 전체 높이(bodyMaxHeight)만 알 뿐, 그중 격자 본문이
  // 실제로 쓸 수 있는 높이는 헤더를 뺀 나머지다. 상수로 짐작하면 폰트·줄간격이
  // 바뀔 때마다 몇 px씩 어긋나 "다 보이는데 스크롤바만 생기는" 상태가 되므로
  // 재지 않고 넘겨받는다. 헤더 높이는 축척과 무관하므로 되먹임 고리가 없다.
  onHeaderHeight,
  // 사용자가 고른 세로 축척(분당 픽셀). 페이지가 소유하고 여기로 내려온다 —
  // 이 컴포넌트 안의 모든 좌표 계산은 오직 이 값만 쓴다.
  pxPerMin = PX_PER_MIN,
}) {
  const gridRef = useRef(null)
  const scrollRef = useRef(null)
  const headerRef = useRef(null)
  const [resizeState, setResizeState] = useState(null) // {planBlockId,startMin,endMin}

  // 요일 헤더 실측 → 페이지(맞춤 축척 계산). border-box 높이를 그대로 넘긴다.
  // useLayoutEffect인 이유: 이 값이 도착해야 맞춤 축척이 확정되므로, 페인트
  // 전에 올려 보내지 않으면 첫 프레임이 기본 축척으로 한 번 그려졌다가
  // 맞춤 축척으로 다시 그려져 눈에 띄게 튄다.
  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el || !onHeaderHeight) return undefined
    onHeaderHeight(el.getBoundingClientRect().height)
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver((entries) => {
      onHeaderHeight(entries[0].target.getBoundingClientRect().height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [onHeaderHeight])

  // A callback ref that mirrors the grid body element into the page's bodyRef too,
  // so the page can hit-test panel→grid drops (resolveGridSlot) against exactly
  // what the grid renders. gridRef stays a plain useRef (no aliasing) so internal
  // consumers (drag hook, ResizeObserver) use it normally.
  const setGridRef = useCallback(
    (el) => {
      gridRef.current = el
      if (bodyRef) bodyRef.current = el
    },
    [bodyRef],
  )
  const todayISO = formatISODate(new Date())
  const [availPreview, setAvailPreview] = useState(null) // {columnIndex,edge,minutes}
  const [gridWidth, setGridWidth] = useState(0)

  // Track the body width so a dragged block can be positioned in pixels via a GPU
  // transform (see below) rather than animated top/left — the latter smears a
  // large box-shadow into afterimages on repaint.
  useEffect(() => {
    const el = gridRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver((entries) => {
      setGridWidth(entries[0].contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { dragState, onBlockPointerDown } = usePlanDrag({
    gridRef,
    range,
    pxPerMin,
    onCommit: onMoveCommit,
    onDropOutside: onBlockDropOutside,
    disabled: readOnly,
  })

  // A2 edge-drag resize. Dragging a block's top/bottom handle changes its start/
  // end in 5-min steps (min 15-min tall); release commits via onResizeCommit. Runs
  // here (not in PlanBlock) because it needs the grid geometry, like the availability
  // handles. The pointerdown stops propagation so it never starts a block MOVE.
  //
  // 2026-08-31 정정: 클램프를 하루 전체(0..MINUTES_PER_DAY)가 아니라 지금 보이는
  // `range`로 좁혔다. 예전엔 focus 모드에서 그리드 바닥 아래로(가시 범위 밖으로)
  // 끌어도 값 자체는 자정까지 허용됐는데, 그 초과분을 흡수해 주던 것이 바로
  // visibleRange의 위아래 여유였다 — 여유를 없앤 지금은(그 함수 헤더 참고) 흡수할
  // 곳이 없어 미리보기가 그리드 밖으로 그대로 삐져나갔다(blockRect의 15분 최소
  // 높이 캡과 같은 종류의 문제, 그쪽 헤더 참고). `usePlanDrag`의 MOVE 드래그는
  // 이미 같은 이유로 `range`에 클램프돼 있었으므로(그 파일의 compute), 여기도
  // 같은 경계에 맞춘다 — 한 그리드 안에서 MOVE와 RESIZE가 서로 다른 경계를 갖는
  // 것이 더 이상한 일이다.
  //
  // 이 클램프는 부수적으로 "보이지 않는 시간으로 리사이즈"도 막는다: focus
  // 모드의 `range`는 가용 시간(∪ 이 주에 실제로 그려지는 것) 밖으로는 아예 열려
  // 있지 않으므로, 그 창 밖 시간대로 늘리는 것은 원래 의미가 없다 — 하루 전체를
  // 보고 늘리고 싶으면 24시간 토글이 이미 그 창을 연다.
  const RESIZE_MIN_DUR = 15
  const makeResizeStart = (block, dayIndex, startMin, endMin) => (edge, e) => {
    if (readOnly || e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const compute = (clientY) => {
      const rect = gridRef.current.getBoundingClientRect()
      const m = snapMinutes(pxToMinutes(clientY - rect.top, range, pxPerMin))
      /*
        두 제약의 **우선순위**가 중요하다: 최소 길이(15분)가 범위 클램프를 이긴다.

        둘을 순진하게 겹치면(범위로 먼저 자르고 최소 길이를 안쪽에 두면) 범위
        경계에 15분보다 가깝게 붙은 블록에서 손잡이가 **아무 반응도 없는 상태**가
        된다: `startMin + 15`가 이미 `range.endMinutes`를 넘으므로 어느 방향으로
        끌든 결과가 원래 값으로 눌리고, pointerup에서도 값이 안 바뀌었으니 커밋조차
        일어나지 않는다 — 에러도 토스트도 없이 조용히 죽는, 이 코드베이스가 가장
        싫어하는 실패 방식이다. 여유를 없앤 뒤로 그 주에서 가장 이르거나 늦은
        블록이 경계에 바짝 붙는 것이 흔해졌고, ScheduleForm은 15분 미만(5분 단위)
        일정 생성을 실제로 허용하므로 도달 가능한 상태다.

        그래서 최소 길이를 바깥에 둔다. 평소에는 `m`이 범위 안이라 범위 클램프가
        그대로 먹고, 둘이 충돌할 때만 최소 길이가 이겨 블록이 범위를 잠깐 넘는다.
        그건 안전하다 — visibleRange가 그려지는 구간을 감싸도록 창을 넓히므로,
        커밋되는 순간 창이 그 블록을 포함하도록 자란다. 드래그 중 한때 넘치는
        것과, 손잡이가 영영 죽어 있는 것 중에서는 전자가 낫다.
      */
      return edge === 'start'
        ? {
            startMin: Math.min(endMin - RESIZE_MIN_DUR, Math.max(range.startMinutes, m)),
            endMin,
          }
        : {
            startMin,
            endMin: Math.max(startMin + RESIZE_MIN_DUR, Math.min(range.endMinutes, m)),
          }
    }
    const move = (ev) => setResizeState({ planBlockId: block.planBlockId, ...compute(ev.clientY) })
    const up = (ev) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const next = compute(ev.clientY)
      // Commit the optimistic cache update FIRST, THEN clear the preview — both in
      // the same React batch, so the block never renders one frame at its old
      // cache size before the resize applies (mirrors useMoveBlock's ordering).
      if (next.startMin !== startMin || next.endMin !== endMin) {
        onResizeCommit?.(block, { dayIndex, ...next })
      }
      setResizeState(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const height = rangeHeightPx(range, pxPerMin)
  const ticks = hourTicks(range)

  // In 24h mode, start scrolled to ~8:00 so the working day is visible. Switching
  // back to focus mode resets to the top — focus mode already begins at the
  // working hours, so a leftover 24h scroll offset would otherwise push it down.
  //
  // 축척(pxPerMin)은 일부러 의존성에 넣지 않고 ref로 읽는다 — 축척이 바뀌었을
  // 때 할 일은 "8시로 되감기"가 아니라 "보던 자리를 지키기"이고, 그건 바로
  // 아래 레이아웃 이펙트가 맡는다. 둘 다 반응하면 서로 덮어쓴다.
  // 렌더 중에 ref를 쓰면 React 19 린트가 막는다(그리고 실제로 위험하다) —
  // 동기화는 이펙트에서 한다. 아래 스크롤 이펙트보다 먼저 선언해야, 같은
  // 커밋에서 mode와 축척이 함께 바뀌었을 때 최신 축척으로 계산한다.
  const pxPerMinRef = useRef(pxPerMin)
  useEffect(() => {
    pxPerMinRef.current = pxPerMin
  }, [pxPerMin])
  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop =
      mode === '24h' ? Math.max(0, (8 * 60 - range.startMinutes) * pxPerMinRef.current) : 0
  }, [mode, range.startMinutes])

  /*
    확대/축소했을 때 "보고 있던 시각"을 그대로 붙잡아 둔다. 축척만 바뀌면 같은
    시각이 있던 픽셀 위치도 같은 비율로 움직이므로, 스크롤 위치에 그 비율을
    곱하는 것으로 충분하다 — 넉넉히 키웠는데 화면이 맨 위(가용 시작)로 튕겨
    올라가 방금 보던 오후를 다시 찾아 내려가야 하는 일이 없다.

    useLayoutEffect인 이유: 새 높이가 페인트되기 전에 스크롤을 옮겨야 한 프레임
    깜빡임이 안 생긴다.
  */
  const prevPxPerMinRef = useRef(pxPerMin)
  useLayoutEffect(() => {
    const el = scrollRef.current
    const prev = prevPxPerMinRef.current
    prevPxPerMinRef.current = pxPerMin
    if (!el || prev === pxPerMin || prev <= 0) return
    el.scrollTop = el.scrollTop * (pxPerMin / prev)
  }, [pxPerMin])

  // Position each block; the one being dragged uses the live drag target.
  const positioned = blocks
    .map((block) => {
      let dayIndex = weekDays.indexOf(dateOf(block.startAt))
      let startMin = minutesOfDay(block.startAt)
      let endMin = minutesOfDay(block.endAt)
      const isDragged = dragState?.planBlockId === block.planBlockId
      if (isDragged) {
        dayIndex = dragState.dayIndex
        startMin = dragState.startMin
        endMin = dragState.endMin
      }
      // Live resize preview (A2).
      if (resizeState?.planBlockId === block.planBlockId) {
        startMin = resizeState.startMin
        endMin = resizeState.endMin
      }
      return { block, dayIndex, startMin, endMin, isDragged }
    })
    .filter((p) => p.dayIndex >= 0)

  // plan-polish: a block fully covered by a longer one is unreachable (its
  // pointer events sit under the block on top), and same-z siblings paint in
  // DOM order — so a long block added after a short one on the same day was
  // always the one left grabbable. Rank duration WITHIN each day column only
  // (blocks in different columns never visually overlap, so ranking across all
  // seven is pointless and would blow past the z-index budget below); shorter
  // duration → higher rank → painted on top. Dense rank (equal durations share
  // one level) so identical-length blocks keep their EXISTING relative order —
  // same z level means paint order falls back to untouched DOM order. Capped at
  // 9 levels so the bump (10..19) can never reach the availability-handle tier
  // (z-20) even if one day is stacked with more than ten blocks. Render order
  // itself (and therefore Tab order) is left alone; only z-index changes.
  const zBumpByBlockId = {}
  {
    const byDay = new Map()
    for (const p of positioned) {
      const list = byDay.get(p.dayIndex) ?? []
      list.push(p)
      byDay.set(p.dayIndex, list)
    }
    for (const dayPositioned of byDay.values()) {
      const durationsDesc = [...new Set(dayPositioned.map((p) => p.endMin - p.startMin))].sort(
        (a, b) => b - a,
      )
      for (const p of dayPositioned) {
        const rank = durationsDesc.indexOf(p.endMin - p.startMin) // 0 = longest that day
        zBumpByBlockId[p.block.planBlockId] = Math.min(rank, 9)
      }
    }
  }

  // Fixed schedules (ST-F1-06) recur by WEEKDAY, not by a specific date, so their
  // column comes from WEEKDAY_KEYS rather than weekDays.indexOf(dateOf(...)) —
  // the same schedule renders in the same column every week, regardless of which
  // week is on screen.
  const positionedFixed = (fixedSchedules ?? [])
    .map((f) => ({
      f,
      dayIndex: WEEKDAY_KEYS.indexOf(f.weekday),
      startMin: f.startMinutes,
      endMin: f.endMinutes,
    }))
    .filter((p) => p.dayIndex >= 0)

  // Draft blocks from an auto-place proposal (ST-F1-03 RB-PLAN-01) — laid out like
  // real blocks but rendered dashed + "초안" and non-interactive until applied.
  const positionedDrafts = (draftBlocks ?? [])
    .map((d) => {
      const dayIndex = weekDays.indexOf(dateOf(d.startAt))
      return { d, dayIndex, startMin: minutesOfDay(d.startAt), endMin: minutesOfDay(d.endAt) }
    })
    .filter((p) => p.dayIndex >= 0)

  // Live drop preview while dragging a task out of the panel (PLAN-06). The slot
  // is resolved in the drag hook's pointer handlers (not here — refs must not be
  // read during render), so this only lays out the ghost for the task's duration.
  const placementPreview = (() => {
    if (!placement?.slot) return null
    // clampBlockSpan mirrors WeeklyPage's placeTaskAt exactly (same helper) —
    // the ghost drawn here must land at the SAME span the drop actually
    // commits, including the 5-minute snap of the task's own estimate, or the
    // preview would show one span and the real block a different one.
    const { startMin, endMin } = clampBlockSpan(placement.slot.startMin, placement.task.estimatedMinutes ?? 60)
    return { dayIndex: placement.slot.dayIndex, startMin, endMin, title: placement.task.title }
  })()

  const previewFor = (columnIndex, edge, fallback) =>
    availPreview && availPreview.columnIndex === columnIndex && availPreview.edge === edge
      ? availPreview.minutes
      : fallback

  const makeNudge = (block, dayIndex, startMin, endMin) => (delta) => {
    const duration = endMin - startMin
    let day = dayIndex
    let boundary = null
    let start = startMin
    if (delta.dMin) start = snapMinutes(startMin + delta.dMin)
    if (delta.dDay) {
      const raw = dayIndex + delta.dDay
      if (raw < 0) boundary = 'prev'
      else if (raw > 6) boundary = 'next'
      day = Math.max(0, Math.min(6, raw))
    }
    onMoveCommit({ planBlockId: block.planBlockId, boundary, dayIndex: day, startMin: start, endMin: start + duration })
  }

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      {/* Horizontal scroll on narrow screens: header + body scroll together and
          keep a usable minimum column width (mobile shows a subset, §R). */}
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          {/* A SINGLE vertical scroll container holds the header and the body, so a
              vertical scrollbar narrows both by the same amount and the columns
              stay aligned (a scrollbar on the body alone would offset the header). */}
          <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: bodyMaxHeight }}>
            {/* Sticky day-header row. */}
            {/* z-40: above the dragged block / drop preview (z-30) so a block
                scrolled to the top slides UNDER the day header, never over it. */}
            <div ref={headerRef} className="sticky top-0 z-40 flex border-b border-border bg-surface">
              <div className="w-12 shrink-0" />
              <div className="grid flex-1 grid-cols-7">
                {weekDays.map((dayISO, i) => (
                  <DayHeader key={dayISO} dayISO={dayISO} columnIndex={i} todayISO={todayISO} />
                ))}
              </div>
            </div>

            {/* Body row: ruler + grid, sharing the container's scroll. */}
            <div className="flex">
              {/* Left hour ruler. */}
              <div className="relative w-12 shrink-0" style={{ height }}>
                {/* 라벨은 눈금선 위에 가운데 정렬이지만, 창의 위아래 끝에 닿는
                    눈금만은 안쪽으로 붙여 그린다. visibleRange가 가용 시간
                    바깥의 여유를 없앤 뒤로 첫 눈금이 top 0, 마지막 눈금이
                    바닥에 정확히 앉기 때문에(그 함수 주석 참고), 가운데
                    정렬이면 첫 라벨은 위쪽 절반이 헤더에 가리고 마지막 라벨은
                    아래쪽 절반이 카드 밖으로 나간다. */}
                {ticks.map((h) => {
                  const atTop = h * 60 === range.startMinutes
                  const atBottom = h * 60 === range.endMinutes
                  return (
                    <span
                      key={h}
                      className={[
                        'absolute right-1 text-caption text-text-muted',
                        atTop ? '' : atBottom ? '-translate-y-full' : '-translate-y-1/2',
                      ].join(' ')}
                      style={{ top: (h * 60 - range.startMinutes) * pxPerMin }}
                    >
                      {String(h).padStart(2, '0')}
                    </span>
                  )
                })}
              </div>

        {/* Grid body — drag reference element. A right-click on empty space (not on
            a block — PlanBlock stops propagation) opens the place-here menu (PLAN-07). */}
        <div
          ref={setGridRef}
          className="relative flex-1"
          style={{ height }}
          onContextMenu={(e) => {
            if (readOnly || !onEmptySlot) return
            const slot = resolveGridSlot(
              { x: e.clientX, y: e.clientY },
              e.currentTarget.getBoundingClientRect(),
              range,
              pxPerMin,
            )
            if (!slot) return
            e.preventDefault()
            onEmptySlot({ x: e.clientX, y: e.clientY }, slot)
          }}
        >
          {/* Background columns (weekend tint + availability band). */}
          <div className="absolute inset-0 grid grid-cols-7">
            {weekDays.map((dayISO, i) => {
              const win = availabilityForColumn(i, availability)
              const shown = win
                ? {
                    startMinutes: previewFor(i, 'start', win.startMinutes),
                    endMinutes: previewFor(i, 'end', win.endMinutes),
                  }
                : null
              return (
                <BgColumn
                  key={dayISO}
                  columnIndex={i}
                  availWindow={shown}
                  range={range}
                  pxPerMin={pxPerMin}
                />
              )
            })}
          </div>

          {/* Hour gridlines.

              창 맨 아래 눈금(= range.endMinutes)은 건너뛴다. 그 선은 격자 높이
              바로 아래 1px에 그려지는데, 절대 위치라 스크롤 컨테이너의 스크롤
              영역을 그만큼 늘린다 — 축척을 화면에 딱 맞춰 놨는데 이 1px 때문에
              스크롤바가 생기는, 가장 허무한 실패다. 그 자리에는 카드 테두리가
              이미 같은 선을 긋고 있어 시각적으로 잃는 것도 없다. */}
          {ticks
            .filter((h) => h * 60 !== range.endMinutes)
            .map((h) => (
              <div
                key={h}
                className="pointer-events-none absolute inset-x-0 border-t border-border/70"
                style={{ top: (h * 60 - range.startMinutes) * pxPerMin }}
                aria-hidden="true"
              />
            ))}

          {/* Availability edge handles (24h mode only, editable weeks only). */}
          {mode === '24h' &&
            !readOnly &&
            weekDays.map((dayISO, i) => {
              const win = availabilityForColumn(i, availability)
              if (!win) return null
              return ['start', 'end'].map((edge) => (
                <AvailabilityHandle
                  key={`${dayISO}-${edge}`}
                  columnIndex={i}
                  edge={edge}
                  minutes={previewFor(i, edge, edge === 'start' ? win.startMinutes : win.endMinutes)}
                  gridRef={gridRef}
                  range={range}
                  pxPerMin={pxPerMin}
                  onPreview={(c, e2, m) => setAvailPreview({ columnIndex: c, edge: e2, minutes: m })}
                  onCommit={(c, e2, m) => {
                    // Commit FIRST (the optimistic cache write), THEN drop the
                    // preview — same React batch, so the band never snaps back to
                    // its old edge for a frame (mirrors the block-resize ordering).
                    onAvailabilityCommit(c, e2, m)
                    setAvailPreview(null)
                  }}
                />
              ))
            })}

          {/* Fixed-schedule layer (ST-F1-06). Rendered BEHIND real plan blocks
              (z-[5], below the block layer's z-10/z-20/z-30) so a TASK/SCHEDULE
              block placed on top of one — the V2 고정 일정 충돌 case — stays the
              readable, interactive element on top, with the fixed schedule it
              conflicts with still visible around its edges underneath. */}
          {positionedFixed.map(({ f, dayIndex, startMin, endMin }) => {
            const rect = blockRect(startMin, endMin, range, pxPerMin)
            return (
              <FixedScheduleBlock
                key={f.fixedScheduleId}
                schedule={f}
                disabled={readOnly}
                style={{
                  left: `calc(${dayIndex} / 7 * 100% + 2px)`,
                  width: `calc(100% / 7 - 4px)`,
                  top: rect.top,
                  height: rect.height,
                }}
                onOpenMenu={(pos) => onOpenFixedMenu?.(f, pos)}
              />
            )
          })}

          {/* Block layer. A dragged block is positioned in pixels via a GPU
              transform (translate3d) instead of animated top/left, so its
              box-shadow is repainted on its own compositing layer and leaves no
              afterimage trail. Static blocks keep percentage left/top. */}
          {positioned.map(({ block, dayIndex, startMin, endMin, isDragged }) => {
            const rect = blockRect(startMin, endMin, range, pxPerMin)
            const colW = gridWidth / 7
            const baseStyle =
              isDragged && colW > 0
                ? {
                    left: 0,
                    top: 0,
                    width: colW - 4,
                    height: rect.height,
                    transform: `translate3d(${dayIndex * colW + 2}px, ${rect.top}px, 0)`,
                    willChange: 'transform',
                  }
                : {
                    left: `calc(${dayIndex} / 7 * 100% + 2px)`,
                    width: `calc(100% / 7 - 4px)`,
                    top: rect.top,
                    height: rect.height,
                  }
            // The dragged block keeps its z-30 from the className alone (an inline
            // zIndex here would win the cascade over that class and fight it), so
            // the duration bump only ever applies while at rest.
            const style = isDragged
              ? baseStyle
              : { ...baseStyle, zIndex: 10 + (zBumpByBlockId[block.planBlockId] ?? 0) }
            return (
              <PlanBlock
                key={block.planBlockId}
                block={block}
                startMin={startMin}
                endMin={endMin}
                dragging={isDragged}
                boundary={isDragged ? dragState.boundary : null}
                // ST-F1-02 AC-5 (extended by plan-polish fix G): while `readOnly`
                // is set — a past week, OR (fix G) an auto-place draft under
                // review on the CURRENT week; this component only ever sees the
                // combined flag, not which one applies, and doesn't need to — a
                // TASK block's 완료 전환/실제 시간 기록 stay reachable (both live
                // behind this same menu, so it can't be fully `disabled`), but
                // SCHEDULE has neither action, so it stays fully disabled.
                // `moveLocked` then blocks the plan-changing paths (drag/resize/
                // nudge) on top, for every block type, whenever `readOnly` is set.
                disabled={readOnly && block.blockType !== 'TASK'}
                moveLocked={readOnly}
                pxPerMin={pxPerMin}
                // Any drag in progress (this or another block, or a panel→grid
                // placement) suppresses the hover detail card, so pointer-capture
                // swallowing mouseleave can't leave stale cards on the grid.
                dragActive={Boolean(dragState) || Boolean(placement) || Boolean(resizeState)}
                resizing={resizeState?.planBlockId === block.planBlockId}
                pending={String(block.planBlockId).startsWith('temp-')}
                violation={violationsByBlockId?.[block.planBlockId] ?? null}
                focusToken={
                  focusRequest?.planBlockId === block.planBlockId ? focusRequest.token : null
                }
                style={style}
                onPointerDown={(e) => onBlockPointerDown(e, block, dayIndex, startMin)}
                onOpenMenu={(pos) => onOpenMenu(block, pos)}
                onNudge={makeNudge(block, dayIndex, startMin, endMin)}
                onResizeStart={readOnly ? undefined : makeResizeStart(block, dayIndex, startMin, endMin)}
              />
            )
          })}

          {/* Auto-place draft layer (RB-PLAN-01): non-interactive and rendered
              UNMISTAKABLY provisional — a diagonal hatch fill + bold dashed border
              + a solid "초안" pill — so it never reads as a committed task block
              (which is a solid brand fill). */}
          {positionedDrafts.map(({ d, dayIndex, startMin, endMin }) => {
            const rect = blockRect(startMin, endMin, range, pxPerMin)
            return (
              <div
                key={d.taskId}
                aria-hidden="true"
                className="pointer-events-none absolute z-20 overflow-hidden rounded-control border-2 border-dashed border-brand-500 p-1.5 text-caption text-brand-900"
                style={{
                  left: `calc(${dayIndex} / 7 * 100% + 2px)`,
                  width: `calc(100% / 7 - 4px)`,
                  top: rect.top,
                  height: rect.height,
                  backgroundColor: 'var(--color-surface)',
                  backgroundImage:
                    'repeating-linear-gradient(45deg, color-mix(in srgb, var(--color-brand-600) 16%, transparent) 0, color-mix(in srgb, var(--color-brand-600) 16%, transparent) 6px, transparent 6px, transparent 13px)',
                }}
              >
                <span className="inline-block rounded-chip bg-brand-600 px-1.5 py-px text-[0.6rem] font-bold text-white">
                  초안
                </span>
                <span className="mt-1 block font-medium leading-tight line-clamp-2">{d.title}</span>
              </div>
            )
          })}

          {/* Live drop preview while dragging a task from the panel (PLAN-06). */}
          {placementPreview && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute z-30 flex flex-col overflow-hidden rounded-control border-2 border-dashed border-brand-500 bg-brand-100/70 p-1.5 text-caption text-brand-900"
              style={{
                left: `calc(${placementPreview.dayIndex} / 7 * 100% + 2px)`,
                width: `calc(100% / 7 - 4px)`,
                top: blockRect(placementPreview.startMin, placementPreview.endMin, range, pxPerMin).top,
                height: blockRect(placementPreview.startMin, placementPreview.endMin, range, pxPerMin).height,
              }}
            >
              <span className="block text-[0.6rem] opacity-80">
                {formatMinutesLabel(placementPreview.startMin)} - {formatMinutesLabel(placementPreview.endMin)}
              </span>
              <span className="mt-0.5 block font-medium leading-tight line-clamp-2">
                {placementPreview.title}
              </span>
            </div>
          )}
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CalendarGrid
