import { Button } from '../common/Button'

/*
  Page header for the weekly plan: title on the left, review entry + save on the
  right (matches both PNGs). This story owns the save button's undo-stack reset
  side of PLAN-03 (AC-4); the validation-gated confirm flow and the review panel
  it opens are ST-F1-05, so `onOpenReview` is a seam and `reviewCount` is consumed
  as-is here.

  Save is disabled offline (reason shown as adjacent text, never hover-only) and
  on read-only past weeks.
*/
export function PlanHeader({
  reviewCount = 0,
  onOpenReview,
  onSave,
  saveDisabled,
  saveDisabledReason,
  readOnly,
}) {
  return (
    // The title stays in normal flow so its vertical position is identical
    // whether or not the action buttons render (a past/read-only week has no save
    // button). The controls are absolutely positioned and vertically centered on
    // the title line, so the button height never pushes the title down — this-week
    // and past-week headers line up exactly.
    <div className="relative min-h-8 md:min-h-0">
      {/* Same classes as every other page title (text-2xl font-bold) so the
          vertical position matches exactly — no line-height mismatch. */}
      <h1 className="hidden text-2xl font-bold text-text md:block">주간 계획</h1>

      <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-3">
        {/* Read-only weeks show a compact notice here (in the header row) instead
            of a full-width banner above the grid — so it adds no vertical height,
            avoiding the page scroll (and the scrollbar-driven left/right shift)
            it caused before. The past week has no save button, so this slot is
            free. */}
        {readOnly ? (
          <span className="whitespace-nowrap rounded-full bg-surface-sunken px-3 py-1 text-caption font-medium text-text-muted">
            지난 주간 계획 · 기록·완료만 가능
          </span>
        ) : (
          <>
            {reviewCount > 0 && (
              <button
                type="button"
                onClick={onOpenReview}
                className="rounded-full px-3 py-1 text-label font-semibold text-warning-700 transition-colors hover:bg-warning-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                검토 {reviewCount}
              </button>
            )}

            <Button
              variant="primary"
              size="sm"
              onClick={onSave}
              disabled={saveDisabled}
              disabledReason={saveDisabled ? saveDisabledReason : undefined}
            >
              저장
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

export default PlanHeader
