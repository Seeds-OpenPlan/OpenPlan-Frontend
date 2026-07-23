import { useId, useRef } from 'react'
import { Dialog } from '../common/Dialog'
import { BottomSheet } from '../common/BottomSheet'
import { Button } from '../common/Button'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import { violationCopy } from '../../features/plan/violationMessages'

/*
  Confirmation for saving a plan that still has 경고 (PLAN-28 · AC-3). 차단 never
  reaches this dialog — those disable the save button outright — so the question
  here is genuinely a judgement call, and the dialog's job is to make the
  consequence explicit: saving CONFIRMS the week and clears the undo stack, so
  "저장 후에는 되돌릴 수 없습니다" is not a scare line, it is the literal behavior.

  [취소] takes initial focus (PTN-UNSAVED's rule: the safe choice is the default),
  and Esc closes via the shared Dialog/BottomSheet Esc policy.

  Up to three warnings are listed by name so the user isn't asked to confirm an
  abstraction; the rest are summarized as a count rather than making a modal
  scroll.
*/
const PREVIEW_LIMIT = 3

function ConfirmBody({ titleId, cancelRef, warningCount, warnings, saving, onConfirm, onCancel }) {
  const preview = warnings.slice(0, PREVIEW_LIMIT)
  // The count comes from the gate, not from this list: the two can differ for a
  // moment right after a week loads (counts arrive with the week, the detailed
  // issues only with the dry-run), and the headline must match the gate.
  const remaining = Math.max(0, warningCount - preview.length)

  return (
    <div className="flex flex-col gap-4">
      <h2 id={titleId} className="text-title font-bold text-text">
        경고 {warningCount}건이 남아 있습니다
      </h2>

      <div className="flex flex-col gap-2">
        <p className="text-body leading-snug text-text">
          경고가 남아 있어도 주간 계획을 저장할 수 있습니다. 저장 후에는 되돌릴 수 없습니다.
        </p>
        {preview.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-card bg-surface-sunken px-3 py-2">
            {preview.map((issue) => {
              const copy = violationCopy(issue)
              return (
                <li key={issue.id} className="text-label leading-snug text-text-muted">
                  {copy.label} · {copy.text}
                </li>
              )
            })}
            {remaining > 0 && (
              <li className="text-caption text-text-muted">외 {remaining}건</li>
            )}
          </ul>
        )}
      </div>

      <div className="flex justify-end gap-2">
        {/* React 19 passes `ref` to a function component as an ordinary prop, and
            Button spreads its rest props onto the native <button> — so this is a
            real DOM ref, which is what the focus trap needs to open on 취소. */}
        {/* Disabled while the PUT is in flight: cancelling only closed the
            dialog, it never aborted the mutation, so a click here used to read
            as "저장 안 함" and then save anyway. */}
        <Button
          ref={cancelRef}
          variant="secondary"
          size="md"
          disabled={saving}
          onClick={onCancel}
        >
          취소
        </Button>
        <Button variant="primary" size="md" loading={saving} onClick={onConfirm}>
          저장
        </Button>
      </div>
    </div>
  )
}

export function SaveConfirmDialog({
  open,
  warningCount = 0,
  warnings = [],
  saving = false,
  onConfirm,
  onCancel,
}) {
  const isDesktop = useIsDesktop()
  const titleId = useId()
  const cancelRef = useRef(null)

  if (!open) return null

  const body = (
    <ConfirmBody
      titleId={titleId}
      cancelRef={cancelRef}
      warningCount={warningCount}
      warnings={warnings}
      saving={saving}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )

  if (isDesktop) {
    return (
      <Dialog
        open={open}
        onClose={onCancel}
        labelledById={titleId}
        initialFocusRef={cancelRef}
        size="sm"
      >
        {body}
      </Dialog>
    )
  }
  return (
    <BottomSheet open={open} onClose={onCancel} labelledById={titleId} initialFocusRef={cancelRef}>
      {body}
    </BottomSheet>
  )
}

export default SaveConfirmDialog
