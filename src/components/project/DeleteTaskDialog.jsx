import { useRef } from 'react'
import { Dialog } from '../common/Dialog'
import { Button } from '../common/Button'
import { ErrorState } from '../common/ErrorState'

/*
  Task delete confirmation (G-1, owner review 2026-07-24) — same shell as
  DeleteProjectDialog (§PROJ.7): centered Dialog on every breakpoint, cancel
  gets initial focus (NFR-008), danger variant for the destructive action.

  A placed task (§PROJ.0.2 "배치됨") still shows up in the weekly plan as a
  block, but this screen has no `planBlockId` to reach that block with (see
  G-2's own report to the lead — the project task list and the plan
  feature's block store aren't linked at all yet), so this can't state
  "and its weekly-plan block will also be removed" as a FACT the way
  DeleteProjectDialog's cascade line does. It only surfaces what's actually
  known: whether the task is currently placed, as a caution — not a promise
  about what else gets deleted.
*/
export function DeleteTaskDialog({ task, open, onClose, onConfirm, submitting = false, submitError }) {
  const titleId = 'task-delete-title'
  const cancelRef = useRef(null)

  return (
    <Dialog open={open} onClose={onClose} labelledById={titleId} initialFocusRef={cancelRef} size="sm">
      <div className="flex flex-col gap-4">
        <h2 id={titleId} className="text-title font-semibold text-text">
          '{task?.title}' 태스크 삭제
        </h2>
        <p className="text-body text-text-muted">
          {task?.status === 'IN_PROGRESS'
            ? '이 태스크는 현재 주간 계획에 배치되어 있습니다. 삭제 후에는 되돌릴 수 없습니다.'
            : '삭제 후에는 되돌릴 수 없습니다.'}
        </p>
        {submitError && <ErrorState variant="inline" onAction={onConfirm} />}
        <div className="flex justify-end gap-2">
          <Button ref={cancelRef} variant="secondary" size="md" onClick={onClose}>
            취소
          </Button>
          <Button variant="danger" size="md" loading={submitting} onClick={onConfirm}>
            삭제
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

export default DeleteTaskDialog
