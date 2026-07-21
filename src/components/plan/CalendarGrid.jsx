import { useEffect, useRef, useState } from 'react'
import { PlanBlock } from './PlanBlock'
import { usePlanDrag } from '../../features/plan/usePlanDrag'
import {
  availabilityForColumn,
  blockRect,
  hourTicks,
  PX_PER_MIN,
  pxToMinutes,
  rangeHeightPx,
} from '../../features/plan/planGeometry'
import {
  dateOf,
  formatISODate,
  formatMinutesLabel,
  minutesOfDay,
  parseISODate,
  snapMinutes,
  WEEKDAY_LABELS_KO,
  WEEKEND_COLUMN_INDICES,
} from '../../features/plan/planTime'

const BODY_MAX_HEIGHT = '62vh'

/* Column header: 요일 label + date, with today circled (design). */
function DayHeader({ dayISO, columnIndex, todayISO }) {
  const date = parseISODate(dayISO)
  const isToday = dayISO === todayISO
  const weekend = WEEKEND_COLUMN_INDICES.has(columnIndex)
  return (
    <div
      className={[
        'flex flex-col items-center gap-1 border-l border-border py-2 text-caption',
        weekend ? 'bg-surface-sunken' : '',
      ].join(' ')}
    >
      <span className={weekend ? 'text-text-muted' : 'text-text-muted'}>
        {WEEKDAY_LABELS_KO[columnIndex]}
      </span>
      <span
        className={[
          'flex h-6 w-6 items-center justify-center rounded-full text-label font-semibold',
          isToday ? 'bg-brand-600 text-white' : 'text-text',
        ].join(' ')}
      >
        {date.getDate()}
      </span>
    </div>
  )
}

/* Background column: weekend tint + availability band highlight. */
function BgColumn({ columnIndex, availWindow, range }) {
  const weekend = WEEKEND_COLUMN_INDICES.has(columnIndex)
  const band = availWindow
    ? blockRect(availWindow.startMinutes, availWindow.endMinutes, range)
    : null
  return (
    <div className={['relative border-l border-border', weekend ? 'bg-surface-sunken/60' : ''].join(' ')}>
      {band && (
        <div
          className="absolute inset-x-0 bg-brand-50/40"
          style={{ top: band.top, height: band.height }}
          aria-hidden="true"
        />
      )}
    </div>
  )
}

