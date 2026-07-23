import { useRef, useState } from 'react'
import { Dialog } from '../common/Dialog'
import { BottomSheet } from '../common/BottomSheet'
import { Button } from '../common/Button'
import { ErrorState } from '../common/ErrorState'
import { useIsDesktop } from '../../hooks/useMediaQuery'

/*
  OVL-PROJ-CREATE (ui-spec §PROJ.4, PROJ-02). Same Dialog/BottomSheet-by-
  breakpoint shell ScheduleForm already establishes for this codebase's other
  create/edit overlays. Mounted CONDITIONALLY by the page (fresh per open), so
  its local state doesn't need a reset effect.
*/

const FIELD =
  'w-full rounded-control border border-border bg-surface px-3 py-2 text-label text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring'
const TITLE_ID = 'project-create-title'

export function ProjectCreateForm({ onClose, onSubmit, submitting = false, submitError, onRetry }) {
  const isDesktop = useIsDesktop()
  const nameRef = useRef(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')

  const trimmedName = name.trim()
  const isPastDue = dueDate && dueDate < new Date().toISOString().slice(0, 10)

  const submit = (e) => {
    e.preventDefault()
    if (!trimmedName || submitting) return
    onSubmit({ name: trimmedName, description: description.trim(), dueDate: dueDate || null })
  }

  const body = (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h2 id={TITLE_ID} className="text-title font-semibold text-text">
        새 프로젝트
      </h2>

      <label className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">이름 *</span>
        <input
          ref={nameRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="프로젝트 이름"
          className={FIELD}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">설명</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className={`${FIELD} resize-none`}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">마감일</span>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className={FIELD}
        />
        {/* Past dates are allowed (server policy unconfirmed — §PROJ.4 [가정]);
            this is an informational caption only, never a blocking error. */}
        {isPastDue && (
          <span className="text-caption text-text-muted">마감일이 이미 지났습니다</span>
        )}
      </label>

      {submitError && (
        <ErrorState variant="inline" onAction={onRetry} />
      )}

      {/* Button's own `disabledReason` stacks the reason BELOW the button
          (see Button.jsx's disabled+reason branch) — fine for a single lone
          action, but here it made the "만들기" button two lines tall next to
          a one-line "취소", visibly knocking the row out of alignment (owner
          review C-1/C-2). The fix: render the reason as its own row item, to
          the LEFT of an always-present, always-just-two-buttons row — the
          buttons never move regardless of whether the message shows. */}
      <div className="mt-1 flex items-center justify-between gap-2">
        <span role="alert" className="text-caption text-danger-700">
          {!trimmedName && '이름을 입력해 주세요'}
        </span>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" variant="primary" size="md" loading={submitting} disabled={!trimmedName}>
            만들기
          </Button>
        </div>
      </div>
    </form>
  )

  if (isDesktop) {
    return (
      <Dialog open onClose={onClose} labelledById={TITLE_ID} initialFocusRef={nameRef} size="lg">
        {body}
      </Dialog>
    )
  }
  return (
    <BottomSheet open onClose={onClose} labelledById={TITLE_ID} initialFocusRef={nameRef}>
      {body}
    </BottomSheet>
  )
}

export default ProjectCreateForm
