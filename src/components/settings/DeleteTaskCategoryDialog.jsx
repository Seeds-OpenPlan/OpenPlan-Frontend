import { useRef } from 'react'
import { Dialog } from '../common/Dialog'
import { Button } from '../common/Button'
import { ErrorState } from '../common/ErrorState'

/*
  카테고리 삭제 확인 (W3, SC-01). Same shell convention as
  DeleteTaskDialog/DeleteProjectDialog: centered Dialog on every breakpoint,
  cancel gets initial focus (NFR-008), danger variant for the destructive
  button.

  THE ONE THING THIS DIALOG MUST SAY (team-lead instruction, verbatim): a hard
  delete here does NOT delete any task that used this category — the real
  server's FK is `ON DELETE SET NULL`, so every such task simply falls back to
  "없음". Without stating this explicitly, a user who has tasks filed under a
  category would reasonably assume deleting the PRESET also deletes THEIR
  TASKS, and avoid ever cleaning up an unused/renamed-in-spirit category —
  the worst outcome a confirm dialog for a harmless operation can produce.
*/
export function DeleteTaskCategoryDialog({ category, open, onClose, onConfirm, submitting = false, submitError }) {
  const titleId = 'task-category-delete-title'
  const cancelRef = useRef(null)

  return (
    <Dialog open={open} onClose={onClose} labelledById={titleId} initialFocusRef={cancelRef} size="sm">
      <div className="flex flex-col gap-4">
        <h2 id={titleId} className="text-title font-semibold text-text">
          '{category?.name}' 카테고리 삭제
        </h2>
        <p className="text-body text-text-muted">
          이 카테고리를 쓰던 태스크는 삭제되지 않습니다 — 카테고리만 '없음'으로 바뀝니다. 삭제 후에는 되돌릴 수 없습니다.
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

export default DeleteTaskCategoryDialog
