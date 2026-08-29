/*
  Geometry for the calendar grid: the single source that converts between minutes
  and pixels, and that decides which slice of the day is visible in each mode
  (PLAN-04). Keeping this pure and separate from components means the grid render,
  the block rects, and the drag hook can never disagree about the scale.
*/

import { MINUTES_PER_DAY, snapMinutes, WEEKDAY_KEYS } from './planTime'

// One hour of vertical space. Blocks and the hour ruler both derive from this.
//
// 2026-08-29 (팀장 제안): "주간계획 화면이 너무 작아서 스크롤 하는 게 불편하다 —
// 1시간 간격을 좀 좁히더라도 한 눈에 더 많은 시간을 보이게 하자." 75 → 50으로
// 내렸다. 같은 그리드 높이에서 보이는 시간이 8시간대 → 12시간대로 늘어, 보통의
// 가용 창(예: 09–19시)이 스크롤 없이 통째로 들어온다.
//
// 왜 더 내리지 않았나: 이 값은 블록 안 글씨 높이와 직접 맞물린다. 1시간 블록의
// 실제 높이가 그대로 HOUR_PX이고, PlanBlock은 46px(SHORT_BLOCK_PX) 아래를
// "제목을 못 읽는 블록"으로 보고 hover 카드에 의존한다. 50이면 1시간 블록은
// 여전히 자기 제목을 직접 보여 주고, 그 아래(45분 이하)만 카드로 넘어간다.
// 40대로 더 내리면 가장 흔한 1시간 블록까지 전부 카드 의존이 된다.
//
// Every other geometry helper here (rangeHeightPx, blockRect, pxToMinutes) and
// every consumer (CalendarGrid's scroll-offset math, usePlanDrag's px→min drag
// delta) derives from PX_PER_MIN, so they all scale automatically; nothing else
// needs a matching change.
export const HOUR_PX = 50
export const PX_PER_MIN = HOUR_PX / 60

/**
 * Visible time band for the current mode.
 * - '24h'  : the whole day (0..1440) with availability drawn as boundary lines.
 * - 'focus': clamp to the bounding window of active availability across the week
 *            so non-available early/late hours collapse away (design shows ~09–18).
 *            Falls back to a sensible default when no availability is set.
 *
 * 2026-08-29 (팀장 보고: "집중모드일 때 일정이 잘려서 무슨 일정인지 안 보인다").
 * 집중 모드의 창은 **가용 시간**만 보고 정했었다. 그런데 화면에 실제로 그려지는
 * 것은 가용 시간 밖에도 얼마든지 있다 — 이른 아침 고정 일정, 가용 창 앞뒤로
 * 끌어다 놓은 블록, 가용 시간을 나중에 좁힌 뒤 남은 예전 배치. 그런 블록은
 * top이 음수로(또는 그리드 높이 너머로) 계산되고, 그리드가 overflow로 잘라내
 * 블록의 일부만 남는다 — 시간·제목이 잘려 나가 "무슨 일정인지 안 보이는" 바로
 * 그 상태다. 잘린 조각은 hover 카드도 안 뜬다(카드는 짧은 블록 기준이라
 * 잘림과 무관하다).
 *
 * 그래서 창을 "가용 시간 ∪ 이 주에 실제로 그려지는 것들"의 경계로 넓힌다.
 * 아무것도 잘리지 않는 것이 집중 모드가 시간대를 좁혀 주는 것보다 우선이다 —
 * 하루 전체를 보고 싶으면 24h 토글이 이미 있다.
 *
 * @param {'focus'|'24h'} mode
 * @param {Array<{weekday:string,startMinutes:number,endMinutes:number,isActive:boolean}>} availability
 * @param {Array<{startMinutes:number,endMinutes:number}>} [spans]
 *   이 주에 그려지는 블록·고정 일정의 분 단위 구간. 비면 예전과 동일하게 동작.
 * @returns {{ startMinutes:number, endMinutes:number }}
 */
