import { formatDurationKO } from '../../features/plan/planTime'
import { priorityLabelKO } from '../../features/plan/planPlacement'

/*
  One unplaced task in the panel (ST-F1-03). It is the placement surface:
  - pointer drag → drag onto a grid slot (PLAN-06), started here via onPointerDown
    and resolved by usePlacementDrag + the page.
  - keyboard     → the card is focusable; Enter/Space "quick-places" it into the
    first free slot (onQuickPlace), so placement is not pointer-only (§A11Y).

  `reason` (present only on auto-place leftovers, AC-3) renders as an informational
  line, not an error — the task simply didn't fit, with the why spelled out.
  Priority/estimate/due are text, never color-only (NFR-017).
*/
export function UnplacedTaskCard({ task, onPointerDown, onQuickPlace, disabled = false }) {
  const meta = [
    `예상 ${formatDurationKO(task.estimatedMinutes)}`,
    `우선순위 ${priorityLabelKO(task.priority)}`,
    task.dueDate ? `마감 ${task.dueDate}` : null,
  ].filter(Boolean)

  const handleKeyDown = (e) => {
    if (disabled) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onQuickPlace?.(task)
    }
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={`${task.title}, ${meta.join(', ')}${disabled ? '' : ' — 드래그하거나 Enter로 배치'}`}
      aria-disabled={disabled || undefined}
      onPointerDown={disabled ? undefined : (e) => onPointerDown?.(task, e)}
      onKeyDown={handleKeyDown}
      style={{ touchAction: 'none' }}
      className={[
        'select-none rounded-card border border-border bg-surface p-3 text-left shadow-card transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
        disabled ? 'cursor-default opacity-70' : 'cursor-grab hover:bg-surface-sunken active:cursor-grabbing',
      ].join(' ')}
    >
      <p className="text-label font-medium leading-tight text-text line-clamp-2">{task.title}</p>
      {task.projectName && (
        <p className="mt-0.5 text-caption text-text-muted">{task.projectName}</p>
      )}
      <p className="mt-1.5 text-caption text-text-muted">{meta.join(' · ')}</p>
      {task.reason && (
        <p className="mt-2 rounded-control bg-surface-sunken px-2 py-1 text-caption text-text-muted">
          {task.reason}
        </p>
      )}
    </div>
  )
}

export default UnplacedTaskCard
