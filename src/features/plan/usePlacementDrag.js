/*
  Cross-container pointer drag for placing a task from the unplaced panel onto the
  grid (ST-F1-03 PLAN-06). Native Pointer Events only, matching usePlanDrag's
  philosophy (no DnD library): a task card starts a drag, a ghost follows the
  cursor, and on release the drop point is handed to the page, which hit-tests it
  against the grid geometry (planGeometry.resolveGridSlot).

  The hook owns only the transient drag (task + live pointer). It never touches
  the query cache; the page commits the placement on drop. `onDrop` is read
  through a ref so a drag that started earlier still calls the latest handler
  without re-binding the window listeners mid-drag.
*/

import { useCallback, useEffect, useRef, useState } from 'react'

const DRAG_THRESHOLD_PX = 4

/**
 * @param {Object} opts
 * @param {(point:{x:number,y:number})=>({dayIndex:number,startMin:number}|null)} opts.resolveSlot
 *        Hit-tests the live pointer to a grid slot. Called inside pointer-event
 *        handlers (never during render), so it may read the grid ref. The result
 *        rides in the drag state so the grid renders the preview without touching
 *        a ref itself (react-hooks/refs).
 * @param {(task:object, slot:({dayIndex:number,startMin:number}|null))=>void} opts.onDrop
 *        Called on release once the drag has actually moved. `slot` is the drop
 *        target (null for an off-grid release, which the page ignores).
 */
export function usePlacementDrag({ resolveSlot, onDrop }) {
  // { task, point:{x,y}, slot, active } | null. `active` gates a drag vs. a click.
  const [drag, setDrag] = useState(null)

  // Read latest callbacks through refs so a drag started earlier still uses the
  // current geometry/handler without re-binding the window listeners mid-drag.
  const resolveRef = useRef(resolveSlot)
  const onDropRef = useRef(onDrop)
  useEffect(() => {
    resolveRef.current = resolveSlot
    onDropRef.current = onDrop
  }, [resolveSlot, onDrop])

  const begin = useCallback((task, e) => {
    // Left button / primary pointer only.
    if (e.button != null && e.button !== 0) return
    e.preventDefault()
    const start = { x: e.clientX, y: e.clientY }
    setDrag({ task, point: start, slot: null, active: false })

    const move = (ev) => {
      const point = { x: ev.clientX, y: ev.clientY }
      const moved = Math.abs(ev.clientX - start.x) + Math.abs(ev.clientY - start.y)
      const slot = resolveRef.current ? resolveRef.current(point) : null
      setDrag((d) =>
        d ? { ...d, point, slot, active: d.active || moved >= DRAG_THRESHOLD_PX } : d,
      )
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
    const up = (ev) => {
      cleanup()
      const slot = resolveRef.current ? resolveRef.current({ x: ev.clientX, y: ev.clientY }) : null
      setDrag((d) => {
        // Only a moved drag is a drop; a pure click leaves the task in the panel.
        if (d && d.active) onDropRef.current(d.task, slot)
        return null
      })
    }
    const cancel = () => {
      cleanup()
      setDrag(null)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }, [])

  // The page shows the in-grid drop preview only for an active (moved) drag.
  return { drag: drag?.active ? drag : null, begin }
}

export default usePlacementDrag
