import { StatsToggle } from './StatsToggle'
import { LoadingSkeleton } from '../common/LoadingSkeleton'
import { formatSignedHm } from '../../features/stats/statsFormat'
import { DEVIATION_GROUP_BYS } from '../../features/stats/statsConstants'

/*
  편차 분석 (AC-2 — RB-STAT-01 프로젝트/카테고리별 편차). `groupBy` toggles which
  /stats/deviations call is active; StatisticsPage owns that piece of local UI
  state and just hands it down here (같은 useState-in-parent 패턴 HomePage의
  execLog 토글과 동일).

  AC-2's "'없음' 그룹도 표시" is satisfied structurally: `deviations` is
  rendered exactly as received from statsApi.js (which does not filter
  anything out — see its own header), so a `없음` row shows up here the same
  way any other group does, with no special-case branch in THIS component.

  AC-5's 카테고리 미사용 힌트 lives here too (not a separate screen section)
  because it only makes sense next to the 카테고리별 list it's commenting on —
  `categories` is the FULL canonical list (project 기능의 useCategories, ST-F1-
  09 AC-1과 동일 소스); any canonical category absent OR present with
  `sampleSize: 0` in the current groupBy=category response is "미사용".
*/
export function DeviationPanel({ groupBy, onGroupByChange, deviations = [], categories = [] }) {
  const maxAbs = Math.max(1, ...deviations.filter((d) => d.sampleSize > 0).map((d) => Math.abs(d.deviationMinutes)))

  // `deviations.length > 0` guard: an EMPTY deviations list already renders
  // its own "비교할 수 있는 편차 데이터가 없습니다" message below — without this
  // guard every canonical category would ALSO count as "unused" in that case
  // (no row to find a match in), stacking a second, redundant hint under the
  // first one instead of just the one message that already covers it.
  const unusedCategories =
    groupBy === 'category' && deviations.length > 0
      ? categories.filter((cat) => {
          const row = deviations.find((d) => d.label === cat)
          return !row || row.sampleSize === 0
        })
      : []

  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-title font-semibold text-text">편차 분석</h2>
        <StatsToggle
          options={DEVIATION_GROUP_BYS}
          value={groupBy}
          onChange={onGroupByChange}
          ariaLabel="편차 분석 그룹 기준"
        />
      </div>

      {deviations.length === 0 ? (
        <p className="mt-3 text-label text-text-muted">비교할 수 있는 편차 데이터가 없습니다.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {deviations.map((d) => {
            const noData = d.sampleSize === 0
            const ratio = noData ? 0 : Math.min(Math.abs(d.deviationMinutes) / maxAbs, 1)
            return (
              <li key={d.key ?? d.label}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-label font-medium text-text">{d.label}</span>
                  {noData ? (
                    <span className="text-label text-text-disabled">기록 없음</span>
                  ) : (
                    <span className="text-label font-semibold text-text tabular-nums">
                      {formatSignedHm(d.deviationMinutes)}
                    </span>
                  )}
                </div>
                {/* 값의 부호(+/-)가 이미 의미를 전달하므로 막대는 색이 아니라
                    길이로만 크기를 보조한다 — ImpactList의 미니 바와 같은
                    "decorative, aria-hidden" 취급. sampleSize 0인 행은 막대
                    자체를 그리지 않는다(길이 0인 막대는 "편차 0"으로 오독될
                    수 있어서 — 텍스트로만 "기록 없음"을 전달한다). */}
                {!noData && (
                  <div aria-hidden="true" className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
                    <div className="h-full rounded-full bg-neutral-800" style={{ width: `${ratio * 100}%` }} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {unusedCategories.length > 0 && (
        <p className="mt-3 border-t border-border pt-3 text-caption text-text-muted">
          아직 기록이 없는 카테고리: {unusedCategories.join(', ')}
        </p>
      )}
    </div>
  )
}

export function DeviationPanelSkeleton() {
  return (
    <LoadingSkeleton
      preset="listRow"
      count={4}
      className="rounded-card border border-border bg-surface p-4"
    />
  )
}

export default DeviationPanel
