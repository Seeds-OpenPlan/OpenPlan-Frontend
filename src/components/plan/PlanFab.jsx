import { PlusIcon } from './planIcons'

/*
  "미배치 N" floating button, bottom-right of the grid. This story renders the
  count only; opening the unplaced-task panel is ST-F1-03 (PLAN-05), so onClick
  is a seam. The count carries a text label beside the numeric badge so it is not
  a color-only signal.
*/
export function PlanFab({ count = 0, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 text-label font-semibold text-text shadow-popover transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      <PlusIcon className="text-base text-danger-600" />
      <span>미배치</span>
      <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-danger-600 px-1.5 text-caption font-bold text-white">
        {count}
      </span>
    </button>
  )
}

export default PlanFab
