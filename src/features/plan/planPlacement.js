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

/**
 * The earliest free slot in the week that fits `durationMin`, scanning Monday→
 * Sunday within each day's active availability window and skipping minutes already
 * covered by an existing block. Returns { dayIndex, startMin } or null when the
 * week has no gap large enough.
 *
 * @param {Object} opts
 * @param {string[]} opts.days               the 7 day ISO dates, Monday-first
 * @param {Array}    opts.availability        availability patterns
 * @param {Array<{startAt:string,endAt:string}>} opts.blocks  occupied spans
 * @param {number}   opts.durationMin
 */
export function findFirstFreeSlot({ days, availability, blocks, durationMin }) {
  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const win = availabilityForColumn(dayIndex, availability)
    if (!win) continue

    const dayISO = days[dayIndex]
    // Spans occupying this day, clamped to the window and sorted by start.
    const occupied = (blocks ?? [])
      .filter((b) => dateOf(b.startAt) === dayISO)
      .map((b) => ({ start: minutesOfDay(b.startAt), end: minutesOfDay(b.endAt) }))
      .filter((s) => s.end > win.startMinutes && s.start < win.endMinutes)
      .sort((a, b) => a.start - b.start)

    let cursor = win.startMinutes
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
