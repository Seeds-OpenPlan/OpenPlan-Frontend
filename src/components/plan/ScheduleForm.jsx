import { useRef, useState } from 'react'
import { Dialog } from '../common/Dialog'
import { BottomSheet } from '../common/BottomSheet'
import { Button } from '../common/Button'
import { MinuteStepper } from './MinuteStepper'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import { composeTimestamp, snapMinutes, MINUTES_PER_DAY, SNAP_MINUTES } from '../../features/plan/planTime'
import { priorityLabelKO } from '../../features/plan/planPlacement'

/*
  Personal-schedule form (OVL-SCHED) shared by PLAN-08 (create) and PLAN-17 (edit).
  Fields: 제목·시작·종료·예상시간·우선순위·메모. Times are native <input type="time"
  step="300"> (5-minute steps) and re-snapped on change so a non-multiple can't
  land. The day stays fixed (moving days is a drag); only the time-of-day is
  edited here. Modal shell = Dialog (desktop) / BottomSheet (mobile).

  Rendered CONDITIONALLY by the page (mounts fresh each open), so initial state
  can seed straight from `initial`.
*/

const FIELD =
  'w-full rounded-control border border-border bg-surface px-3 py-2 text-label text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring'
const TITLE_ID = 'schedule-form-title'

function minutesToTime(min) {
  // `min` can be MINUTES_PER_DAY (1440, "midnight as an end time" — see the
  // end-field onChange below) but native <input type="time"> only accepts
  // 00:00-23:59, so fold the day-boundary sentinel back to the displayable
  // "00:00" it originated from.
  const clamped = min % MINUTES_PER_DAY
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
function timeToMinutes(value) {
  const [h, m] = value.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

/**
 * A START time can never legitimately BE the day-boundary sentinel
 * (1440/"end of day", the value the END field's own onChange below
 * deliberately produces for a literal 00:00) — there is no "start at the
 * next day" concept in this single-day form. `snapMinutes` clamps its own
 * output at 1440 (planTime.js), so a raw 23:58 or 23:59 (1438/1439 minutes
 * — the only two values past 23:55 an `<input type="time">` can send)
 * rounds UP to that exact sentinel. Left uncorrected, `minutesToTime`'s
 * `% MINUTES_PER_DAY` fold (added above for END's legitimate 1440 case)
 * would silently REDISPLAY it as "00:00" while the underlying startMin
 * stayed 1440 — a visual "00:00" that doesn't match `invalid`'s comparison
 * (still computed against the real 1440) and that `composeTimestamp` would
 * roll onto the FOLLOWING day if it ever reached submit
 * (`Date.setMinutes(1440)` overflows the month/day fields). Folding down to
 * the day's actual last 5-minute step (23:55) keeps the displayed value and
 * the stored one in agreement, the same way every other 5-minute snap in
 * this form already does.
 */
function snapStartMinutes(minutes) {
  return minutes === MINUTES_PER_DAY ? MINUTES_PER_DAY - SNAP_MINUTES : minutes
}

export function ScheduleForm({ mode, initial, onClose, onSubmit, submitting = false }) {
  const isDesktop = useIsDesktop()
  const titleRef = useRef(null)

  const [title, setTitle] = useState(initial.title ?? '')
  const [startMin, setStartMin] = useState(initial.startMin)
  const [endMin, setEndMin] = useState(initial.endMin)
  const [estimatedMinutes, setEstimatedMinutes] = useState(initial.estimatedMinutes ?? 60)
  const [priority, setPriority] = useState(initial.priority ?? 2)
  const [memo, setMemo] = useState(initial.memo ?? '')

  const invalid = endMin <= startMin

  const submit = (e) => {
    e.preventDefault()
    if (invalid || submitting) return
    onSubmit({
      title: title.trim() || '새 일정',
      startAt: composeTimestamp(initial.dayISO, startMin),
      endAt: composeTimestamp(initial.dayISO, endMin),
      estimatedMinutes,
      priority,
      memo: memo.trim(),
    })
  }

  const body = (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h2 id={TITLE_ID} className="text-title font-semibold text-text">
        {mode === 'create' ? '새 일정' : '일정 편집'}
      </h2>

      <label className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">제목</span>
        <input
          ref={titleRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="일정 제목"
          className={FIELD}
        />
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
              if (m != null) setStartMin(snapStartMinutes(snapMinutes(m)))
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
              if (m == null) return
              // A literal 00:00 end means midnight (the end of the day this
              // schedule started on), not "before the day begins" — the only
              // way a time input can express that is the same string as
              // 0, so treat it as the day boundary unless the start is ALSO
              // midnight (a genuine 0-length range, still invalid).
              setEndMin(m === 0 && startMin !== 0 ? MINUTES_PER_DAY : snapMinutes(m))
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

      <div className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">예상 시간</span>
        <MinuteStepper value={estimatedMinutes} onChange={setEstimatedMinutes} label="예상 시간" />
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">우선순위</span>
        <select
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value))}
          className={FIELD}
        >
          {[1, 2, 3].map((p) => (
            <option key={p} value={p}>
              {priorityLabelKO(p)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">메모</span>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={3}
          className={`${FIELD} resize-none`}
        />
      </label>

      <div className="mt-1 flex justify-end gap-2">
        <Button type="button" variant="secondary" size="md" onClick={onClose}>
          취소
        </Button>
        <Button type="submit" variant="primary" size="md" loading={submitting} disabled={invalid}>
          {mode === 'create' ? '추가' : '저장'}
        </Button>
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

export default ScheduleForm
