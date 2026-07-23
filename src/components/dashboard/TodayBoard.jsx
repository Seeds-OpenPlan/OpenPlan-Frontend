import { Link } from 'react-router-dom'
import { Button } from '../common/Button'
import { ErrorState } from '../common/ErrorState'
import { CheckCircleIcon } from '../common/statusIcons'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import { formatDurationKO } from '../../features/plan/planTime'

/*
  S3 · 오늘 할 일 (DASH-05 · RB-DASH-02 — ui-spec-dash.md §DASH.3, r2). Row order
  and the "오늘 먼저" pick are BOTH server-decided (RB-DASH-02's priority/deadline/
  status rule) — this component only renders what it's given, never re-sorts.
  r2 moved this card to the aside column (HomePage.jsx) and changed [기록]'s
  mobile size sm→lg (touch target — matches RiskList's precedent below).

  "오늘 먼저" badge NOTE: the spec calls for `Badge tone="brand"`, but
  Badge.jsx only ships danger/warning/success/neutral tones today — adding
  "brand" is explicitly the ST-F1-08 owner's change (team-lead assignment), so
  this renders a locally-styled span with the SAME visual anatomy (dot + label)
  instead of touching the shared component. Swap to `<Badge tone="brand" .../>`
  once that lands.
*/
function TopPickBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-chip bg-brand-100 px-2 py-0.5 text-caption font-medium text-brand-700">
      <span className="h-1.5 w-1.5 rounded-full bg-brand-600" aria-hidden="true" />
      오늘 먼저
    </span>
  )
}

export function TodayBoard({
  error = false,
  onRetry,
  dateLabel,
  expectedMinutes = 0,
  remainingAvailableMinutes = 0,
  items = [],
  canWrite = true,
  offlineReason,
  onLog,
}) {
  const isDesktop = useIsDesktop()

  if (error) {
    return (
      <section>
        <h2 className="mb-2 text-title font-semibold text-text">오늘 할 일</h2>
        <ErrorState variant="section" onAction={onRetry} />
      </section>
    )
  }

  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-title font-semibold text-text">오늘 할 일</h2>
        {dateLabel && <span className="text-caption text-text-muted">{dateLabel}</span>}
      </div>
      <p className="mt-1 text-label text-text-muted tabular-nums">
        예상 {formatDurationKO(expectedMinutes)} · 남은 가용 {formatDurationKO(remainingAvailableMinutes)}
      </p>

      <div className="mt-3 border-t border-border" />

      {items.length === 0 ? (
        <p className="py-4 text-label text-text-muted">오늘 예정된 항목이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-2.5">
              {/* Fixed-width slot whether or not the check renders, so titles
                  align between completed and incomplete rows (no text jump). */}
              <span className="flex w-5 shrink-0 justify-center">
                {item.completed && <CheckCircleIcon className="text-text-muted" size={18} />}
              </span>
              <div className={`min-w-0 flex-1 ${item.completed ? 'text-text-muted' : ''}`}>
                <div className="flex flex-wrap items-center gap-1.5">
                  {item.isTop && !item.completed && <TopPickBadge />}
                  <span className="text-label font-medium tabular-nums">{item.timeLabel}</span>
                  <span className="text-label line-clamp-1">
                    {item.title}
                    {item.type === 'SCHEDULE' && <span className="text-text-muted"> (일정)</span>}
                  </span>
                </div>
                <p className="mt-0.5 text-caption text-text-muted tabular-nums">
                  {item.completed ? '완료' : `예상 ${formatDurationKO(item.expectedMinutes)}`}
                </p>
              </div>
              {!item.completed && (
                // Desktop sm / mobile lg (48px touch target) — same rule
                // RiskList's row buttons already use (ui-spec §0.4).
                <Button
                  variant="secondary"
                  size={isDesktop ? 'sm' : 'lg'}
                  disabled={!canWrite}
                  disabledReason={!canWrite ? offlineReason : undefined}
                  onClick={() => onLog?.(item)}
                >
                  기록
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex justify-end">
        <Link
          to="/weekly"
          className="rounded text-label font-medium text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          주간 계획에서 보기 →
        </Link>
      </div>
    </div>
  )
}

export default TodayBoard
