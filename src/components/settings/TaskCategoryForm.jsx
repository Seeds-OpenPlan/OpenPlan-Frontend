import { useRef, useState } from 'react'
import { Dialog } from '../common/Dialog'
import { BottomSheet } from '../common/BottomSheet'
import { Button } from '../common/Button'
import { useIsDesktop } from '../../hooks/useMediaQuery'

const FIELD =
  'w-full rounded-control border border-border bg-surface px-3 py-2 text-label text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring'
const TITLE_ID = 'task-category-form-title'

/*
  OVL-TASKCAT-CREATE (W3, SC-01) — "+ 카테고리 추가" 폼. CREATE-ONLY by
  contract, not by choice: the real TaskCategoryController has no PUT/PATCH
  at all (see taskCategoryApi.createTaskCategory's own header) — there is no
  "edit" mode to add later the way TaskCreateForm's own `task` prop hints at
  one for tasks, so this component doesn't pretend to have one either.

  ERROR HANDLING (R1 — never parse `message`): the two failures the server
  actually distinguishes, name length (422 E-COM-009) and duplicate name
  (409 E-CAT-001), are branched on `error.code` right here rather than a
  shared catalog — same inline-ternary shape SignupPage/LoginPage already use
  for their own E-AUTH-* codes, since neither of these two codes has (or
  needs) a home in systemMessages.js's shared surface catalog.
*/
export function TaskCategoryForm({ onClose, onSubmit, submitting = false, submitError }) {
  const isDesktop = useIsDesktop()
  const nameRef = useRef(null)
  const [name, setName] = useState('')

  const trimmedName = name.trim()
  // Client-side mirror of the server's own 1~50자 rule (E-COM-009) — catches
  // the obvious case before a round trip, but the server's check is still the
  // one that actually decides (a name that LOOKS fine here could still 409 on
  // a duplicate, which only the server can know).
  const tooLong = trimmedName.length > 50

  const submit = (e) => {
    e.preventDefault()
    if (!trimmedName || tooLong || submitting) return
    onSubmit(trimmedName)
  }

  const errorCopy =
    submitError?.code === 'E-CAT-001'
      ? '이미 사용 중인 이름입니다. 다른 이름을 입력해 주세요.'
      : submitError?.code === 'E-COM-009'
        ? '이름은 1~50자로 입력해 주세요.'
        : submitError
          ? '카테고리를 추가하지 못했습니다. 잠시 후 다시 시도해 주세요.'
          : null

  const body = (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h2 id={TITLE_ID} className="text-title font-semibold text-text">
        카테고리 추가
      </h2>

      <label className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">이름 *</span>
        <input
          ref={nameRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={50}
          className={FIELD}
        />
      </label>

      <span role="alert" className="text-caption text-danger-700">
        {tooLong ? '이름은 50자를 넘을 수 없습니다' : errorCopy}
      </span>

      <div className="mt-1 flex items-center justify-end gap-2">
        <Button type="button" variant="secondary" size="md" onClick={onClose}>
          취소
        </Button>
        <Button type="submit" variant="primary" size="md" loading={submitting} disabled={!trimmedName || tooLong}>
          추가
        </Button>
      </div>
    </form>
  )

  if (isDesktop) {
    return (
      <Dialog open onClose={onClose} labelledById={TITLE_ID} initialFocusRef={nameRef} size="sm">
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

export default TaskCategoryForm
