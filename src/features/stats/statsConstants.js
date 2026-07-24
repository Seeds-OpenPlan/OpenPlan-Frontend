/*
  Shared enums for the 통계 screen (ST-F1-11). Kept in one file so the period
  toggle (AC-1), the time-band aggregation (AC-3), and the deviation grouping
  toggle (AC-2) all read from the same source instead of each screen/component
  re-declaring its own copy of "what a period/band/group IS".
*/

// AC-1 기간 토글. `value` is the wire param sent as `?period=`; `label` is the
// exact button text from the Desktop.Status.png reference (정본) — order matters,
// it is also the toggle's left-to-right button order.
export const STATS_PERIODS = [
  { value: 'week', label: '이번 주' },
  { value: 'month', label: '이번 달' },
  { value: 'last3months', label: '최근 3개월' },
  { value: 'all', label: '전체' },
]
export const DEFAULT_STATS_PERIOD = 'week'

// AC-2 편차 토글 (프로젝트별/카테고리별).
export const DEVIATION_GROUP_BYS = [
  { value: 'project', label: '프로젝트별' },
  { value: 'category', label: '카테고리별' },
]
export const DEFAULT_DEVIATION_GROUP_BY = 'project'

// AC-3 4구간 (RB-STAT-03 원문 정의: 새벽 00~05:59 · 오전 06~11:59 · 오후
// 12~17:59 · 야간 18~23:59). `hours` lists every hour-of-day that folds into the
// band — statsApi.js's time-patterns aggregator sums each band's hours from the
// raw per-hour payload, so THIS array is the one place the hour→band split
// lives; changing the boundary is a one-line edit here.
export const TIME_BANDS = [
  { key: 'dawn', label: '새벽', hours: [0, 1, 2, 3, 4, 5] },
  { key: 'morning', label: '오전', hours: [6, 7, 8, 9, 10, 11] },
  { key: 'afternoon', label: '오후', hours: [12, 13, 14, 15, 16, 17] },
  { key: 'night', label: '야간', hours: [18, 19, 20, 21, 22, 23] },
]
