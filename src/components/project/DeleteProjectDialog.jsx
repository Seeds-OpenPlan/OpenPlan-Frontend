import { useRef } from 'react'
import { Dialog } from '../common/Dialog'
import { Button } from '../common/Button'
import { ErrorState } from '../common/ErrorState'

/*
  Delete confirmation (ui-spec §PROJ.7, PROJ-09, AC-3). Deliberately a centered
  Dialog on EVERY breakpoint — no BottomSheet variant, matching PTN-UNSAVED's
  own precedent for a fixed two-choice confirm with no scrollable content.

  The block count in "연결된 태스크 {n}개와 주간 계획 블록 {m}개" is NOT shown:
  no endpoint in the 07 spec returns a delete-preview block count (§PROJ.7's
  own [가정] anticipates exactly this gap), so this renders the documented
  fallback wording instead of inventing a number. The TASK count, by contrast,
  IS real — it's the project's own already-fetched `taskCount`.

  CORRECTION: an earlier version of this file claimed `Button` couldn't take a
  ref because it isn't `forwardRef`'d — wrong. This codebase runs React 19,
  where `ref` arrives as an ordinary prop even for plain function components;
  `Button` doesn't destructure it by name, so it rides along in `...props` and
  lands on the real `<button>` via the spread (see SaveConfirmDialog.jsx's own
  comment, which explains this correctly). `initialFocusRef` below really does
  focus 취소 on open (NFR-008), not by DOM-order luck.
*/
export function DeleteProjectDialog({ project, open, onClose, onConfirm, submitting = false, submitError }) {
  const titleId = 'project-delete-title'
  const cancelRef = useRef(null)

  return (
    <Dialog open={open} onClose={onClose} labelledById={titleId} initialFocusRef={cancelRef} size="sm">
      <div className="flex flex-col gap-4">
        <h2 id={titleId} className="text-title font-semibold text-text">
          '{project?.name}' 프로젝트 삭제
        </h2>
        <p className="text-body text-text-muted">
          {project?.taskCount > 0
            ? `연결된 태스크 ${project.taskCount}개와 주간 계획에 배치된 블록이 함께 삭제됩니다. 삭제 후에는 되돌릴 수 없습니다.`
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

export default DeleteProjectDialog
