import { Badge } from '../common/Badge'
import { LoadingSkeleton } from '../common/LoadingSkeleton'

const MAX_VISIBLE = 5

/*
  지연 발생 태스크 (Desktop.Status.png 좌측 두 번째 목록). Not named in ST-F1-11's
  5 AC either (같은 이유로 ProjectInvestmentList 참고) — 시각 정본 충실도 목적으로
  포함. Data is `delayedTasks` from the same /stats/summaries payload
  SummaryCards' "지연 태스크" card counts FROM — this list is that count's detail
  view, capped at MAX_VISIBLE the same way ImpactList caps 이번 주 투입 on the
  dashboard (a "전체 보기" link is skipped here: there is no dedicated
  지연 태스크 목록 route yet, so a link with nowhere real to go would be worse
  than no link).
*/
export function DelayedTaskList({ tasks = [] }) {
  const visible = tasks.slice(0, MAX_VISIBLE)

  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <h2 className="text-title font-semibold text-text">지연 발생 태스크</h2>

      {visible.length === 0 ? (
        <p className="mt-3 text-label text-text-muted">지연된 태스크가 없습니다.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {visible.map((t) => (
            <li key={t.taskId} className="flex items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-label font-medium text-text">{t.title}</p>
                <p className="mt-0.5 text-caption text-text-muted">
                  {t.projectName} · {t.progressPercent > 0 ? `${t.progressPercent}% 완료` : '미완료'}
                </p>
              </div>
              {/* "마감일"(오늘까지) vs "N일 초과" — 이미 지난 것은 danger, 오늘까지인 것은
                  warning으로 심각도를 구분한다(색만이 아니라 배지 문구 자체가 구분값). */}
              <Badge tone={t.overdueLabel === '마감일' ? 'warning' : 'danger'} label={t.overdueLabel} className="shrink-0" />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function DelayedTaskListSkeleton() {
  return (
    <LoadingSkeleton
      preset="listRow"
      count={3}
      className="rounded-card border border-border bg-surface p-4"
    />
  )
}

export default DelayedTaskList
