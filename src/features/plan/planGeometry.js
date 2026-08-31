/*
  Geometry for the calendar grid: the single source that converts between minutes
  and pixels, and that decides which slice of the day is visible in each mode
  (PLAN-04). Keeping this pure and separate from components means the grid render,
  the block rects, and the drag hook can never disagree about the scale.
*/

import { MINUTES_PER_DAY, snapMinutes, WEEKDAY_KEYS } from './planTime'

/*
  1시간이 차지하는 세로 픽셀 — 즉 그리드의 세로 축척.

  2026-08-29: 처음엔 "화면이 작아 스크롤이 불편하다"는 지적에 75 → 50으로
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
 * 2026-08-29 보고: "집중모드일 때 일정이 잘려서 무슨 일정인지 안 보인다".
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

  /*
    창을 감싸는 정시 경계까지만 넓힌다 — 여유는 두지 않는다.

    2026-08-31 이전에는 앞뒤로 30분씩 붙인 뒤 정시로 반올림했다. 그러면 9–18시
    가용이 8–19시, 즉 **11시간**이 되어 위아래로 각각 한 시간씩 빈 띠가 생겼다.
    "가장자리 블록이 테두리에 딱 붙지 않게" 하려던 것인데, 축척이 화면 높이에
    맞춰지는 지금은(fitHourPx) 그 두 시간이 곧바로 나머지 시간대의 축척을
    깎는다 — 9시간이면 될 것을 11시간에 나눠 담으니 시간당 픽셀이 18% 작아지고,
    정작 보려던 일정이 그만큼 작아진다. 빈 띠를 위해 치를 값이 아니다.

    정시 클램프는 남긴다: 눈금은 정시에만 찍히므로(hourTicks) 경계가 정시여야
    첫·마지막 눈금이 창의 위아래 끝과 정확히 맞고, 블록 좌표도 정수 픽셀에
    떨어진다. 9:30–18:00 같은 가용이면 9:00–18:00으로만 넓어진다.

    ⚠ 이제 첫 눈금이 창 맨 위(top 0)에 앉으므로, 눈금 라벨을 선 위에 가운데
    정렬로 그리면 위쪽 절반이 잘린다. CalendarGrid의 눈금 렌더가 첫/마지막
    라벨만 안쪽으로 붙여 그리는 이유다 — 둘은 같이 움직여야 한다.
  */
  const padStart = Math.max(0, Math.floor(start / 60) * 60)
  const padEnd = Math.min(MINUTES_PER_DAY, Math.ceil(end / 60) * 60)
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

/*
  "맞춤" 축척 (2026-08-31 요구: "집중 모드일 때 가용시간 범위가 한 화면에
  바로 들어오도록").

  왜 새 단계 하나가 아니라 계산인가 — 한 화면에 들어오느냐는 두 값의 비(比)로만
  정해진다: 가시 범위가 몇 시간인가, 그리고 달력 본문에 실제로 몇 픽셀이
  주어졌는가. 둘 다 화면·주차·가용 설정에 따라 매번 다르므로 고정 단계표
  (HOUR_PX_STEPS)로는 원리상 맞출 수 없다 — 어떤 창에서 딱 맞는 값이 다른
  창에서는 넘치거나 남는다.

  그래도 결과는 **정수 px/시간**으로 내린다. HOUR_PX_STEPS가 정수만 담은 이유와
  똑같다 — 시간선 top이 `h*60*pxPerMin` 으로 계산되므로, 분당 픽셀이 60으로
  나누어떨어지지 않으면 눈금이 소수점에서 반올림돼 줄마다 1px씩 어긋난다.
  내림(floor)인 것도 의도다: 올림하면 딱 1~2px이 넘쳐 "거의 다 보이는데 스크롤바가
  생기는" 가장 짜증나는 상태가 된다.

  아래위 클램프의 근거:
  - MIN 28 — 24시간 모드처럼 아무리 줄여도 못 담는 범위에서 축척이 무한정
    작아지지 않게 막는 바닥. 이보다 작으면 1시간 블록이 28px 미만이 되어
    PlanBlock의 SHORT_BLOCK_PX(46) 한참 아래, 시각 라벨조차 안 들어간다.
    바닥에 닿으면 맞춤은 포기하고 스크롤로 넘긴다 — 그때 스크롤이 조금만
    남도록 최대한 좁혀 둔 상태가 된다.
  - MAX  — 단계표의 맨 윗값. 가용 창이 아주 좁은 주(예: 3시간)에 블록이
    화면을 가득 채우는 거대한 덩어리로 부풀지 않게 한다.
*/
export const FIT_HOUR_PX_MIN = 28
export const FIT_HOUR_PX_MAX = HOUR_PX_STEPS[HOUR_PX_STEPS.length - 1]

/**
 * 달력 본문에 주어진 픽셀 높이에 `range`가 통째로 들어가는 1시간당 픽셀.
 *
 * @param {number} bodyPx  요일 헤더를 뺀, 격자 본문이 쓸 수 있는 픽셀 높이
 * @param {{startMinutes:number,endMinutes:number}} range
 * @returns {number|null} 정수 px/시간. 아직 측정 전(bodyPx 미확정)이면 null.
 */
export function fitHourPx(bodyPx, range) {
  const hours = (range.endMinutes - range.startMinutes) / 60
  if (!Number.isFinite(bodyPx) || bodyPx <= 0 || !(hours > 0)) return null
  return Math.max(FIT_HOUR_PX_MIN, Math.min(FIT_HOUR_PX_MAX, Math.floor(bodyPx / hours)))
}
