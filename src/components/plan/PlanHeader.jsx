import { Button } from '../common/Button'
import { Badge } from '../common/Badge'

/*
  Page header for the weekly plan: title on the left, review entry + save on the
  right (matches both PNGs).

  It owns two ST-F1-05 surfaces:
  - Layer 2 of the validation display: the 차단/경고 counts (PLAN-21). They are two
    SEPARATE badges, not one total, because the two numbers mean different things
    — 차단 decides whether saving is possible at all, 경고 only asks for a
    confirmation. Both are announced politely when they change, so a keyboard or
    screen-reader user notices a violation appearing after a drag without going
    hunting for it.
  - The save gate (PLAN-28): whether the button is usable, and — always as
    adjacent text, never a hover-only tooltip — WHY it isn't.

  Disabled-reason priority is offline → 차단 → 미검증. Offline wins because it is a
  capability the user cannot recover by editing the plan: telling someone to
  resolve 차단 3건 while no request can leave the device would send them down a
  path that still ends in a disabled button. 차단 outranks 미검증 because it is the
  concrete, actionable one — "검증 중" resolves by itself, a violation does not.

  `validationStale` is the "we don't currently know" input: the counts shown may
  be the last known ones, but they were not computed for the plan as it stands
  right now (first load, mid-edit, or a failed check). The badges keep showing
  what we last knew; only the SAVE button treats not-knowing as not-safe.
*/
export function PlanHeader({
  blockingCount = 0,
  warningCount = 0,
  // The counts shown were not computed for the current block set → cannot save.
  validationStale = false,
  // The last dry-run didn't answer; the counts shown are the previous result.
  validationDelayed = false,
  onOpenReview,
  onSave,
  saving = false,
  canWrite = true,
  offlineReason,
  readOnly,
}) {
  const hasIssues = blockingCount > 0 || warningCount > 0
  const blockedBySaveGate = blockingCount > 0
  const saveDisabled = !canWrite || blockedBySaveGate || validationStale
  const saveDisabledReason = !canWrite
    ? offlineReason
    : blockedBySaveGate
      ? `차단 ${blockingCount}건 해결 필요`
      : validationStale
        ? // Distinguish "still checking" from "couldn't check": the first clears
          // itself in under a second, the second may not, and a user staring at a
          // disabled button deserves to know which one they are waiting on.
          validationDelayed
          ? '검증 결과를 확인하지 못했습니다'
          : '검증 중입니다'
        : undefined

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
            {/* aria-live sits on the wrapper, not the button, so the counts are
                announced when they change without re-announcing the whole
                control. `aria-atomic` keeps 차단 and 경고 in one utterance. */}
            <div aria-live="polite" aria-atomic="true" className="flex items-center gap-2">
              {validationDelayed && (
                <span className="whitespace-nowrap text-caption text-text-muted">검증 지연</span>
              )}
              {hasIssues && (
                <button
                  type="button"
                  onClick={onOpenReview}
                  aria-label={`검토 열기, 차단 ${blockingCount}건 경고 ${warningCount}건`}
                  className="flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  <span className="text-label font-semibold text-text-muted">검토</span>
                  {blockingCount > 0 && <Badge tone="danger" label={`차단 ${blockingCount}`} />}
                  {warningCount > 0 && <Badge tone="warning" label={`경고 ${warningCount}`} />}
                </button>
              )}
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={onSave}
              loading={saving}
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
