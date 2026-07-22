import { ChevronLeftIcon, ChevronRightIcon } from './planIcons'
import { weekLabelKO } from '../../features/plan/planTime'

/*
  Week navigator (PLAN-02): ‹ N월 M주차 › centered above the grid. Prev/next are
  real buttons (keyboard + SR reachable) with explicit labels; the visible month
  label is the primary text so the icons are decorative only.
*/
export function WeekNav({ weekStartISO, isCurrentWeek = false, onPrev, onNext, onToday }) {
  return (
    <div className="relative flex items-center justify-center gap-2">
      <button
        type="button"
        onClick={onPrev}
        aria-label="이전 주"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-text-muted transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <ChevronLeftIcon className="text-base" />
      </button>

      <h2 className="min-w-[7rem] text-center text-title font-bold text-text" aria-live="polite">
        {weekLabelKO(weekStartISO)}
      </h2>

      <button
        type="button"
        onClick={onNext}
        aria-label="다음 주"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-text-muted transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <ChevronRightIcon className="text-base" />
      </button>

      {/* Quick jump to the current week — only shown when viewing another week
          (redundant on the current one). Tucked into the row's right-side space. */}
      {!isCurrentWeek && (
        <button
          type="button"
          onClick={onToday}
          className="absolute right-0 rounded-full border border-border px-2.5 py-1 text-caption font-medium text-text-muted transition-colors hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          이번 주
        </button>
      )}
    </div>
  )
}

export default WeekNav
