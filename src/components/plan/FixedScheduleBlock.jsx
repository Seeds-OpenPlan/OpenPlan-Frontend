import { formatMinutesLabel } from '../../features/plan/planTime'
import { LockIcon } from '../common/statusIcons'

/*
  A recurring fixed schedule (ST-F1-06 — PLAN-33/34), positioned by the caller
  from its weekday + start/end minutes rather than a specific day. Deliberately a
  SEPARATE component from PlanBlock, not a PlanBlock variant: a fixed schedule is
  "고정적이고 반복되어 다른 일을 할 수 없는 일정" (ONB-05) — it never drags, resizes,
  or deletes here (그 편집은 ST-F1-12 소관), so this component simply has no
  onPointerDown/onResizeStart to wire up, rather than a disabled one PlanBlock
  would need extra branches to suppress. Its only affordance is the block-action
  menu (이번 주만 비활성화 / 다시 활성화), opened the same way PlanBlock's is
  (right-click / long-press-as-contextmenu / Enter·Space) so a screen-reader or
  keyboard user finds it in the expected place.

  Visually it uses the neutral scale (bg-neutral-100/border-neutral-400), never
  the brand tint (TASK) or the plain white bordered card (SCHEDULE) — the "고정"
  chip + lock glyph reinforce that it is a different KIND of thing, not just a
  differently-colored block, so it can't be right-clicked expecting an edit/
  delete menu that isn't there.
*/

// A week exception (activeThisWeek=false) reads as a GHOST: translucent + a
// dashed border (never color alone — the "이번 주 제외" chip below carries the
// actual meaning, per NFR-017).
const GHOST_CLASS = 'border-dashed opacity-55'

export function FixedScheduleBlock({ schedule, style, disabled = false, onOpenMenu }) {
  const timeLabel = `${formatMinutesLabel(schedule.startMinutes)} - ${formatMinutesLabel(schedule.endMinutes)}`
  const inactive = schedule.activeThisWeek === false

  const openMenuFromEvent = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    onOpenMenu?.({ x: e.clientX || rect.right, y: e.clientY || rect.top })
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={`${schedule.title}, ${timeLabel}, 고정 일정${inactive ? ', 이번 주 제외' : ''}${disabled ? ', 읽기 전용' : ''}`}
      aria-disabled={disabled || undefined}
      style={style}
      onContextMenu={(e) => {
        e.preventDefault()
        // Same reasoning as PlanBlock: keep this on the block, not the grid's
        // empty-slot placement menu (ST-F1-03 PLAN-07) underneath it.
        e.stopPropagation()
        if (disabled) return
        openMenuFromEvent(e)
      }}
      onKeyDown={(e) => {
        if (disabled) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openMenuFromEvent(e)
        }
      }}
      className={[
        'absolute z-[5] overflow-hidden rounded-control border border-neutral-400 bg-neutral-100 p-1.5 text-caption text-neutral-700',
        'select-none cursor-default focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring',
        inactive ? GHOST_CLASS : '',
      ].join(' ')}
    >
      <span className="flex items-center gap-1 leading-tight text-[0.65rem] opacity-80">
        <LockIcon size={10} />
        <span className="truncate">{timeLabel}</span>
      </span>
      <span className="mt-0.5 font-medium leading-tight">
        <span className="line-clamp-2">{schedule.title}</span>
      </span>
      {inactive && (
        <span className="mt-1 inline-flex items-center rounded-chip bg-neutral-300 px-1.5 py-px text-[0.6rem] font-bold text-neutral-700">
          이번 주 제외
        </span>
      )}
    </div>
  )
}

export default FixedScheduleBlock
