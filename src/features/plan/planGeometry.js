/*
  Geometry for the calendar grid: the single source that converts between minutes
  and pixels, and that decides which slice of the day is visible in each mode
  (PLAN-04). Keeping this pure and separate from components means the grid render,
  the block rects, and the drag hook can never disagree about the scale.
*/

import { MINUTES_PER_DAY, snapMinutes, WEEKDAY_KEYS } from './planTime'

// One hour of vertical space. Blocks and the hour ruler both derive from this.
export const HOUR_PX = 56
export const PX_PER_MIN = HOUR_PX / 60

/**
 * Visible time band for the current mode.
 * - '24h'  : the whole day (0..1440) with availability drawn as boundary lines.
 * - 'focus': clamp to the bounding window of active availability across the week
 *            so non-available early/late hours collapse away (design shows ~09–18).
 *            Falls back to a sensible default when no availability is set.
 *
 * @param {'focus'|'24h'} mode
 * @param {Array<{weekday:string,startMinutes:number,endMinutes:number,isActive:boolean}>} availability
 * @returns {{ startMinutes:number, endMinutes:number }}
 */
export function visibleRange(mode, availability) {
  if (mode === '24h') return { startMinutes: 0, endMinutes: MINUTES_PER_DAY }

  const active = (availability ?? []).filter((a) => a.isActive)
  if (active.length === 0) {
    // No availability configured yet → a reasonable working-day default.
    return { startMinutes: 8 * 60, endMinutes: 20 * 60 }
  }
  const start = Math.min(...active.map((a) => a.startMinutes))
  const end = Math.max(...active.map((a) => a.endMinutes))
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