/*
  Availability-edge drag handle (PLAN-32) — rendered ONLY in 24h mode. Dragging
  the top/bottom edge of a day's availability band changes that day's start/end
  in 5-minute steps; release commits via PUT (onCommit). A live preview minute is
  reported through onPreview so the band tracks the drag before it commits.
*/
function AvailabilityHandle({ columnIndex, edge, minutes, gridRef, range, onPreview, onCommit }) {
  const onPointerDown = (e) => {
    e.stopPropagation()
    e.preventDefault()
    const compute = (clientY) => {
      const rect = gridRef.current.getBoundingClientRect()
      return snapMinutes(pxToMinutes(clientY - rect.top, range))
    }
    const move = (ev) => onPreview(columnIndex, edge, compute(ev.clientY))
    const up = (ev) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      onCommit(columnIndex, edge, compute(ev.clientY))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const top = (minutes - range.startMinutes) * PX_PER_MIN
  return (
    <button
      type="button"
      aria-label={`${WEEKDAY_LABELS_KO[columnIndex]} 가용 ${edge === 'start' ? '시작' : '종료'} ${formatMinutesLabel(minutes)}`}
      onPointerDown={onPointerDown}
      style={{ top: top - 6, left: `calc(${columnIndex} / 7 * 100%)`, width: `calc(100% / 7)`, touchAction: 'none' }}
      className="absolute z-20 flex h-3 items-center justify-center"
    >
      <span className="h-1 w-8 rounded-full bg-brand-600 ring-2 ring-surface" aria-hidden="true" />
    </button>
  )
}

/*
  The calendar body: 7 day columns × a time axis, with an absolutely-positioned
  block layer on top so a block can be dragged freely across columns (PLAN-19/20).
  usePlanDrag lives here because it needs the body's geometry. Keyboard nudging
  and drag both funnel into the single `onMoveCommit` the page provides.
*/
export function CalendarGrid({
  weekDays,
  range,
  mode,
  blocks,
  availability,
  readOnly,
  onMoveCommit,
  onOpenMenu,
  onAvailabilityCommit,
}) {
  const gridRef = useRef(null)
  const scrollRef = useRef(null)
  const todayISO = formatISODate(new Date())
  const [availPreview, setAvailPreview] = useState(null) // {columnIndex,edge,minutes}
  const [gridWidth, setGridWidth] = useState(0)

  // Track the body width so a dragged block can be positioned in pixels via a GPU
  // transform (see below) rather than animated top/left — the latter smears a
  // large box-shadow into afterimages on repaint.
  useEffect(() => {
    const el = gridRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver((entries) => {
      setGridWidth(entries[0].contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { dragState, onBlockPointerDown } = usePlanDrag({
    gridRef,
    range,
    onCommit: onMoveCommit,
    disabled: readOnly,
  })

  const height = rangeHeightPx(range)
  const ticks = hourTicks(range)

  // In 24h mode, start scrolled to ~8:00 so the working day is visible.
  useEffect(() => {
    if (mode === '24h' && scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, (8 * 60 - range.startMinutes) * PX_PER_MIN)
    }
  }, [mode, range.startMinutes])

  // Position each block; the one being dragged uses the live drag target.
  const positioned = blocks
    .map((block) => {
      let dayIndex = weekDays.indexOf(dateOf(block.startAt))
      let startMin = minutesOfDay(block.startAt)
      let endMin = minutesOfDay(block.endAt)
      const isDragged = dragState?.planBlockId === block.planBlockId
      if (isDragged) {
        dayIndex = dragState.dayIndex
        startMin = dragState.startMin
        endMin = dragState.endMin
      }
      return { block, dayIndex, startMin, endMin, isDragged }
    })
    .filter((p) => p.dayIndex >= 0)

  const previewFor = (columnIndex, edge, fallback) =>
    availPreview && availPreview.columnIndex === columnIndex && availPreview.edge === edge
      ? availPreview.minutes
      : fallback

  const makeNudge = (block, dayIndex, startMin, endMin) => (delta) => {
    const duration = endMin - startMin
    let day = dayIndex
    let boundary = null
    let start = startMin
    if (delta.dMin) start = snapMinutes(startMin + delta.dMin)
    if (delta.dDay) {
      const raw = dayIndex + delta.dDay
      if (raw < 0) boundary = 'prev'
      else if (raw > 6) boundary = 'next'
      day = Math.max(0, Math.min(6, raw))
    }
    onMoveCommit({ planBlockId: block.planBlockId, boundary, dayIndex: day, startMin: start, endMin: start + duration })
  }

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      {/* Horizontal scroll on narrow screens: header + body scroll together and
          keep a usable minimum column width (mobile shows a subset, §R). */}
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          {/* A SINGLE vertical scroll container holds the header and the body, so a
              vertical scrollbar narrows both by the same amount and the columns
              stay aligned (a scrollbar on the body alone would offset the header). */}
          <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: BODY_MAX_HEIGHT }}>
            {/* Sticky day-header row. */}
            <div className="sticky top-0 z-30 flex border-b border-border bg-surface">
              <div className="w-12 shrink-0" />
              <div className="grid flex-1 grid-cols-7">
                {weekDays.map((dayISO, i) => (
                  <DayHeader key={dayISO} dayISO={dayISO} columnIndex={i} todayISO={todayISO} />
                ))}
              </div>
            </div>

            {/* Body row: ruler + grid, sharing the container's scroll. */}
            <div className="flex">
              {/* Left hour ruler. */}
              <div className="relative w-12 shrink-0" style={{ height }}>
                {ticks.map((h) => (
                  <span
                    key={h}
                    className="absolute right-1 -translate-y-1/2 text-caption text-text-muted"
                    style={{ top: (h * 60 - range.startMinutes) * PX_PER_MIN }}
                  >
                    {String(h).padStart(2, '0')}
                  </span>
                ))}
              </div>

        {/* Grid body — drag reference element. */}
        <div ref={gridRef} className="relative flex-1" style={{ height }}>
          {/* Background columns (weekend tint + availability band). */}
          <div className="absolute inset-0 grid grid-cols-7">
            {weekDays.map((dayISO, i) => {
              const win = availabilityForColumn(i, availability)
              const shown = win
                ? {
                    startMinutes: previewFor(i, 'start', win.startMinutes),
                    endMinutes: previewFor(i, 'end', win.endMinutes),
                  }
                : null
              return <BgColumn key={dayISO} columnIndex={i} availWindow={shown} range={range} />
            })}
          </div>

          {/* Hour gridlines. */}
          {ticks.map((h) => (
            <div
              key={h}
              className="pointer-events-none absolute inset-x-0 border-t border-border/70"
              style={{ top: (h * 60 - range.startMinutes) * PX_PER_MIN }}
              aria-hidden="true"
            />
          ))}

          {/* Availability edge handles (24h mode only, editable weeks only). */}
          {mode === '24h' &&
            !readOnly &&
            weekDays.map((dayISO, i) => {
              const win = availabilityForColumn(i, availability)
              if (!win) return null
              return ['start', 'end'].map((edge) => (
                <AvailabilityHandle
                  key={`${dayISO}-${edge}`}
                  columnIndex={i}
                  edge={edge}
                  minutes={previewFor(i, edge, edge === 'start' ? win.startMinutes : win.endMinutes)}
                  gridRef={gridRef}
                  range={range}
                  onPreview={(c, e2, m) => setAvailPreview({ columnIndex: c, edge: e2, minutes: m })}
                  onCommit={(c, e2, m) => {
                    setAvailPreview(null)
                    onAvailabilityCommit(c, e2, m)
                  }}
                />
              ))
            })}

          {/* Block layer. A dragged block is positioned in pixels via a GPU
              transform (translate3d) instead of animated top/left, so its
              box-shadow is repainted on its own compositing layer and leaves no
              afterimage trail. Static blocks keep percentage left/top. */}
          {positioned.map(({ block, dayIndex, startMin, endMin, isDragged }) => {
            const rect = blockRect(startMin, endMin, range)
            const colW = gridWidth / 7
            const style =
              isDragged && colW > 0
                ? {
                    left: 0,
                    top: 0,
                    width: colW - 4,
                    height: rect.height,
                    transform: `translate3d(${dayIndex * colW + 2}px, ${rect.top}px, 0)`,
                    willChange: 'transform',
                  }
                : {
                    left: `calc(${dayIndex} / 7 * 100% + 2px)`,
                    width: `calc(100% / 7 - 4px)`,
                    top: rect.top,
                    height: rect.height,
                  }
            return (
              <PlanBlock
                key={block.planBlockId}
                block={block}
                startMin={startMin}
                endMin={endMin}
                dragging={isDragged}
                boundary={isDragged ? dragState.boundary : null}
                disabled={readOnly}
                style={style}
                onPointerDown={(e) => onBlockPointerDown(e, block, dayIndex, startMin)}
                onOpenMenu={(pos) => onOpenMenu(block, pos)}
                onNudge={makeNudge(block, dayIndex, startMin, endMin)}
              />
            )
          })}
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CalendarGrid
