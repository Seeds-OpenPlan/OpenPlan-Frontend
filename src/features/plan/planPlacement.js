/*
  Pure placement logic for the unplaced panel (ST-F1-03). No React, no I/O — the
  same free-slot search backs both the keyboard "quick place" on a task card and
  the DEV mock's auto-placer, so a manual place and an auto place agree on what a
  "free slot" is.
*/

import { availabilityForColumn } from './planGeometry'
import {
  dateOf,
  minutesOfDay,
  snapMinutes,
} from './planTime'

// Priority is an integer on the task (1 = highest). Always paired with this text
// label at the call site so priority is never conveyed by an icon/number alone
// (NFR-017). Unknown/blank priorities read as "보통".
export function priorityLabelKO(priority) {
  switch (priority) {
    case 1:
      return '높음'
    case 3:
      return '낮음'
    default:
      return '보통'
  }
}

// A comparator that orders unplaced tasks the way the auto-placer announces it:
// "우선순위·마감일 순" — priority ascending (1 first), then earlier due date.
export function byPriorityThenDue(a, b) {
  const pa = a.priority ?? 99
  const pb = b.priority ?? 99
  if (pa !== pb) return pa - pb
  const da = a.dueDate ?? '9999-12-31'
  const db = b.dueDate ?? '9999-12-31'
  return da < db ? -1 : da > db ? 1 : 0
}

// The inverse precedence, for RB-PLAN-04's 마감 우선안 (ST-F1-07): earliest due
// date wins first, ties broken by priority. Named separately from
// byPriorityThenDue rather than a shared sort with flipped args, so each
// comparator reads as exactly the ordering its own story announces.
export function byDueThenPriority(a, b) {
  const da = a.dueDate ?? '9999-12-31'
  const db = b.dueDate ?? '9999-12-31'
  if (da !== db) return da < db ? -1 : 1
  const pa = a.priority ?? 99
  const pb = b.priority ?? 99
  return pa - pb
}

/**
 * The earliest free slot that fits `durationMin`, scanning within each day's
 * active availability window and skipping minutes already covered by an
 * existing block. Returns { dayIndex, startMin } or null when no gap is large
 * enough anywhere in the week.
 *
 * The scan normally starts at Monday 00:00 (`fromDayIndex`/`fromMin` default to
 * 0), which is what quick-place/auto-place have always wanted. ST-F1-07's
 * MINIMAL_CHANGE replan wants something different — "move this block to the
 * NEXT gap", not "to the earliest gap anywhere in the week" — so both are
 * exposed as optional start-position params: only the FIRST day scanned honors
 * `fromMin`; every day after it (wrapping past Sunday back to Monday, as a
 * fallback so a late-week conflict can still find room even if the only free
 * slot is earlier in the week) gets its full window.
 *
 * @param {Object} opts
 * @param {string[]} opts.days               the 7 day ISO dates, Monday-first
 * @param {Array}    opts.availability        availability patterns
 * @param {Array<{startAt:string,endAt:string}>} opts.blocks  occupied spans
 * @param {number}   opts.durationMin
 * @param {number}   [opts.fromDayIndex=0]    first day index to scan
 * @param {number}   [opts.fromMin=0]         earliest minute-of-day on that first day
 */
export function findFirstFreeSlot({
  days,
  availability,
  blocks,
  durationMin,
  fromDayIndex = 0,
  fromMin = 0,
}) {
  for (let offset = 0; offset < 7; offset += 1) {
    const dayIndex = (fromDayIndex + offset) % 7
    const win = availabilityForColumn(dayIndex, availability)
    if (!win) continue

    const dayISO = days[dayIndex]
    // Spans occupying this day, clamped to the window and sorted by start.
    const occupied = (blocks ?? [])
      .filter((b) => dateOf(b.startAt) === dayISO)
      .map((b) => ({ start: minutesOfDay(b.startAt), end: minutesOfDay(b.endAt) }))
      .filter((s) => s.end > win.startMinutes && s.start < win.endMinutes)
      .sort((a, b) => a.start - b.start)

    // Only the first day scanned is clamped forward to `fromMin`; a later day
    // in the scan gets its whole window (nothing "before" it to skip).
    let cursor = offset === 0 ? Math.max(win.startMinutes, fromMin) : win.startMinutes
    for (const span of occupied) {
      if (span.start - cursor >= durationMin) {
        return { dayIndex, startMin: snapMinutes(cursor) }
      }
      cursor = Math.max(cursor, span.end)
    }
    if (win.endMinutes - cursor >= durationMin) {
      return { dayIndex, startMin: snapMinutes(cursor) }
    }
  }
  return null
}
