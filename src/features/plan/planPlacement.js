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
  minutesOfDayEnd,
  snapMinutes,
} from './planTime'

/*
  PRIORITY IS A THREE-STEP SCALE — 1=높음 · 2=보통 · 3=낮음 (BE 확인, 2026-07-29:
  4나 5를 보내면 400). Every FORM in this codebase already offers exactly those
  three, so the risk isn't user input — it's ECHOED input: the project 정보 PUT
  re-sends the CURRENT `priority` the form never shows (ProjectsPage), 프로젝트
  복제 copies each source task's priority verbatim, and 일정 편집 prefills from
  the block the server sent. Any out-of-range number the server (or older data)
  hands us would ride straight back out on those paths and 400.

  So it is folded into range at the READ boundary — every adapter that turns a
  server payload into the shape the UI holds runs it through here — which makes
  every echo path safe by construction rather than by remembering to guard each
  write. Out-of-range folds to the NEAREST valid step (a legacy 4/5 is "even
  lower than 낮음", so 3) rather than to the default, which would silently
  promote it to 보통. Blank/absent falls back to `fallback` (보통 for records
  that must carry one; callers that legitimately hold "unknown" pass null).
*/
export function clampPriority(value, fallback = 2) {
  if (value == null || value === '') return fallback
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.min(3, Math.max(1, n))
}

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
    // `end` MUST fold a midnight-ending block back to 1440 (minutesOfDayEnd,
    // not plain minutesOfDay) — otherwise it reads as 0, the very next
    // `.filter` line drops the whole span as "ending before the window even
    // starts", and the scan below treats a slot that is actually occupied
    // until end-of-day as free, double-booking it.
    const occupied = (blocks ?? [])
      .filter((b) => dateOf(b.startAt) === dayISO)
      .map((b) => ({ start: minutesOfDay(b.startAt), end: minutesOfDayEnd(b.endAt, dayISO) }))
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
