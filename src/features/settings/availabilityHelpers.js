/*
  Pure helpers shared by the 설정 hub's 가용시간 row badge and the 가용시간 설정
  detail screen itself (FIX-01~03) — kept in ONE place so the two never
  disagree about what "the current pattern" means for a 7-row availability
  array. No React, no I/O (mirrors planTime.js's own "pure helpers" shape).
*/
import { formatMinutesLabel } from '../plan/planTime'

/**
 * The "기본 패턴" a settings screen edits as ONE pair of start/end fields —
 * the most common (startMinutes,endMinutes) pair among the ACTIVE days. Ties
 * break toward the FIRST active day in weekday order (Mon-first), so the
 * result is deterministic across re-renders of the same data.
 */
export function commonPattern(patterns) {
  const active = (patterns ?? []).filter((p) => p.isActive)
  if (active.length === 0) return null
  const counts = new Map()
  for (const p of active) {
    const key = `${p.startMinutes}-${p.endMinutes}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  let bestKey = null
  let bestCount = -1
  for (const p of active) {
    const key = `${p.startMinutes}-${p.endMinutes}`
    const count = counts.get(key)
    if (count > bestCount) {
      bestCount = count
      bestKey = key
    }
  }
  const [startMinutes, endMinutes] = bestKey.split('-').map(Number)
  return { startMinutes, endMinutes }
}

/** "09:00-18:00" style badge, or null when every day is off. */
export function commonPatternLabel(patterns) {
  const pattern = commonPattern(patterns)
  if (!pattern) return null
  return `${formatMinutesLabel(pattern.startMinutes)}-${formatMinutesLabel(pattern.endMinutes)}`
}

/**
 * Sum of active days' (end-start) minutes — "가용 시간 범위 합계" (참고용 총량,
 * 오너 결정 2026-07-25). NOT "가용 시간" — that name is now reserved for the
 * user's own independent weekly-capacity input (settingsApi.getWeeklyAvailableMinutes),
 * which this function has no part in computing. Renamed from the earlier
 * `weeklyTotalMinutes` (그 이름 자체가 이 값을 "가용 시간"인 것처럼 읽히게 했다 —
 * 오너 지적의 핵심).
 */
export function rangeSumMinutes(patterns) {
  return (patterns ?? [])
    .filter((p) => p.isActive)
    .reduce((sum, p) => sum + Math.max(0, p.endMinutes - p.startMinutes), 0)
}
