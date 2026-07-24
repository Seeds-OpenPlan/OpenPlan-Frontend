import { useRef, useState } from 'react'
import { Dialog } from '../common/Dialog'
import { BottomSheet } from '../common/BottomSheet'
import { Button } from '../common/Button'
import { ErrorState } from '../common/ErrorState'
import { MinuteStepper } from '../plan/MinuteStepper'
import { priorityLabelKO } from '../../features/plan/planPlacement'
import { useIsDesktop } from '../../hooks/useMediaQuery'

/*
  OVL-TASK-CREATE (ui-spec §PROJ.8, PROJ-17). 예상시간 prefill = 60분: the
  spec's own preferred source is `user_preferences`'s default (ST-F1-12,
  which doesn't exist yet) — same 60-minute fallback ST-F1-09's own AC-1 uses
  for the identical gap, so this doesn't invent a NEW fallback number.

  G-1 (owner review 2026-07-24, superseded 2026-07-24 by ST-F1-09): this
  modal used to also double as the task EDIT form (an optional `task` prop
  switching copy/prefill) while SCR-TASK-EDIT didn't exist yet. ST-F1-09 has
  since built that dedicated page (`/tasks/:taskId/edit`, TaskEditPage) — it
  needs a full page (AC-2 suggestion chip, AC-3 mini-week preview) a modal has
  no room for — so TaskRow.jsx's own 편집 action now navigates there instead
  of opening this form. The `task` prop / edit-mode branch below is kept
  as-is (harmless, still correct if ever reused) rather than stripped, since
  removing a working code path isn't this story's job; ProjectWorkspacePage
  no longer passes `task`, so in practice this component is create-only again.
*/

const FIELD =
  'w-full rounded-control border border-border bg-surface px-3 py-2 text-label text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring'
const TITLE_ID = 'task-create-title'
const PRIORITIES = [1, 2, 3] // 높음·보통·낮음 (priorityLabelKO)

export function TaskCreateForm({ task, onClose, onSubmit, submitting = false, submitError, onRetry }) {
  const isDesktop = useIsDesktop()
  const titleRef = useRef(null)
  const isEdit = Boolean(task)

  const [title, setTitle] = useState(task?.title ?? '')
  const [estimatedMinutes, setEstimatedMinutes] = useState(task?.estimatedMinutes ?? 60)
  const [priority, setPriority] = useState(task?.priority ?? 2)
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '')
  const [memo, setMemo] = useState(task?.memo ?? '')

  const trimmedTitle = title.trim()

  const submit = (e) => {
    e.preventDefault()
    if (!trimmedTitle || submitting) return
    onSubmit({
      title: trimmedTitle,
      estimatedMinutes,
      priority,
      dueDate: dueDate || null,
      memo: memo.trim(),
    })
  }

  const body = (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h2 id={TITLE_ID} className="text-title font-semibold text-text">
        {isEdit ? '태스크 수정' : '태스크 추가'}
      </h2>

      <label className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">제목 *</span>
        <input
          ref={titleRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={FIELD}
        />
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">예상시간 *</span>
        <MinuteStepper value={estimatedMinutes} onChange={setEstimatedMinutes} label="예상시간" />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-caption font-medium text-text-muted">우선순위</legend>
        <div className="flex flex-wrap gap-4">
          {PRIORITIES.map((p) => (
            <label key={p} className="flex items-center gap-2 text-label text-text">
              <input type="radio" name="task-priority" checked={priority === p} onChange={() => setPriority(p)} />
              {priorityLabelKO(p)}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">마감일</span>
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={FIELD} />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">메모</span>
        <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} className={`${FIELD} resize-none`} />
      </label>

      {submitError && <ErrorState variant="inline" onAction={onRetry} />}

      {/* Same fix as ProjectCreateForm's identical button row — see that
          file's comment. Button's stacked disabledReason would otherwise make
          "추가" two lines tall next to a one-line "취소" (owner review C-1/C-2). */}
      <div className="mt-1 flex items-center justify-between gap-2">
        <span role="alert" className="text-caption text-danger-700">
          {!trimmedTitle && '제목을 입력해 주세요'}
        </span>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" variant="primary" size="md" loading={submitting} disabled={!trimmedTitle}>
            {isEdit ? '저장' : '추가'}
          </Button>
        </div>
      </div>
    </form>
  )

  if (isDesktop) {
    return (
      <Dialog open onClose={onClose} labelledById={TITLE_ID} initialFocusRef={titleRef} size="lg">
        {body}
      </Dialog>
    )
  }
  return (
    <BottomSheet open onClose={onClose} labelledById={TITLE_ID} initialFocusRef={titleRef}>
      {body}
    </BottomSheet>
  )
}

export default TaskCreateForm
