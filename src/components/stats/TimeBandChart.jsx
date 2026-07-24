import { Skeleton } from '../common/Skeleton'

// Fixed pixel height for the bar row — kept IDENTICAL between the real chart
// and its skeleton (below) so swapping one for the other causes no layout
// shift (SYS-03 AC-3), and used again per-bar to convert a 0–100 rate into a
// pixel height.
const BAR_AREA_HEIGHT = 112

/*
  시간대별 수행 효율 (AC-3 — RB-STAT-03 4구간 완료율 + 요약 문장). `bands` is
  already aggregated FE-side by statsApi.js's normalizeTimePatterns (팀리드
  결정: 4구간 집계는 서버가 아니라 여기서) into exactly the 4 entries
  TIME_BANDS defines — this component only renders them, it does not know
  about individual hours.

  The AC's own explicit requirement — "무데이터 구간은 '기록 없음'으로, 0%와
  명확히 구분" — is why a `rate: null` band renders as a dashed OUTLINE bar
  with no percentage text at all, never a bar at 0 height with "0%" printed:
  a real 0% band DID have tracked executions (they just all failed), so it
  still gets a solid fill bar reading "0%"; a null band never had any.
*/
export function TimeBandChart({ bands = [], summary }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <h2 className="text-title font-semibold text-text">시간대별 수행 효율</h2>

      {/* Bars are decorative (aria-hidden) — the one aria-label on this row
          carries the same numbers/"기록 없음" a sighted user reads off the
          bars + text underneath, so a screen reader gets the full chart in
          one announcement instead of bar-by-bar noise. */}
      <div
        role="img"
        aria-label={`시간대별 완료율 — ${bands
          .map((b) => `${b.label} ${b.rate !== null ? `${b.rate}%` : '기록 없음'}`)
          .join(', ')}`}
        className="mt-3 flex items-end justify-between gap-3"
        style={{ height: BAR_AREA_HEIGHT }}
      >
        {bands.map((band) => {
          const hasData = band.rate !== null
          const barHeight = hasData ? Math.max((band.rate / 100) * BAR_AREA_HEIGHT, 6) : 6
          return (
            <div key={band.key} aria-hidden="true" className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className="text-caption font-medium text-text tabular-nums">{hasData ? `${band.rate}%` : ''}</span>
              <div
                className={
                  hasData
                    ? 'w-full rounded-t-chip bg-brand-600'
                    : 'w-full rounded-t-chip border border-dashed border-border-strong'
                }
                style={{ height: barHeight }}
              />
            </div>
          )
        })}
      </div>

      <div className="mt-1 flex justify-between gap-3">
        {bands.map((band) => (
          <div key={band.key} className="flex-1 text-center">
            <p className="text-caption text-text-muted">{band.label}</p>
            {/* Text label, not color, is what actually distinguishes "기록
                없음" from a real 0% (NFR-017 applies here too, not just to
                the bar fill above). */}
            {band.rate === null && <p className="text-caption text-text-disabled">기록 없음</p>}
          </div>
        ))}
      </div>

      <p className="mt-3 text-label text-text-muted">{summary}</p>
    </div>
  )
}

export function TimeBandChartSkeleton() {
  return (
    <div className="rounded-card border border-border p-4">
      <Skeleton width="40%" height="1.125rem" className="mb-3" />
      <div className="flex items-end justify-between gap-3" style={{ height: BAR_AREA_HEIGHT }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} width="100%" height={`${BAR_AREA_HEIGHT * 0.6}px`} radius="var(--radius-chip)" className="flex-1" />
        ))}
      </div>
      <Skeleton width="70%" height="0.875rem" className="mt-3" />
    </div>
  )
}

export default TimeBandChart
