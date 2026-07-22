import { formatMinutesLabel } from '../../features/plan/planTime'

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
  onPointerDown,
  onOpenMenu,
  onNudge,
}) {
  const timeLabel = `${formatMinutesLabel(startMin)} - ${formatMinutesLabel(endMin)}`
  const typeClass = TYPE_CLASSES[block.blockType] ?? TYPE_CLASSES.TASK

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
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={`${block.title}, ${timeLabel}${disabled ? ', 읽기 전용' : ''}`}
      aria-disabled={disabled || undefined}
      style={{ ...style, touchAction: 'none' }}
      onPointerDown={disabled ? undefined : (e) => onPointerDown?.(e, block, startMin)}
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
        disabled ? 'cursor-default' : 'cursor-grab',
        dragging ? 'z-30 cursor-grabbing opacity-90 shadow-modal ring-2 ring-focus-ring' : 'z-10 shadow-card',
      ].join(' ')}
    >
      <span className="block leading-tight text-[0.65rem] opacity-80">{timeLabel}</span>
      <span className="mt-0.5 block font-medium leading-tight line-clamp-3">{block.title}</span>

      {dragging && boundary && (
        <span className="absolute inset-x-1 bottom-1 rounded bg-brand-600 px-1 py-0.5 text-center text-[0.6rem] font-semibold text-white">
          {boundary === 'prev' ? '이전 주차로 이동' : '다음 주차로 이동'}
        </span>
      )}
    </div>
  )
}

export default PlanBlock
