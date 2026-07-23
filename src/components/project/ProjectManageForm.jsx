import { useRef, useState } from 'react'
import { Dialog } from '../common/Dialog'
import { BottomSheet } from '../common/BottomSheet'
import { Button } from '../common/Button'
import { ErrorState } from '../common/ErrorState'
import { ConflictOverlay } from '../common/ConflictOverlay'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import { PROJECT_STATUS_OPTIONS } from '../../features/project/projectLabels'

/*
  OVL-PROJ-MANAGE (ui-spec §PROJ.5, PROJ-05/06/07). One overlay does both the
  info edit (이름/설명/마감일) and the status radio (진행중/보류/종료) — the
  spec's own PROJ-05 wording treats them as one "관리" action, not two forms.

  Status labels come from projectLabels.js (A-4, owner review 2026-07-23) —
  never spelled out locally, so "보류" vs the spec draft's "중지" only has one
  place to ever change again.

  409 (E-COM-006, optimistic lock) reuses ConflictOverlay as-is (§PROJ.5 —
  "OVL-CONFLICT 재사용"). This is the FIRST screen to actually mount it; every
  other write path in this codebase (WeeklyPage's save conflict) still only
  toasts because nothing mounted the overlay yet — see WeeklyPage.handleSaveError's
  own comment. Composing an already-built common component is not the same as
  editing one, so this doesn't need the lead's shared-file sign-off.
*/

const FIELD =
  'w-full rounded-control border border-border bg-surface px-3 py-2 text-label text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring'
const TITLE_ID = 'project-manage-title'

export function ProjectManageForm({
  project,
  onClose,
  onSubmit,
  submitting = false,
  submitError,
  onRetry,
  conflict,
  onConflictAccept,
  onConflictRetry,
}) {
  const isDesktop = useIsDesktop()
  const nameRef = useRef(null)

  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description ?? '')
  const [dueDate, setDueDate] = useState(project.dueDate ?? '')
  const [status, setStatus] = useState(project.status)

  const trimmedName = name.trim()
  // A project reactivated (PAUSED/CLOSED → IN_PROGRESS) whose deadline already
  // passed needs the reminder the spec calls for (§PROJ.5 [추론]) — reusing
  // the past-due comparison rather than a separate "was this auto-closed"
  // flag, since either origin leaves the same stale due date behind.
  const reactivatingPastDue =
    status === 'IN_PROGRESS' &&
    project.status !== 'IN_PROGRESS' &&
    dueDate &&
    dueDate < new Date().toISOString().slice(0, 10)

  const submit = (e) => {
    e.preventDefault()
    if (!trimmedName || submitting) return
    onSubmit({
      name: trimmedName,
      description: description.trim(),
      dueDate: dueDate || null,
      status,
    })
  }

  const body = (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h2 id={TITLE_ID} className="text-title font-semibold text-text">
        프로젝트 관리
      </h2>

      <label className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">이름 *</span>
        <input
          ref={nameRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
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
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={FIELD} />
      </label>

      <div className="h-px bg-border" />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-caption font-medium text-text-muted">상태</legend>
        <div className="flex flex-wrap gap-4">
          {PROJECT_STATUS_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-label text-text">
              <input
                type="radio"
                name="project-status"
                value={opt.value}
                checked={status === opt.value}
                onChange={() => setStatus(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
        {status === 'CLOSED' && (
          <p className="text-caption text-text-muted">
            종료된 프로젝트는 목록의 종료 탭으로 이동합니다
          </p>
        )}
        {reactivatingPastDue && (
          <p className="text-caption text-text-muted">
            마감일이 지난 상태입니다 — 마감일도 함께 조정해 주세요
          </p>
        )}
      </fieldset>

      {submitError && <ErrorState variant="inline" onAction={onRetry} />}

      {/* Same fix as ProjectCreateForm's button row (owner review C-1/C-2) —
          this field starts pre-filled so the message rarely shows, but the
          same stacked-disabledReason misalignment would appear the moment a
          user cleared it, so it gets the identical treatment for consistency. */}
      <div className="mt-1 flex items-center justify-between gap-2">
        <span role="alert" className="text-caption text-danger-700">
          {!trimmedName && '이름을 입력해 주세요'}
        </span>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" variant="primary" size="md" loading={submitting} disabled={!trimmedName}>
            저장
          </Button>
        </div>
      </div>
    </form>
  )

  return (
    <>
      {isDesktop ? (
        <Dialog open onClose={onClose} labelledById={TITLE_ID} initialFocusRef={nameRef} size="lg">
          {body}
        </Dialog>
      ) : (
        <BottomSheet open onClose={onClose} labelledById={TITLE_ID} initialFocusRef={nameRef}>
          {body}
        </BottomSheet>
      )}
      {conflict && (
        <ConflictOverlay
          open
          latest={conflict.latest}
          current={{ name, description, dueDate, status }}
          onAccept={onConflictAccept}
          onRetry={onConflictRetry}
        />
      )}
    </>
  )
}

export default ProjectManageForm
