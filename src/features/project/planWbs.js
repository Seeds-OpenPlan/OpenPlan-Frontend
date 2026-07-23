/*
  Pure day-grid geometry for the WBS tab (ui-spec §PROJ.3, PROJ-13/14). Distinct
  from features/plan/planGeometry.js on purpose: that module works in MINUTES
  within a single day; this one works in whole DAYS across a multi-week span
  (AC-6 "5분 아님 — 일 단위 스냅"), so sharing one geometry module would mean
  every helper there taking a "which unit am I in" branch. No React, no I/O.
*/

import { addDaysISO, formatISODate, parseISODate, weekStartOf } from '../plan/planTime'

/** Whole-day difference (b − a), positive when b is later. */
export function diffDaysISO(aISO, bISO) {
  return Math.round((parseISODate(bISO) - parseISODate(aISO)) / (24 * 60 * 60 * 1000))
}

/**
 * The timeline's day span (§PROJ.3 레이아웃): from min(earliest planned start,
 * this week's Monday) to the project's due date + 7 days — a week of slack
 * past the deadline so a bar dragged past it is still visible, not clipped.
 * Falls back to a 3-week span from today when the project has no due date
 * (an edge case the spec doesn't cover explicitly).
 */
export function wbsDayRange(project, nodes) {
  const todayISO = formatISODate(new Date())
  const weekStartISO = formatISODate(weekStartOf(new Date()))
  const plannedStarts = (nodes ?? []).map((n) => n.plannedStartDate).filter(Boolean)
  const earliestStart = plannedStarts.length > 0 ? plannedStarts.sort()[0] : weekStartISO
  const startISO = earliestStart < weekStartISO ? earliestStart : weekStartISO
  const endISO = project.dueDate ? addDaysISO(project.dueDate, 7) : addDaysISO(todayISO, 21)

  const totalDays = Math.max(1, diffDaysISO(startISO, endISO) + 1)
  const days = Array.from({ length: totalDays }, (_, i) => addDaysISO(startISO, i))
  return { startISO, endISO, days }
}

/** Left/width in DAY units (multiply by the column's px width at render time). */
export function barRectDays(rangeStartISO, plannedStartDate, plannedEndDate) {
  const left = diffDaysISO(rangeStartISO, plannedStartDate)
  const width = Math.max(1, diffDaysISO(plannedStartDate, plannedEndDate) + 1)
  return { left, width }
}

/** Clamp a candidate (start, end) pair so start <= end always (a drag can
 * never invert the bar — §PROJ.3 "시작일 > 종료일이 되는 드래그는 UI에서 불가"). */
export function clampRange(startISO, endISO) {
  return startISO <= endISO ? [startISO, endISO] : [endISO, endISO]
}

export default { diffDaysISO, wbsDayRange, barRectDays, clampRange }
