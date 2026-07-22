/*
  Pointer-drag engine for plan blocks (PLAN-19 move, PLAN-20 week-boundary).

  Native Pointer Events only — no DnD library. A block is dragged by a delta from
  where it was grabbed; the vertical delta becomes a 5-minute-snapped time change
  and the horizontal delta becomes a whole-day column change. Dragging past the
  first/last column marks a week-boundary move instead of clamping.

  The listeners for a drag are created inside pointerdown and removed on release,
  so their identities always match (no leaked/duplicate listeners even though
  dragState re-renders mid-drag). Current range/onCommit are read through refs so
  a drag commits with up-to-date values without re-binding. The hook owns only
  transient drag state (ghost + tooltip); it never touches the query cache — the
  page performs the optimistic move + history record on commit.
*/

import { useCallback, useEffect, useRef, useState } from 'react'
import { PX_PER_MIN } from './planGeometry'
import { MINUTES_PER_DAY, snapMinutes } from './planTime'

const DRAG_THRESHOLD_PX = 4

/**
 * @param {Object} opts
 * @param {React.RefObject<HTMLElement>} opts.gridRef  grid BODY element (7 cols, excludes ruler)
 * @param {{startMinutes:number,endMinutes:number}} opts.range
 * @param {(target:{planBlockId:string,boundary:('prev'|'next'|null),dayIndex:number,startMin:number,endMin:number})=>void} opts.onCommit
 * @param {boolean} [opts.disabled]
 */
export function usePlanDrag({ gridRef, onCommit, onDropOutside, disabled }) {
  const [dragState, setDragState] = useState(null)

  // Commit through a ref so a drag that started earlier still calls the latest
  // handler without re-binding the window listeners mid-drag. Drag math is
  // delta-based from the block's grabbed position, so the visible range is not
  // needed here.
  const onCommitRef = useRef(onCommit)
  const onDropOutsideRef = useRef(onDropOutside)
  useEffect(() => {
    onCommitRef.current = onCommit
    onDropOutsideRef.current = onDropOutside
  }, [onCommit, onDropOutside])

  const onBlockPointerDown = useCallback(
    (e, block, dayIndex, startMin) => {
      // Left button only; a read-only (past) week disables dragging entirely.
      if (disabled || e.button !== 0) return

      const duration = (new Date(block.endAt) - new Date(block.startAt)) / 60000
      const s = {
        planBlockId: block.planBlockId,
        clientX0: e.clientX,
        clientY0: e.clientY,
        dayIndex0: dayIndex,
        startMin0: startMin,
        duration,
        active: false,
      }

      const compute = (clientX, clientY) => {
        const rect = gridRef.current.getBoundingClientRect()
        const colWidth = rect.width / 7

        const dMin = (clientY - s.clientY0) / PX_PER_MIN
        let start = snapMinutes(s.startMin0 + dMin)
        start = Math.min(start, MINUTES_PER_DAY - s.duration)
        start = Math.max(0, start)

        const dCol = Math.round((clientX - s.clientX0) / colWidth)
        const rawDay = s.dayIndex0 + dCol
        let boundary = null
        if (rawDay < 0) boundary = 'prev'
        else if (rawDay > 6) boundary = 'next'
        const day = Math.max(0, Math.min(6, rawDay))

        return {
          planBlockId: s.planBlockId,
          boundary,
          dayIndex: day,
          startMin: start,
          endMin: start + s.duration,
        }
      }

      const cleanup = () => {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
        window.removeEventListener('pointercancel', handleCancel)
      }
      const handleMove = (ev) => {
        if (!s.active) {
          const moved =
            Math.abs(ev.clientX - s.clientX0) + Math.abs(ev.clientY - s.clientY0)
          if (moved < DRAG_THRESHOLD_PX) return
          s.active = true
        }
        setDragState(compute(ev.clientX, ev.clientY))
      }
      const handleUp = (ev) => {
        cleanup()
        // Commit FIRST (applies the optimistic cache move synchronously), THEN
        // clear the ghost — both land in the same React batch, so the block never
        // renders for a frame at its old cache position before the move applies.
        if (s.active) {
          // A drop over the unplaced panel unplaces instead of moving (A3). The
          // page hit-tests the point and returns true when it consumed the drop.
          const point = { x: ev.clientX, y: ev.clientY }
          const consumed = onDropOutsideRef.current?.(s.planBlockId, point)
          if (!consumed) onCommitRef.current(compute(ev.clientX, ev.clientY))
        }
        setDragState(null)
      }
      const handleCancel = () => {
        cleanup()
        setDragState(null)
      }

      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
      window.addEventListener('pointercancel', handleCancel)
    },
    [disabled, gridRef],
  )

  return { dragState, onBlockPointerDown }
}

export default usePlanDrag
