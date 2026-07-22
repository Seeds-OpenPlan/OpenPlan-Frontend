import { formatDurationKO } from '../../features/plan/planTime'

/*
  A minute value that can ONLY ever be a multiple of `step` (default 5) — the
  −/+ buttons move by `step` and there is no free text entry, so a non-multiple
  is un-enterable by construction (ST-F1-04 PLAN-15 "5분 단위, 비배수 입력 불가").
  The value is read out as text (formatDurationKO) so it is never color/position
  only (NFR-017).
*/
export function MinuteStepper({ value, onChange, min = 5, max = 24 * 60, step = 5, label = '시간' }) {
  const set = (v) => onChange(Math.max(min, Math.min(max, v)))
  const btn =
    'flex h-12 w-12 items-center justify-center rounded-full border border-border text-xl text-text transition-colors hover:bg-surface-sunken disabled:opacity-40 disabled:hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring'
  return (
    <div className="inline-flex items-center gap-3">
      <button
        type="button"
        aria-label={`${label} ${step}분 줄이기`}
        onClick={() => set(value - step)}
        disabled={value <= min}
        className={btn}
      >
        −
      </button>
      <span className="min-w-24 text-center text-body font-medium tabular-nums" aria-live="polite">
        {formatDurationKO(value)}
      </span>
      <button
        type="button"
        aria-label={`${label} ${step}분 늘리기`}
        onClick={() => set(value + step)}
        disabled={value >= max}
        className={btn}
      >
        +
      </button>
    </div>
  )
}

export default MinuteStepper
