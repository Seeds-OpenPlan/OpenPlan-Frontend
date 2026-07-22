import { useState } from 'react'
import { Dialog } from '../common/Dialog'
import { BottomSheet } from '../common/BottomSheet'
import { Button } from '../common/Button'
import { MinuteStepper } from './MinuteStepper'
import { useIsDesktop } from '../../hooks/useMediaQuery'

/*
  Actual-time log (PLAN-15 실제 시간 기록). A small modal: a 5-minute MinuteStepper
  for the minutes actually spent (prefilled from the task's estimate, falling back
  to the block's own duration) + an optional memo. Rendered conditionally by the
  page, so state seeds from `block` at mount.
*/

const TITLE_ID = 'exec-log-title'

export function ExecutionLogForm({ block, onClose, onSubmit, submitting = false }) {
  const isDesktop = useIsDesktop()
  const durationMin = Math.max(
    5,
    Math.round((new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60000),
  )
  const [actualMinutes, setActualMinutes] = useState(block.estimatedMinutes ?? durationMin)
  const [memo, setMemo] = useState('')

  const submit = (e) => {
    e.preventDefault()
    if (submitting) return
    onSubmit({ actualMinutes, memo: memo.trim() })
  }

  const body = (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <h2 id={TITLE_ID} className="text-title font-semibold text-text">
          실제 시간 기록
        </h2>
        <p className="mt-1 text-caption text-text-muted line-clamp-1">{block.title}</p>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">실제 소요 시간</span>
        <MinuteStepper value={actualMinutes} onChange={setActualMinutes} label="실제 소요 시간" />
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">메모</span>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={2}
          placeholder="선택 사항"
          className="w-full resize-none rounded-control border border-border bg-surface px-3 py-2 text-label text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
        />
      </label>

      <div className="mt-1 flex justify-end gap-2">
        <Button type="button" variant="secondary" size="md" onClick={onClose}>
          취소
        </Button>
        <Button type="submit" variant="primary" size="md" loading={submitting}>
          기록
        </Button>
      </div>
    </form>
  )

  if (isDesktop) {
    return (
      <Dialog open onClose={onClose} labelledById={TITLE_ID} size="sm">
        {body}
      </Dialog>
    )
  }
  return (
    <BottomSheet open onClose={onClose} labelledById={TITLE_ID}>
      {body}
    </BottomSheet>
  )
}

export default ExecutionLogForm
