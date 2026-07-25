import { Badge } from '../common/Badge'
import { LoadingSkeleton } from '../common/LoadingSkeleton'
import { formatHoursDecimal } from '../../features/stats/statsFormat'

/*
  이번 주 투입 (Desktop.Status.png 좌측 목록 — RB-STAT-01 프로젝트별 편차의 카드
  형태). Each row shows 실제/예정 시간 as a filled bar + "Nh/Mh" pair, with an
  "초과" badge when performed time ran past planned — the SAME "text label
  always accompanies the bar" rule ImpactList (dashboard) already follows, so a
  color-blind reader still gets "초과" as a word, not just a longer/redder bar.

  Not gated behind any AC by name (ST-F1-11's 5 AC 는 편차/4구간/빈상태/힌트
  중심) — included for 화면 배선의 시각 정본(Desktop.Status.png) 충실도. Data
  source is the SAME /stats/summaries call SummaryCards reads (OP-STATS-
  SUMMARIES) — `projectInvestments`, not a second endpoint.
*/
export function ProjectInvestmentList({ projects = [] }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <h2 className="text-title font-semibold text-text">이번 주 투입</h2>

      {projects.length === 0 ? (
        <p className="mt-3 text-label text-text-muted">이번 기간에 투입된 프로젝트가 없습니다.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {projects.map((p) => {
            const ratio = p.plannedMinutes > 0 ? Math.min(p.performedMinutes / p.plannedMinutes, 1) : 0
            return (
              <li key={p.projectId} className="py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-label font-medium text-text">
                    {p.name}
                    {p.isOver && <Badge tone="warning" label="초과" />}
                  </span>
                  <span className="text-label font-semibold text-text tabular-nums">
                    {formatHoursDecimal(p.performedMinutes)}/{formatHoursDecimal(p.plannedMinutes)}
                  </span>
                </div>
                <p className="mt-0.5 text-caption text-text-muted tabular-nums">
                  가용 {p.availablePercent}% · {p.isOver ? '예상 시간 초과' : '예정 범위 내'}
                </p>
                <div aria-hidden="true" className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
                  <div
                    className={`h-full rounded-full ${p.isOver ? 'bg-danger-600' : 'bg-neutral-800'}`}
                    style={{ width: `${ratio * 100}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function ProjectInvestmentListSkeleton() {
  return (
    <LoadingSkeleton
      preset="listRow"
      count={3}
      className="rounded-card border border-border bg-surface p-4"
    />
  )
}

export default ProjectInvestmentList
