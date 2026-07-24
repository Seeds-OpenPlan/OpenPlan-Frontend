import { useEffect, useId, useRef, useState } from 'react'
import { Dialog } from '../common/Dialog'
import { BottomSheet } from '../common/BottomSheet'
import { Button } from '../common/Button'
import { Banner } from '../common/Banner'
import { ConflictOverlay } from '../common/ConflictOverlay'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import { WEEKDAY_KEYS, WEEKDAY_LABELS_KO, snapMinutes, weekLabelKO } from '../../features/plan/planTime'
import { usePreviewFixedScheduleConflicts } from '../../features/settings/useSettings'

const FIELD =
  'w-full rounded-control border border-border bg-surface px-3 py-2 text-label text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring'
const TITLE_ID = 'fixed-schedule-form-title'
const PREVIEW_DEBOUNCE_MS = 400

function minutesToTime(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
function timeToMinutes(value) {
  const [h, m] = value.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

/*
  OVL-FIXED-SCHEDULE (FIX-06/07 생성·편집). Shared by "고정일정 직접 추가" and a
  row click. The distinguishing feature over every other form in this codebase
  (ScheduleForm/ProjectManageForm) is the LIVE, debounced conflict preview
  (FIX-08): every weekday/time edit re-runs the dry-run
  `POST /fixed-schedules/conflict-previews` ~400ms after the user stops
  typing, and the result renders as an inline banner — never a blocking gate.
  Saving is ALWAYS allowed regardless of what the preview finds (owner
  decision, ST-F1-12 AC-2): the banner informs, it does not gate.
*/
export function FixedScheduleForm({
  mode, // 'create' | 'edit'
  initial, // { fixedScheduleId?, title, weekday, startMinutes, endMinutes, version? }
  onClose,
  onSubmit,
  onDelete,
  submitting = false,
  deleting = false,
  conflict, // { latest } | null — E-COM-006 on THIS form's own save
  onConflictAccept,
  onConflictRetry,
  onNavigateToWeek, // (weekStartDate) => void — FIX-08 "항목 → 주간 계획 이동"
}) {
  const isDesktop = useIsDesktop()
  const titleRef = useRef(null)
  const deleteTitleId = useId()
  const deleteConfirmBtnRef = useRef(null)

  const [title, setTitle] = useState(initial.title ?? '')
  const [weekday, setWeekday] = useState(initial.weekday ?? 'MON')
  const [startMin, setStartMin] = useState(initial.startMinutes ?? 9 * 60)
  const [endMin, setEndMin] = useState(initial.endMinutes ?? 10 * 60)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  const invalid = endMin <= startMin

  const previewMutation = usePreviewFixedScheduleConflicts()
  const debounceRef = useRef(null)
  // `mutate` is a fresh function reference every render (useMutation's own
  // contract) and does not itself participate in "what changed" below — a ref
  // holding the latest one avoids putting it in the effect's deps at all
  // (the alternative, an eslint-disable, would suppress the check rather
  // than route around the actual churn).
  const mutateRef = useRef(previewMutation.mutate)
  useEffect(() => {
    mutateRef.current = previewMutation.mutate
  })

  // Live preview — debounced, and SKIPPED entirely while the current draft is
  // invalid (a start>=end candidate has nothing meaningful to dry-run against).
  useEffect(() => {
    if (invalid) return undefined
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      mutateRef.current({
        weekday,
        startMinutes: startMin,
        endMinutes: endMin,
        excludeFixedScheduleId: initial.fixedScheduleId ?? null,
      })
    }, PREVIEW_DEBOUNCE_MS)
    return () => clearTimeout(debounceRef.current)
  }, [weekday, startMin, endMin, invalid, initial.fixedScheduleId])

  const preview = previewMutation.data
  const previewChecking = previewMutation.isPending

  const submit = (e) => {
    e.preventDefault()
    if (invalid || submitting) return
    onSubmit({
      title: title.trim() || '새 고정 일정',
      weekday,
      startMinutes: startMin,
      endMinutes: endMin,
    })
  }

  const body = (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h2 id={TITLE_ID} className="text-title font-semibold text-text">
        {mode === 'create' ? '고정 일정 추가' : '고정 일정 편집'}
      </h2>

      <label className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">제목</span>
        <input
          ref={titleRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 자료구조 수업"
          className={FIELD}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">요일</span>
        <select value={weekday} onChange={(e) => setWeekday(e.target.value)} className={FIELD}>
          {WEEKDAY_KEYS.map((key, i) => (
            <option key={key} value={key}>
              매주 {WEEKDAY_LABELS_KO[i]}요일
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-caption font-medium text-text-muted">시작</span>
          <input
            type="time"
            step="300"
            value={minutesToTime(startMin)}
            onChange={(e) => {
              const m = timeToMinutes(e.target.value)
              if (m != null) setStartMin(snapMinutes(m))
            }}
            className={FIELD}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-caption font-medium text-text-muted">종료</span>
          <input
            type="time"
            step="300"
            value={minutesToTime(endMin)}
            onChange={(e) => {
              const m = timeToMinutes(e.target.value)
              if (m != null) setEndMin(snapMinutes(m))
            }}
            className={FIELD}
          />
        </label>
      </div>
      {invalid && (
        <p role="alert" className="-mt-2 text-caption text-danger-700">
          종료 시간이 시작 시간보다 늦어야 합니다
        </p>
      )}

      {/* FIX-08 — informational only, never blocks 저장. */}
      {!invalid && previewChecking && (
        <p className="text-caption text-text-muted">저장된 계획과 겹치는지 확인하는 중…</p>
      )}
      {!invalid && !previewChecking && preview?.hasConflict && (
        <Banner
          tone="warning"
          sticky={false}
          icon={<span aria-hidden="true">!</span>}
          message="이 설정을 저장하면 아래 주의 계획에 차단 표시가 생깁니다. 저장은 계속할 수 있습니다."
        />
      )}
      {!invalid && !previewChecking && preview?.hasConflict && (
        <ul className="flex flex-col gap-1">
          {preview.affectedWeeks.map((w) => (
            <li key={w.weekStartDate}>
              <button
                type="button"
                onClick={() => onNavigateToWeek?.(w.weekStartDate)}
                className="text-label text-brand-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                {weekLabelKO(w.weekStartDate)} · {w.conflictCount}건 — 주간 계획에서 확인
              </button>
            </li>
          ))}
        </ul>
      )}
      {!invalid && !previewChecking && preview && !preview.hasConflict && (
        <p className="text-caption text-success-700">충돌 없음</p>
      )}

      <div className="mt-1 flex items-center justify-between gap-2">
        {mode === 'edit' ? (
          <Button type="button" variant="danger" size="md" onClick={() => setDeleteConfirmOpen(true)}>
            삭제
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" variant="primary" size="md" loading={submitting} disabled={invalid}>
            {mode === 'create' ? '추가' : '저장'}
          </Button>
        </div>
      </div>
    </form>
  )

  const deleteConfirmBody = (
    <div className="flex flex-col gap-4">
      <h2 id={deleteTitleId} className="text-title font-semibold text-text">
        고정 일정을 삭제할까요?
      </h2>
      <p className="text-body text-text-muted">
        삭제하면 이 일정의 이번 주 비활성화 기록도 함께 사라집니다. 저장된 계획의 블록은 남습니다.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="md" onClick={() => setDeleteConfirmOpen(false)}>
          취소
        </Button>
        <Button ref={deleteConfirmBtnRef} variant="danger" size="md" loading={deleting} onClick={() => onDelete?.()}>
          삭제
        </Button>
      </div>
    </div>
  )

  return (
    <>
      {isDesktop ? (
        <Dialog open onClose={onClose} labelledById={TITLE_ID} initialFocusRef={titleRef} size="lg">
          {body}
        </Dialog>
      ) : (
        <BottomSheet open onClose={onClose} labelledById={TITLE_ID} initialFocusRef={titleRef}>
          {body}
        </BottomSheet>
      )}
      {deleteConfirmOpen &&
        (isDesktop ? (
          <Dialog
            open
            onClose={() => setDeleteConfirmOpen(false)}
            labelledById={deleteTitleId}
            initialFocusRef={deleteConfirmBtnRef}
          >
            {deleteConfirmBody}
          </Dialog>
        ) : (
          <BottomSheet
            open
            onClose={() => setDeleteConfirmOpen(false)}
            labelledById={deleteTitleId}
            initialFocusRef={deleteConfirmBtnRef}
          >
            {deleteConfirmBody}
          </BottomSheet>
        ))}
      {conflict && (
        <ConflictOverlay
          open
          latest={conflict.latest}
          current={{ title, weekday, startMinutes: startMin, endMinutes: endMin }}
          onAccept={onConflictAccept}
          onRetry={onConflictRetry}
        />
      )}
    </>
  )
}

export default FixedScheduleForm
