import { ModeToggle } from './ModeToggle'
import { formatDurationKO } from '../../features/plan/planTime'

/*
  Weekly summary (PLAN-01): planned vs available time with a progress bar, plus
  the view-mode toggle on the right. The ratio is shown as text ("6시간 40분 /
  45시간") and mirrored by the bar; the bar turns to a warning tone past 100% but
  the numbers remain the source of truth (color is never the only signal).
*/
export function SummaryBar({ usedMinutes, availableMinutes, mode, onModeChange }) {
  const ratio = availableMinutes > 0 ? usedMinutes / availableMinutes : 0
  const pct = Math.min(100, Math.round(ratio * 100))
  const over = usedMinutes > availableMinutes && availableMinutes > 0

  return (
    <div>
      {/* Time text centered; the mode toggle floats at the right edge (design). */}
      <div className="relative flex items-center justify-center">
        <p className="text-body text-center">
          <span className="font-bold text-text">{formatDurationKO(usedMinutes)}</span>
          <span className="text-text-muted"> / {formatDurationKO(availableMinutes)}</span>
          {over && <span className="ml-2 text-caption font-medium text-warning-700">초과</span>}
        </p>
        <div className="absolute right-0">
          <ModeToggle mode={mode} onChange={onModeChange} />
        </div>
      </div>

      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="가용 시간 대비 계획 시간"
      >
        <div
          className={`h-full rounded-full ${over ? 'bg-warning-500' : 'bg-brand-600'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export default SummaryBar