export function visibleRange(mode, availability, spans) {
  if (mode === '24h') return { startMinutes: 0, endMinutes: MINUTES_PER_DAY }

  const active = (availability ?? []).filter((a) => a.isActive)
  // 뒤집힌 구간은 버린다. 자정에 끝나는 블록은 minutesOfDay가 0을 돌려주므로
  // end < start가 되고, 그대로 두면 창이 0시까지 끌려 내려간다 — 잘림을 막자고
  // 하루를 통째로 펼치는 것은 이 함수가 하려는 일이 아니다.
  const drawn = (spans ?? []).filter(
    (s) =>
      Number.isFinite(s?.startMinutes) &&
      Number.isFinite(s?.endMinutes) &&
      s.endMinutes > s.startMinutes,
  )

  let start
  let end
  if (active.length === 0 && drawn.length === 0) {
    // No availability configured yet → a reasonable working-day default.
    return { startMinutes: 8 * 60, endMinutes: 20 * 60 }
  }
  if (active.length === 0) {
    // 가용 시간은 없지만 그려질 것은 있다 — 그 구간이 곧 창이 된다.
    start = Math.min(...drawn.map((s) => s.startMinutes))
    end = Math.max(...drawn.map((s) => s.endMinutes))
  } else {
    start = Math.min(...active.map((a) => a.startMinutes))
    end = Math.max(...active.map((a) => a.endMinutes))
    for (const s of drawn) {
      if (s.startMinutes < start) start = s.startMinutes
      if (s.endMinutes > end) end = s.endMinutes
    }
  }

  // Pad by 30 min each side so edge blocks aren't flush against the frame, and
  // clamp to whole hours for a tidy ruler.
  const padStart = Math.max(0, Math.floor((start - 30) / 60) * 60)
  const padEnd = Math.min(MINUTES_PER_DAY, Math.ceil((end + 30) / 60) * 60)
  return { startMinutes: padStart, endMinutes: padEnd }
}

/** Total pixel height of the grid body for a visible range. */
export function rangeHeightPx(range) {
  return (range.endMinutes - range.startMinutes) * PX_PER_MIN
}

/** Whole-hour tick marks inside a visible range, for the left ruler + gridlines. */
export function hourTicks(range) {
  const first = Math.ceil(range.startMinutes / 60)
  const last = Math.floor(range.endMinutes / 60)
  const ticks = []
  for (let h = first; h <= last; h += 1) ticks.push(h)
  return ticks
}

/** Top/height px for a block given its minutes-of-day span and the visible range. */
export function blockRect(startMin, endMin, range) {
  const top = (startMin - range.startMinutes) * PX_PER_MIN
  const height = Math.max(PX_PER_MIN * 15, (endMin - startMin) * PX_PER_MIN) // >=15min tall
  return { top, height }
}

/** Convert a pixel offset from the grid top into minutes-of-day within the range. */
export function pxToMinutes(px, range) {
  return range.startMinutes + px / PX_PER_MIN
}

/**
 * The active availability window (minutes) for a given weekday column index,
 * Monday-first. Returns null when that day has no active availability.
 */
export function availabilityForColumn(columnIndex, availability) {
  const key = WEEKDAY_KEYS[columnIndex]
  const found = (availability ?? []).find((a) => a.weekday === key && a.isActive)
  return found ? { startMinutes: found.startMinutes, endMinutes: found.endMinutes } : null
}

/**
 * Resolve a pointer position (viewport coordinates) to a grid slot, or null when
 * the point is outside the grid body. Shared by the panel→grid placement-drag
 * preview and the empty-slot right-click (ST-F1-03 PLAN-06/07) so the drop
 * preview and the committed placement can never disagree about the slot.
 *
 * @param {{x:number,y:number}} point  viewport coordinates (clientX/clientY)
 * @param {DOMRect} rect  the grid body's bounding rect
 * @param {{startMinutes:number,endMinutes:number}} range
 * @returns {{dayIndex:number, startMin:number}|null}
 */
export function resolveGridSlot(point, rect, range) {
  if (!rect) return null
  if (
    point.x < rect.left ||
    point.x > rect.right ||
    point.y < rect.top ||
    point.y > rect.bottom
  ) {
    return null
  }
  const colWidth = rect.width / 7
  const dayIndex = Math.max(0, Math.min(6, Math.floor((point.x - rect.left) / colWidth)))
  const startMin = snapMinutes(pxToMinutes(point.y - rect.top, range))
  return { dayIndex, startMin }
}
