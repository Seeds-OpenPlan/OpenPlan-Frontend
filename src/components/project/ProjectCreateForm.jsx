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
  /*
    실서버 대조 (2026-08-29): ProjectValidator.validateDueDate가 오늘보다 이른
    마감일을 422 E-COM-009(dueDate/past)로 거부한다 — 생성·편집 둘 다.
    이 화면은 그동안 "서버 정책 미확인"이라는 전제로 과거 날짜를 통과시키고
    안내 문구만 띄웠는데, 그러면 [만들기]가 서버에서 조용히 실패하고 사용자는
    이유를 모른 채 "기간 설정이 안 된다"만 겪는다. 정책이 확인됐으니 여기서
    막고, 왜 막혔는지 그 자리에서 말한다.
  */
  const isPastDue = dueDate && dueDate < new Date().toISOString().slice(0, 10)
  const todayISO = new Date().toISOString().slice(0, 10)

  const submit = (e) => {
    e.preventDefault()
    if (!trimmedName || isPastDue || submitting) return
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
          min={todayISO}
          onChange={(e) => setDueDate(e.target.value)}
          aria-invalid={isPastDue || undefined}
          className={FIELD}
        />
        {/* `min` 만으로는 부족하다 — 키보드로 직접 입력하면 브라우저가 값을
            그대로 받는다. 그래서 제출 가드(위)와 이 문구가 실제 방어선이다. */}
        {isPastDue && (
          <span role="alert" className="text-caption text-danger-700">
            마감일은 오늘 이후로 정해 주세요
          </span>
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
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={submitting}
            disabled={!trimmedName || isPastDue}
          >
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
