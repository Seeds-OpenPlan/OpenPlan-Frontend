/*
  Pure date/time helpers for the weekly calendar (ST-F1-02). No React, no I/O —
  just deterministic math so the grid, drag snapping, and week navigation all
  agree on a single definition of "a week", "day index", and "minutes of day".

  Conventions locked here:
  - A week starts on Monday (design PNGs show 월 first; user_profiles.week_start_day
    is honored via `weekStartsOn` where passed, default 1 = Monday).
  - Dates that identify a week or a day are ISO date strings 'YYYY-MM-DD' (matches
    weekly_plans.week_start_date). Block instants are ISO timestamps (start_at).
  - "minutes of day" = 0..1440, local time, the vertical axis unit.
*/

export const DAY_MS = 24 * 60 * 60 * 1000
export const MINUTES_PER_DAY = 24 * 60
export const SNAP_MINUTES = 5

// Monday-first short labels, index 0..6 = the 7 grid columns.
export const WEEKDAY_LABELS_KO = ['월', '화', '수', '목', '금', '토', '일']
// Weekend columns get a sunken tint (design): indices 5 (토) and 6 (일).
export const WEEKEND_COLUMN_INDICES = new Set([5, 6])

// Canonical weekday keys used by availability_patterns.weekday, aligned to the
// Monday-first column order so a column index maps straight to a pattern.
export const WEEKDAY_KEYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

/** Parse 'YYYY-MM-DD' as a LOCAL midnight Date (not UTC — avoids off-by-one). */
export function parseISODate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Format a Date as a local 'YYYY-MM-DD' string. */
export function formatISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Monday (or configured start) of the week containing `date`. */
export function weekStartOf(date, weekStartsOn = 1) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const offset = (d.getDay() - weekStartsOn + 7) % 7
  d.setDate(d.getDate() - offset)
  return d
}

/** The week-start ISO date for the week containing today. */
export function currentWeekStartISO(weekStartsOn = 1) {
  return formatISODate(weekStartOf(new Date(), weekStartsOn))
}

/** Add whole weeks to a week-start ISO date, returning a new ISO date. */
export function addWeeksISO(weekStartISO, delta) {
  const d = parseISODate(weekStartISO)
  d.setDate(d.getDate() + delta * 7)
  return formatISODate(d)
}

/** Add whole days to an ISO date. */
export function addDaysISO(dateISO, delta) {
  const d = parseISODate(dateISO)
  d.setDate(d.getDate() + delta)
  return formatISODate(d)
}

/** The 7 day ISO dates of a week, Monday-first. */
export function weekDays(weekStartISO) {
  return Array.from({ length: 7 }, (_, i) => addDaysISO(weekStartISO, i))
}

/**
 * "N월 M주차" label. Week 1 is the week that contains the 1st of the month, so a
 * week whose Monday is the 23rd of a month whose 1st falls on a Sunday reads as
 * the 5th week — matching the reference design ("3월 5주차"). Labeled by the
 * week-start's month when a week spans a month boundary.
 */
export function weekLabelKO(weekStartISO) {
  const start = parseISODate(weekStartISO)
  const month = start.getMonth()
  const firstOfMonth = new Date(start.getFullYear(), month, 1)
  // Monday-based offset of the 1st (Mon=0 .. Sun=6).
  const firstOffset = (firstOfMonth.getDay() + 6) % 7
  const weekOfMonth = Math.ceil((start.getDate() + firstOffset) / 7)
  return `${month + 1}월 ${weekOfMonth}주차`
}

/** Snap a minute value to the nearest 5-minute grid, clamped to [0, 1440]. */
export function snapMinutes(minutes, snap = SNAP_MINUTES) {
  const snapped = Math.round(minutes / snap) * snap
  return Math.max(0, Math.min(MINUTES_PER_DAY, snapped))
}

/** Minutes-of-day (local) for an ISO timestamp. */
export function minutesOfDay(iso) {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

/** The local ISO date ('YYYY-MM-DD') an ISO timestamp falls on. */
export function dateOf(iso) {
  return formatISODate(new Date(iso))
}

/**
 * Build an ISO timestamp from a day ISO date + minutes-of-day. Used when a drag
 * commits a new block position back to an absolute start_at/end_at.
 */
export function composeTimestamp(dayISO, minutes) {
  const d = parseISODate(dayISO)
  d.setMinutes(minutes)
  // `d` is built and mutated entirely in LOCAL time (parseISODate + setMinutes
  // above never touch UTC fields), but toISOString() always serializes to UTC
  // ('Z') regardless — there is no "local ISO" string format. That's fine here:
  // the string still encodes the same instant, and minutesOfDay/dateOf read it
  // back with `new Date(iso).getHours()/.getMinutes()`, which are local-time
  // accessors. As long as this round-trip runs in one consistent timezone (the
  // mock and grid both do, in the browser), the local wall-clock value we set
  // above comes back unchanged even though it passed through a UTC string.
  return d.toISOString()
}

/** "9:05" style short time from minutes-of-day. */
export function formatMinutesLabel(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

/** "6시간 40분" style duration from a minute count (0분 hidden when whole hours). */
export function formatDurationKO(totalMinutes) {
  const h = Math.floor(totalMinutes / 60)
  const m = Math.round(totalMinutes % 60)
  if (h && m) return `${h}시간 ${m}분`
  if (h) return `${h}시간`
  return `${m}분`
}

/** True when a week-start ISO date is strictly before this week (read-only, AC-5). */
export function isPastWeek(weekStartISO, weekStartsOn = 1) {
  return weekStartISO < currentWeekStartISO(weekStartsOn)
}
