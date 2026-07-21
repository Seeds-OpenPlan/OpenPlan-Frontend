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
    <div className="flex items-center justify-between gap-3">
      <h1 className="hidden text-heading font-bold text-text md:block">주간 계획</h1>

      <div className="flex flex-1 items-center justify-end gap-3">
        {reviewCount > 0 && (
          <button
            type="button"
            onClick={onOpenReview}
            className="rounded-full px-3 py-1 text-label font-semibold text-warning-700 transition-colors hover:bg-warning-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            검토 {reviewCount}
          </button>
        )}

        {!readOnly && (
          <Button
            variant="primary"
            size="md"
            onClick={onSave}
            disabled={saveDisabled}
            disabledReason={saveDisabled ? saveDisabledReason : undefined}
          >
            저장
          </Button>
        )}
      </div>
    </div>
  )
}

export default PlanHeader
