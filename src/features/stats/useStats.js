/*
  TanStack Query wiring for the stats feature's reads: the correction-proposal
  suggestion chip (ST-F1-09 AC-2) plus the 수행 통계 screen's three GETs
  (ST-F1-11).
*/
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import {
  getCorrectionProposal,
  getStatsSummaries,
  getStatsDeviations,
  getStatsTimePatterns,
} from './statsApi'

export const correctionProposalKey = (category) => ['correctionProposal', category]

/**
 * GET /stats/correction-proposals for the CURRENTLY selected category. Disabled
 * entirely while `category` is null/"" (없음) — see getCorrectionProposal's own
 * short-circuit — so switching to "없음" never fires a request just to throw
 * its result away.
 */
export function useCorrectionProposal(category) {
  return useQuery({
    queryKey: correctionProposalKey(category),
    queryFn: () => getCorrectionProposal(category),
    enabled: Boolean(category),
    staleTime: 5 * 60 * 1000,
  })
}

// --- ST-F1-11: 수행 통계 -----------------------------------------------------
// Query keys are namespaced under 'stats*' (distinct from the singular
// 'correctionProposal' above) and carry every param that changes the response
// shape (period, and for deviations also groupBy) — switching either toggle
// (AC-1/AC-2) is then just a key change, so TanStack Query caches each
// period/groupBy combination independently instead of refetching on every
// back-and-forth toggle.

export const statsSummariesKey = (period) => ['statsSummaries', period]
export const statsDeviationsKey = (groupBy, period) => ['statsDeviations', groupBy, period]
export const statsTimePatternsKey = (period) => ['statsTimePatterns', period]

/** GET /stats/summaries?period= — the 4 요약 카드 + 이번 주 투입/지연 태스크 목록. */
export function useStatsSummaries(period) {
  return useQuery({
    queryKey: statsSummariesKey(period),
    queryFn: () => getStatsSummaries(period),
    staleTime: 60 * 1000,
  })
}

/**
 * GET /stats/deviations?groupBy=&period= — 편차 분석 패널 (AC-2). `placeholderData:
 * keepPreviousData` so flipping the 프로젝트별/카테고리별 toggle keeps the PREVIOUS
 * group's rows on screen while the new group loads, instead of the panel
 * blanking to a skeleton — same call useWeekPlan (usePlanData.js) already makes
 * for week navigation ("이전 골격 유지", NFR-024). This query is deliberately
 * NOT part of StatisticsPage's page-level loading gate (see that file's own
 * comment) precisely so this keep-previous behavior is visible instead of
 * being masked by a full-page skeleton on every groupBy flip.
 */
export function useStatsDeviations(groupBy, period) {
  return useQuery({
    queryKey: statsDeviationsKey(groupBy, period),
    queryFn: () => getStatsDeviations(groupBy, period),
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
  })
}

/** GET /stats/time-patterns?period= — TimeBandChart의 원자료 (AC-3). */
export function useStatsTimePatterns(period) {
  return useQuery({
    queryKey: statsTimePatternsKey(period),
    queryFn: () => getStatsTimePatterns(period),
    staleTime: 60 * 1000,
  })
}

export default useCorrectionProposal
