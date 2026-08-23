import { useState } from 'react'
import { Dialog } from '../common/Dialog'
import { BottomSheet } from '../common/BottomSheet'
import { Button } from '../common/Button'
import { MinuteStepper } from './MinuteStepper'
import { useIsDesktop } from '../../hooks/useMediaQuery'

/*
  Actual-time log (PLAN-15 실제 시간 기록). A small modal: a 5-minute MinuteStepper
  for the minutes actually spent (prefilled from the task's estimate, falling back
  to the block's own duration) + a result choice (완료/지연/중단) + an optional
  memo. Rendered conditionally by the page, so state seeds from `block` at mount.
*/

const TITLE_ID = 'exec-log-title'

// 계약(openapi-live-76c7009.yaml:1470)의 execution-logs 바디가 요구하는
// result enum 그대로. 통계(완료율·편차)가 이 값을 그대로 집계하므로 여기
// 라벨이 곧 그 통계의 원천이다 — 값을 바꾸려면 BE 계약도 같이 바뀌어야 한다.
const RESULT_OPTIONS = [
  { value: 'COMPLETED', label: '완료' },
  { value: 'DELAYED', label: '지연' },
  { value: 'ABORTED', label: '중단' },
]

export function ExecutionLogForm({ block, onClose, onSubmit, submitting = false }) {
  const isDesktop = useIsDesktop()
  const durationMin = Math.max(
    5,
    Math.round((new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60000),
  )
  const [actualMinutes, setActualMinutes] = useState(block.estimatedMinutes ?? durationMin)
  const [memo, setMemo] = useState('')
  // 가장 흔한 경우(제때 끝냄)를 기본으로 두되, 사용자가 항상 바꿀 수 있다 —
  // 이 값을 고르지 않고 그냥 제출해도 "완료"로 조용히 쌓이는 게 바로 이 필드가
  // 없어서 생긴 문제였다(taskApi.postExecutionRecord의 CONTRACT GAP 주석 참고).
  const [result, setResult] = useState('COMPLETED')

  const submit = (e) => {
    e.preventDefault()
    if (submitting) return
    onSubmit({ actualMinutes, result, memo: memo.trim() })
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

      {/* fieldset/legend — TaskEditModal의 "상태" 라디오 그룹과 같은 패턴
          (색만으로 선택 상태를 전달하지 않도록 라벨 텍스트를 항상 병기). */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-caption font-medium text-text-muted">결과</legend>
        <div className="flex flex-wrap gap-4">
          {RESULT_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-label text-text">
              <input
                type="radio"
                name="exec-log-result"
                value={opt.value}
                checked={result === opt.value}
                onChange={() => setResult(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>

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
