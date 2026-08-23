import { Skeleton, SkeletonText } from '../common/Skeleton'
import { formatHoursDecimal, formatSignedPercent } from '../../features/stats/statsFormat'

/*
  3 요약 카드 (Desktop.Status.png 상단 행 — RB-STAT-01 편차 분석의 집계 요약).
  Every card is 3 lines (label / value / caption) so the loading skeleton below
  can mirror that exact shape and cause zero layout shift (SYS-03 AC-3) — the
  common `statCard` preset was NOT reused here precisely because it ends in a
  4th "progress bar" line these cards don't have; a mismatched skeleton would
  itself be a CLS source the moment real data replaced it.

  Caption COLOR is never the only signal (NFR-017): the caption's own TEXT
  ("예상보다 오래" / "예상과 비슷해요" 등) already says what the tone is
  reinforcing, so a color-blind reader loses nothing by not seeing red/green.

  [버그 수정 2026-08] 원래 4장(완료율/총 수행 시간/평균 시간 오차/지연 태스크)
  이었으나, 정본 StatsSummary(openapi-live-76c7009.yaml)엔 "지연 태스크" 카드가
  읽던 `delayedTaskCount`가 아예 없다 — 계약이 유지하는 필드는 completionRate·
  totalEstimatedMinutes·totalActualMinutes·varianceRate 4개뿐("SC-06 유지 4종").
  없는 데이터를 0개로 채워 "지연 없음"처럼 보이게 하는 대신 카드 자체를 뺐다
  (statsApi.js normalizeSummaries의 같은 주석 참고). completionRate도 계약엔
  비교/증감(deltaPercent) 없이 단일 숫자만 있어 그 캡션 줄도 함께 뺐다.
*/

// 기간별로 "완료율"의 기준을 다르게 읽어야 해서(이번 주 대비/이번 달 대비)
// 라벨 자체를 기간에 맞춰 바꾼다 — 값은 바뀌는데 라벨이 고정돼 있으면 오해를
// 부른다. key는 STATS_PERIODS의 wire enum(WEEKLY/MONTHLY)과 그대로 맞춘다.
const COMPLETION_LABEL = {
  WEEKLY: '주간 완료율',
  MONTHLY: '월간 완료율',
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

export function SummaryCards({ period, completionRate, totalEstimatedMinutes, totalActualMinutes, varianceRate }) {
  // 계약엔 avgDeviation.direction 같은 별도 필드가 없다 — varianceRate 부호로
  // 직접 방향을 나눈다: 양수=예상보다 오래, 음수=예상보다 빠름, 0/null=거의
  // 일치. 세 값 모두 실제 렌더 경로를 갖도록 분기하는 것은 이전과 동일.
  const deviationCopy =
    varianceRate > 0
      ? { tone: 'warning', text: '예상보다 오래' }
      : varianceRate < 0
        ? { tone: 'success', text: '예상보다 빠름' }
        : { tone: 'muted', text: '예상과 비슷해요' }

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
      {/* [불확실] completionRate/varianceRate가 0~100 스케일이라고 가정하고
          그대로 `%`를 붙인다 — 계약엔 스케일 표기가 없고 이 계정엔 아직 실제
          이력이 없어(전부 null) 실측으로 확인하지 못했다(statsFixtures.js의
          같은 주석 참고). 계약에 비교/증감값이 없어 예전의 "전주 대비" 캡션
          줄도 함께 뺐다 — Caption은 children이 없으면 아무것도 렌더하지 않아
          카드가 2줄로 줄어들 뿐, 값이 있다가 없어지는 것이 아니라 항상
          같은 모양이라 CLS는 발생하지 않는다. */}
      <Card label={COMPLETION_LABEL[period] ?? '완료율'} value={`${completionRate ?? 0}%`} />

      <Card label="총 수행 시간" value={formatHoursDecimal(totalActualMinutes ?? 0)}>
        <Caption tone="muted">
          {totalEstimatedMinutes != null ? `예정 ${formatHoursDecimal(totalEstimatedMinutes)} 중` : null}
        </Caption>
      </Card>

      <Card label="평균 시간 오차" value={formatSignedPercent(varianceRate ?? 0)}>
        <Caption tone={deviationCopy.tone}>{deviationCopy.text}</Caption>
      </Card>
    </div>
  )
}

// Mirrors Card's exact 3-line shape (label/value/caption) so swapping this out
// for the real SummaryCards causes no layout shift.
export function SummaryCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
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
