import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatMinutesLabel } from '../../features/plan/planTime'
import { PX_PER_MIN } from '../../features/plan/planGeometry'
import { CheckCircleIcon } from '../common/statusIcons'

// Below this rendered height a block can't show its title legibly, so a
// hover/focus detail card supplements it (readability aid — the block's
// aria-label already carries the full title+time for screen readers).
const SHORT_BLOCK_PX = 46

/*
  A single plan block on the grid. It is the interaction surface for three inputs:
  - pointer drag  → move (PLAN-19) / week-boundary move (PLAN-20), started here,
                    computed by usePlanDrag in the parent.
  - context menu  → right-click (desktop) or the ⋯ affordance opens the action
                    menu (PLAN-09). Long-press is not used (it fights drag).
  - keyboard      → the block is focusable; Arrow keys nudge it (5-min / 1-day)
                    and Enter/Space opens the menu, so move is not pointer-only
                    (§A11Y keyboard map).

  Visual: TASK blocks use the brand tint, SCHEDULE blocks are a bordered surface
  card (design). Per-project block colors arrive with the projects surface
  (ST-F1-08); `block.tone` is carried but not yet mapped to a palette here.
*/

const TYPE_CLASSES = {
  TASK: 'bg-brand-50 border-brand-200 text-brand-900',
  SCHEDULE: 'bg-surface border-border text-text',
}

export function PlanBlock({
  block,
  style,
  startMin,
  endMin,
  dragging = false,
  boundary = null,
  disabled = false,
  dragActive = false,
  resizing = false,
  onPointerDown,
  onOpenMenu,
  onNudge,
  onResizeStart,
}) {
  const timeLabel = `${formatMinutesLabel(startMin)} - ${formatMinutesLabel(endMin)}`
  const typeClass = TYPE_CLASSES[block.blockType] ?? TYPE_CLASSES.TASK
  // Completed blocks read as done via a check + strikethrough + dimming, never by
  // color alone (PLAN-13 AC-2, NFR-017).
  const isDone = block.status === 'COMPLETED'

  // Detail card for short blocks: anchored to the block's on-screen rect and
  // rendered in a portal so the grid's overflow can't clip it.
  const [detail, setDetail] = useState(null) // { left, top } | null
  const isShort = (endMin - startMin) * PX_PER_MIN < SHORT_BLOCK_PX

  const openDetail = (e) => {
    // Never open while ANY drag is in progress — during a drag the browser holds
    // pointer capture and won't fire mouseleave, which would strand the card.
    if (!isShort || dragging || dragActive) return
    const r = e.currentTarget.getBoundingClientRect()
    setDetail({ left: r.left, top: r.bottom + 4 })
  }
  const closeDetail = () => setDetail(null)

  // Any pointerdown anywhere (notably a drag starting on another block) dismisses
  // the card. During a drag the browser holds pointer capture and won't fire
  // mouseleave, so without this a card opened just before the drag would linger
  // as a "ghost" once the drag ends. setState runs in the listener callback (not
  // the effect body), which the react-hooks rules permit.
  useEffect(() => {
    const clear = () => setDetail(null)
    window.addEventListener('pointerdown', clear)
    return () => window.removeEventListener('pointerdown', clear)
  }, [])

  const openMenuFromEvent = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    onOpenMenu?.({ x: e.clientX || rect.right, y: e.clientY || rect.top })
  }

  const handleKeyDown = (e) => {
    if (disabled) return
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        onNudge?.({ dMin: -5 })
        break
      case 'ArrowDown':
        e.preventDefault()
        onNudge?.({ dMin: 5 })
        break
      case 'ArrowLeft':
        e.preventDefault()
        onNudge?.({ dDay: -1 })
        break
      case 'ArrowRight':
        e.preventDefault()
        onNudge?.({ dDay: 1 })
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        openMenuFromEvent(e)
        break
      default:
        break
    }
  }

  return (
    <>
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={`${block.title}, ${timeLabel}${isDone ? ', 완료' : ''}${disabled ? ', 읽기 전용' : ''}`}
      aria-disabled={disabled || undefined}
      style={{ ...style, touchAction: 'none' }}
      onPointerDown={
        disabled
          ? undefined
          : (e) => {
              closeDetail()
              onPointerDown?.(e, block, startMin)
            }
      }
      onMouseEnter={openDetail}
      onMouseLeave={closeDetail}
      onFocus={openDetail}
      onBlur={closeDetail}
      onContextMenu={(e) => {
        e.preventDefault()
        // Keep a block right-click on the block: don't let it bubble to the grid
        // body's empty-slot placement menu (ST-F1-03 PLAN-07).
        e.stopPropagation()
        openMenuFromEvent(e)
      }}
      onKeyDown={handleKeyDown}
      className={[
        'absolute overflow-hidden rounded-control border p-1.5 text-caption',
        'select-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring',
        typeClass,
        isDone ? 'opacity-60' : '',
        disabled ? 'cursor-default' : 'cursor-grab',
        dragging ? 'z-30 cursor-grabbing opacity-90 shadow-modal ring-2 ring-focus-ring' : 'z-10 shadow-card',
        resizing ? 'ring-2 ring-focus-ring' : '',
      ].join(' ')}
    >
      {/* A2 resize handles (top/bottom edge). Pointer-only; keyboard users edit
          time via the task/schedule form. onResizeStart stops propagation so it
          never starts a block MOVE. Group-hover reveals a subtle grip. */}
      {onResizeStart && !disabled && !dragging && (
        <>
          <span
            aria-hidden="true"
            onPointerDown={(e) => onResizeStart('start', e)}
            style={{ touchAction: 'none' }}
            className="group/resize absolute inset-x-0 top-0 z-20 flex h-2 cursor-ns-resize items-start justify-center"
          >
            <span className="mt-px h-0.5 w-6 rounded-full bg-current opacity-0 transition-opacity group-hover/resize:opacity-40" />
          </span>
          <span
            aria-hidden="true"
            onPointerDown={(e) => onResizeStart('end', e)}
            style={{ touchAction: 'none' }}
            className="group/resize absolute inset-x-0 bottom-0 z-20 flex h-2 cursor-ns-resize items-end justify-center"
          >
            <span className="mb-px h-0.5 w-6 rounded-full bg-current opacity-0 transition-opacity group-hover/resize:opacity-40" />
          </span>
        </>
      )}
      <span className="block leading-tight text-[0.65rem] opacity-80">{timeLabel}</span>
      <span className="mt-0.5 flex items-start gap-1 font-medium leading-tight">
        {isDone && <CheckCircleIcon className="mt-px shrink-0 text-success-600" size={12} />}
        <span className={`line-clamp-3 ${isDone ? 'line-through' : ''}`}>{block.title}</span>
      </span>

      {dragging && boundary && (
        <span className="absolute inset-x-1 bottom-1 rounded bg-brand-600 px-1 py-0.5 text-center text-[0.6rem] font-semibold text-white">
          {boundary === 'prev' ? '이전 주차로 이동' : '다음 주차로 이동'}
        </span>
      )}
    </div>
    {detail && !dragActive &&
      createPortal(
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[70] max-w-56 rounded-card border border-border bg-surface p-2 shadow-popover"
          style={{ left: Math.min(detail.left, window.innerWidth - 240), top: detail.top }}
        >
          <p className="text-caption text-text-muted">{timeLabel}</p>
          <p className="mt-0.5 text-label font-medium leading-snug text-text">{block.title}</p>
        </div>,
        document.body,
      )}
    </>
  )
}

export default PlanBlock
