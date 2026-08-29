/*
  Geometry for the calendar grid: the single source that converts between minutes
  and pixels, and that decides which slice of the day is visible in each mode
  (PLAN-04). Keeping this pure and separate from components means the grid render,
  the block rects, and the drag hook can never disagree about the scale.
*/

import { MINUTES_PER_DAY, snapMinutes, WEEKDAY_KEYS } from './planTime'

/*
  1시간이 차지하는 세로 픽셀 — 즉 그리드의 세로 축척.

  2026-08-29 (팀장): 처음엔 "화면이 작아 스크롤이 불편하다"는 지적에 75 → 50으로
  낮췄는데, 이어서 "사용자가 직접 조절해서 한눈에 보이는 일정 량을 조절하고
  싶다"는 요청이 왔다. 그래서 이 값은 더 이상 고정 상수가 아니라 **사용자
  설정값**이다 — 달력 박스 높이는 그대로 두고 축척만 바꾸므로, 촘촘히 하면 같은
  칸에 더 많은 시간이 들어오고 넉넉히 하면 블록 글씨가 커진다. 페이지 전체
  스크롤은 영향받지 않는다.

  연속 실수가 아니라 **고정 단계 표**를 쓴다(WbsTimeline의 ZOOM_STEPS와 같은
  이유): 모든 단계가 정수 픽셀이라 시간선이 소수점으로 어긋나지 않고, +/− 버튼이
  양 끝에서 자연스럽게 비활성화된다.

  단계 값의 근거 — 이 축척은 블록 안 글씨 높이와 직접 맞물린다. 1시간 블록의
  실제 높이가 그대로 이 값이고, PlanBlock은 46px(SHORT_BLOCK_PX) 아래를 "제목을
  못 읽는 블록"으로 보아 hover 카드에 의존한다. 그래서:
    30·40 — 1시간 블록도 카드에 의존한다. 하루 전체를 훑는 용도의 "촘촘히".
    50    — 1시간 블록이 제 제목을 직접 보여 주는 첫 단계. 기본값.
    65·80 — 읽기 편한 쪽. 30분 블록도 제목을 직접 보여 주기 시작한다.

  Every other geometry helper here (rangeHeightPx, blockRect, pxToMinutes) and
  every consumer (CalendarGrid's scroll-offset math, usePlanDrag's px→min drag
  delta) derives from the scale it is HANDED, not from a module constant — that
  is what keeps the grid render, the block rects, and the drag hook from ever
  disagreeing about it (see this file's own header).
*/
export const HOUR_PX_STEPS = [30, 40, 50, 65, 80]
export const DEFAULT_HOUR_PX_INDEX = 2

/** 범위를 벗어난(또는 저장돼 있다 표가 바뀐) 단계 인덱스를 표 안으로 되돌린다. */
export function clampHourPxIndex(index) {
  if (!Number.isInteger(index)) return DEFAULT_HOUR_PX_INDEX
  return Math.max(0, Math.min(HOUR_PX_STEPS.length - 1, index))
}

/** 단계 인덱스 → 분당 픽셀. 지오메트리 헬퍼들이 받는 값이 바로 이것이다. */
export function pxPerMinAt(index) {
  return HOUR_PX_STEPS[clampHourPxIndex(index)] / 60
}

// 기본 축척. 아래 헬퍼들의 기본 인자이자, 축척을 조절하지 않는 화면
// (TaskEditPreview의 작은 미리보기)이 그대로 쓰는 값이다.
export const HOUR_PX = HOUR_PX_STEPS[DEFAULT_HOUR_PX_INDEX]
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

/*
  아래 네 헬퍼는 축척(`pxPerMin`)을 **인자로** 받는다. 기본값은 기본 축척이라
  축척을 조절하지 않는 호출부(TaskEditPreview)는 손댈 필요가 없고, 주간 그리드는
  사용자가 고른 축척을 넘겨 준다. 한 화면 안에서 이 넷에 서로 다른 축척을 넘기면
  블록 위치·드래그 좌표·눈금이 어긋나므로, 호출부는 반드시 같은 값을 쓴다
  (CalendarGrid는 `pxPerMin` prop 하나를, WeeklyPage는 같은 값을 grid와
  hit-test 양쪽에 넘긴다).
*/

/** Total pixel height of the grid body for a visible range. */
export function rangeHeightPx(range, pxPerMin = PX_PER_MIN) {
  return (range.endMinutes - range.startMinutes) * pxPerMin
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
export function blockRect(startMin, endMin, range, pxPerMin = PX_PER_MIN) {
  const top = (startMin - range.startMinutes) * pxPerMin
  const height = Math.max(pxPerMin * 15, (endMin - startMin) * pxPerMin) // >=15min tall
  return { top, height }
}

/** Convert a pixel offset from the grid top into minutes-of-day within the range. */
export function pxToMinutes(px, range, pxPerMin = PX_PER_MIN) {
  return range.startMinutes + px / pxPerMin
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
 * @param {number} [pxPerMin]  현재 축척. 그리드가 그릴 때 쓴 값과 반드시 같아야
 *   한다 — 다르면 드롭 미리보기와 실제로 커밋되는 시각이 어긋난다.
 * @returns {{dayIndex:number, startMin:number}|null}
 */
export function resolveGridSlot(point, rect, range, pxPerMin = PX_PER_MIN) {
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
  const startMin = snapMinutes(pxToMinutes(point.y - rect.top, range, pxPerMin))
  return { dayIndex, startMin }
}
