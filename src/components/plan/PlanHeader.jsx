import { useId } from 'react'
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

  The review entry point is ALWAYS visible (product decision after a live
  walkthrough: hiding it whenever there were zero issues meant the empty-review
  state in ReviewPanel.jsx was unreachable from here). What changes with the
  count is its content, not its presence: zero issues shows the "검토" label,
  one or more issues swaps the label for the badges — the badges already say
  "there is something to review," repeating the word there would be noise.

  Disabled-reason priority for the SAVE button's VISIBLE text is offline only.
  Offline is the one case that is a capability the user cannot recover by
  editing the plan, so it alone earns a permanent caption next to a disabled
  button. 차단 and "still validating" are deliberately NOT repeated there:
  - 차단's reason is already the badge sitting right next to Save, so restating
    it in text under the button would be pure duplication for sighted users.
    It is NOT dropped for screen-reader users, though — they cannot perceive
    the badge's color or position, so the same sentence survives as sr-only
    text wired to the button via aria-describedby.
  - "검증 중" / "검증 지연" both describe the same thing (the counts on screen
    cannot be trusted yet) and both now live in the badge slot as a small gray
    caption to its left — never both at once (see the render below). Moving
    them out from under Save is what makes the button immune to whichever
    validation state is running: nothing there appears or disappears mid-drag,
    so there is no layout shift on every debounce tick.

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
  // Offline is the only reason still rendered as visible text under Save — see
  // the intro comment for why 차단 and "still validating" no longer are.
  const saveDisabledReason = !canWrite ? offlineReason : undefined
  // Ties the sr-only 차단 restatement (rendered below, only when needed) to the
  // Save button, so a screen-reader user gets the reason without seeing it.
  const blockedReasonId = useId()

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
            {/* aria-live sits on the wrapper, not the button, so the status
                caption and the counts are announced together when either
                changes, without re-announcing the whole control. `aria-atomic`
                keeps them in one utterance. */}
            <div aria-live="polite" aria-atomic="true" className="flex items-center gap-2">
              {/* Mutually exclusive by construction: `stale` is already true
                  whenever `delayed` is (see usePlanValidation's `stale`
                  formula), so checking delayed first and stale second can
                  never show both captions at once in this one slot. */}
              {validationDelayed ? (
                <span className="whitespace-nowrap text-caption text-text-muted">검증 지연</span>
              ) : (
                validationStale && (
                  <span className="whitespace-nowrap text-caption text-text-muted">검증 중</span>
                )
              )}
              {/* Always rendered (not gated on hasIssues) so the empty-review
                  state is reachable. Content, not presence, tracks the count. */}
              <button
                type="button"
                onClick={onOpenReview}
                aria-label={
                  hasIssues
                    ? `검토 열기, 차단 ${blockingCount}건 경고 ${warningCount}건`
                    : '검토 열기'
                }
                className="flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                {hasIssues ? (
                  <>
                    {blockingCount > 0 && <Badge tone="danger" label={`차단 ${blockingCount}`} />}
                    {warningCount > 0 && <Badge tone="warning" label={`경고 ${warningCount}`} />}
                  </>
                ) : (
                  <span className="text-label font-semibold text-text-muted">검토</span>
                )}
              </button>
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={onSave}
              loading={saving}
              disabled={saveDisabled}
              disabledReason={saveDisabled ? saveDisabledReason : undefined}
              aria-describedby={blockedBySaveGate ? blockedReasonId : undefined}
            >
              저장
            </Button>
            {/* Screen-reader-only restatement of the 차단 badge's meaning: a
                sighted user reads it off the badge's color and label, but
                neither reaches a screen reader on its own. */}
            {blockedBySaveGate && (
              <span id={blockedReasonId} className="sr-only">
                {`차단 ${blockingCount}건 해결 필요`}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default PlanHeader
