import { Skeleton, SkeletonText } from '../common/Skeleton'
import { formatHoursDecimal, formatSignedPercent } from '../../features/stats/statsFormat'

/*
  4 요약 카드 (Desktop.Status.png 상단 행 — RB-STAT-01 편차 분석의 집계 요약).
  Every card is 3 lines (label / value / caption) so the loading skeleton below
  can mirror that exact shape and cause zero layout shift (SYS-03 AC-3) — the
  common `statCard` preset was NOT reused here precisely because it ends in a
  4th "progress bar" line these cards don't have; a mismatched skeleton would
  itself be a CLS source the moment real data replaced it.

  Caption COLOR is never the only signal (NFR-017): the caption's own TEXT
  ("전주 대비" / "예상보다 오래" / "재계획 필요") already says what the tone is
  reinforcing, so a color-blind reader loses nothing by not seeing red/green.
*/

// 기간별로 "완료율"의 기준을 다르게 읽어야 해서(이번 주 대비/이번 달 대비 ...)
// 라벨 자체를 기간에 맞춰 바꾼다 — 값은 바뀌는데 라벨이 "주간 완료율"로 고정돼
// 있으면 "전체" 선택 시 오해를 부른다.
const COMPLETION_LABEL = {
  week: '주간 완료율',
  month: '월간 완료율',
  last3months: '최근 3개월 완료율',
  all: '전체 완료율',
}

const TONE_TEXT = {
  success: 'text-success-700',
  warning: 'text-warning-700',
  danger: 'text-danger-700',
  muted: 'text-text-muted',
}

function Caption({ tone, children }) {
  if (!children) return null
  return <p className={`mt-1 text-caption font-medium ${TONE_TEXT[tone]}`}>{children}</p>
}

function Card({ label, value, children }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <p className="text-caption text-text-muted">{label}</p>
      <p className="mt-1 text-title font-bold text-text tabular-nums">{value}</p>
      {children}
    </div>
  )
}

export function SummaryCards({ period, completionRate, totalTime, avgDeviation, delayedTaskCount }) {
  // avgDeviation.direction 'over'(예상보다 오래) / 'under'(예상보다 빠름) /
  // 'none'(예상과 거의 일치) — 세 값 모두 실제 렌더 경로를 갖도록 분기한다.
  const deviationCopy =
    avgDeviation?.direction === 'over'
      ? { tone: 'warning', text: '예상보다 오래' }
      : avgDeviation?.direction === 'under'
        ? { tone: 'success', text: '예상보다 빠름' }
        : { tone: 'muted', text: '예상과 비슷해요' }

  const delayedCopy =
    !delayedTaskCount || delayedTaskCount.count === 0
      ? { tone: 'success', text: '지연 태스크 없음' }
      : delayedTaskCount.needsReplan
        ? { tone: 'warning', text: '재계획 필요' }
        : { tone: 'muted', text: '확인 필요' }

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <Card label={COMPLETION_LABEL[period] ?? '완료율'} value={`${completionRate?.percent ?? 0}%`}>
        <Caption tone={completionRate?.deltaPercent > 0 ? 'success' : completionRate?.deltaPercent < 0 ? 'danger' : 'muted'}>
          {completionRate?.deltaPercent != null && completionRate?.comparisonLabel
            ? `${Math.abs(completionRate.deltaPercent)}% ${completionRate.comparisonLabel}`
            : null}
        </Caption>
      </Card>

      <Card label="총 수행 시간" value={formatHoursDecimal(totalTime?.performedMinutes ?? 0)}>
        <Caption tone="muted">
          {totalTime ? `예정 ${formatHoursDecimal(totalTime.plannedMinutes)} 중` : null}
        </Caption>
      </Card>

      <Card label="평균 시간 오차" value={formatSignedPercent(avgDeviation?.percent ?? 0)}>
        <Caption tone={deviationCopy.tone}>{deviationCopy.text}</Caption>
      </Card>

      <Card label="지연 태스크" value={`${delayedTaskCount?.count ?? 0}개`}>
        <Caption tone={delayedCopy.tone}>{delayedCopy.text}</Caption>
      </Card>
    </div>
  )
}

// Mirrors Card's exact 3-line shape (label/value/caption) so swapping this out
// for the real SummaryCards causes no layout shift.
export function SummaryCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-card border border-border p-4">
          <Skeleton width="45%" height="0.75rem" className="mb-2" />
          <Skeleton width="35%" height="1.5rem" className="mb-2" />
          <SkeletonText lines={1} />
        </div>
      ))}
    </div>
  )
}

export default SummaryCards
