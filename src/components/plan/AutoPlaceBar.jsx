import { Button } from '../common/Button'

/*
  Top bar shown while an auto-placement DRAFT is on the grid (ST-F1-03 RB-PLAN-01,
  AC-2). The draft blocks render dashed with a "초안" mark; this bar is the only
  way to resolve them: [적용] commits the batch, [취소] discards it.

  The caption states the C-2 double protection in plain words: applying the draft
  still does not save the week — the weekly confirm (ST-F1-05) is separate. Counts
  are text (배치 N · 미배치 M), never color-only (NFR-017).
*/
export function AutoPlaceBar({ placedCount, unplacedCount, applying = false, onApply, onCancel }) {
  return (
    <div
      role="region"
      aria-label="자동 배치 초안"
      className="flex flex-col gap-2 rounded-card border border-dashed border-brand-300 bg-brand-50/60 p-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="text-label font-semibold text-brand-900">
          자동 배치 초안 · 배치 {placedCount}건{unplacedCount > 0 ? ` · 미배치 ${unplacedCount}건` : ''}
        </p>
        <p className="mt-0.5 text-caption text-text-muted">
          초안입니다. 적용해도 주간 계획은 아직 저장되지 않습니다.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={applying}>
          취소
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onApply}
          loading={applying}
          disabled={placedCount === 0}
        >
          적용
        </Button>
      </div>
    </div>
  )
}

export default AutoPlaceBar
