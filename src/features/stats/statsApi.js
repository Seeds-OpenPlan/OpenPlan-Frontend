/*
  OP-STATS-CORRECTION → GET /stats/correction-proposals?category=... ([가정—
  신규], ST-F1-09 AC-2). Not in the 07 API 명세서 — this is the suggestion
  chip's own data source. Lives in a `stats` feature folder (not `task` or
  `project`) because it is conceptually a STATS-owned computation (recent
  actual-vs-estimate deviation for a category), matching where a future real
  통계 화면 (ST-F1-11) would also read it from. Reuses planApi's own
  withDevFallback (the shared mock-fallback rule — see that function's own
  header) rather than redefining it a third time, the same choice
  dashboardApi.js already made.
*/
import { apiClient } from '../../api/client'
import { withDevFallback } from '../plan/planApi'
import { snapDuration } from '../plan/planTime'
import { mockBackend } from './statsFixtures'
import { TIME_BANDS } from './statsConstants'
import { unwrapList } from '../../api/unwrap'

/**
 * Returns `{ category, suggestedMinutes, sampleSize }`, or `null` when no
 * proposal exists for `category` — including a null/empty category ("없음"),
 * which short-circuits WITHOUT a request: "없음" can never have a correction
 * proposal by definition, so there is nothing to ask the server.
 *
 * `suggestedMinutes` is snapped to the 5-minute grid here (read boundary):
 * this is a recent-deviation AVERAGE the server computes, which has no
 * reason to land on a 5-minute multiple on its own, yet TaskEditModal's AC-2
 * "제안 칩" applies it straight into the task's `estimatedMinutes` field on
 * one click — bypassing the MinuteStepper (step 5) entirely, unlike every
 * other way that field gets set. Snapping here, not at the click handler,
 * keeps the chip's OWN displayed label ("최근 … 편차 반영: N분") consistent
 * with what actually gets applied, rather than showing one number and
 * setting another.
 */
export function getCorrectionProposal(category) {
  if (!category) return Promise.resolve(null)
  return withDevFallback(
    () => apiClient.get('/stats/correction-proposals', { params: { category } }),
    () => mockBackend.getCorrectionProposal(category),
  ).then((r) => (r ? { ...r, suggestedMinutes: snapDuration(r.suggestedMinutes) } : r))
}

// --- ST-F1-11: 수행 통계 -----------------------------------------------------

// A resolved payload counts as "no data" when it isn't a real object — this
// still covers `null`/`undefined`/`''` as a LEGACY defensive branch (a bare
// 204 would resolve through axios as an empty body). Kept as a fallback only:
// [버그 수정 2026-08] the real server does NOT 204 here — it answers 200 with a
// `empty: true` flag inside the body (curl-확인, 정본 openapi-live-76c7009.yaml
// StatsSummary.empty). Before this fix `isEmptyPayload` was the ONLY empty
// check, so a real "이력 0" response (a normal object, just `empty: true`)
// fell through to the "has data" branch below and rendered a card grid full of
// nulls instead of AC-4's EmptyState — see `normalizeSummaries`'s own use of
// `raw.empty` for the actual signal now used.
function isEmptyPayload(raw) {
  return !raw || typeof raw !== 'object'
}

/**
 * OP-STATS-SUMMARIES → GET /stats/summaries?period= (ST-F1-11 AC-1 · AC-4).
 * `period` is one of STATS_PERIODS' values (statsConstants.js) — already the
 * wire enum (WEEKLY/MONTHLY), so it is passed straight through with no
 * translation layer.
 *
 * AC-4's "이력 0" reads off `raw.empty` (see normalizeSummaries) — the 204
 * branch below (`isEmptyPayload`) stays only as a defensive fallback in case a
 * future backend revision reintroduces it; the real contract as measured now
 * always returns 200.
 */
export function getStatsSummaries(period) {
  return withDevFallback(
    () => apiClient.get('/stats/summaries', { params: { period } }),
    () => mockBackend.getStatsSummaries(period),
  ).then((raw) => normalizeSummaries(raw, period))
}

// StatsSummary(계약)엔 completionRate/totalEstimatedMinutes/totalActualMinutes/
// varianceRate/empty 5개 필드뿐이다("SC-06 유지 4종" — summary 주석 참고) —
// projectInvestments/delayedTasks/delayedTaskCount는 계약에 아예 없어서, 그
// 값을 읽던 화면(ProjectInvestmentList/DelayedTaskList, SummaryCards의 "지연
// 태스크" 카드)은 통째로 뺐다(StatisticsPage.jsx/SummaryCards.jsx 참고) — 없는
// 데이터를 0이나 빈 배열로 채워 "실적이 0"처럼 보이게 하지 않기 위해서다.
function normalizeSummaries(raw, period) {
  if (isEmptyPayload(raw) || raw.empty) {
    return {
      period,
      hasHistory: false,
      completionRate: null,
      totalEstimatedMinutes: null,
      totalActualMinutes: null,
      varianceRate: null,
    }
  }
  return {
    period,
    hasHistory: true,
    completionRate: raw.completionRate ?? null,
    totalEstimatedMinutes: raw.totalEstimatedMinutes ?? null,
    totalActualMinutes: raw.totalActualMinutes ?? null,
    varianceRate: raw.varianceRate ?? null,
  }
}

/**
 * OP-STATS-DEVIATIONS → GET /stats/deviations?groupBy=&period= (ST-F1-11 AC-2).
 * `groupBy`/`period` are both required wire enums (계약: PROJECT|CATEGORY,
 * WEEKLY|MONTHLY — statsConstants.js's DEVIATION_GROUP_BYS/STATS_PERIODS
 * already store those exact values, so no translation layer needed here).
 *
 * [버그 수정 2026-08] DeviationReport(정본)의 실제 envelope key는 `rows`, 이
 * 함수가 원래 읽던 `groups`가 아니다 — 실 서버에서는 항상 빈 배열로 읽혀
 * 편차 패널이 "비교할 수 있는 편차 데이터가 없습니다"만 보여 줬다(콘솔 에러도
 * 없어 발견이 늦어짐). `unwrapList`가 배열-vs-객체 envelope 방어는 그대로 하되
 * 키 이름만 고쳤다.
 *
 * Every row the server sends back is passed through AS-IS — this function does
 * not filter anything out, which is what keeps AC-2's "'없음' 그룹도 표시" true
 * structurally instead of by a special case here.
 */
export function getStatsDeviations(groupBy, period) {
  return withDevFallback(
    () => apiClient.get('/stats/deviations', { params: { groupBy, period } }),
    () => mockBackend.getStatsDeviations(groupBy, period),
  ).then((raw) => unwrapList(raw, 'rows').map(normalizeDeviationGroup))
}

// DeviationReport.rows(계약)엔 sampleSize가 없다 — 대신 `deviationRate`가
// nullable이고, 그 그룹에 실적이 하나도 없을 때 null로 온다(completionRate가
// 같은 방식으로 "기록 없음"을 표시하는 것과 같은 계약 관례). 그래서 예전처럼
// "표본 개수" 흉내를 내는 숫자를 지어내는 대신 `hasData` boolean 하나로 그
// 신호를 그대로 옮긴다 — DeviationPanel.jsx도 이 이름으로 맞춰 고쳤다.
function normalizeDeviationGroup(g) {
  return {
    key: g.groupId ?? g.groupName ?? null,
    label: g.groupName ?? '없음',
    deviationMinutes: g.deviationMinutes ?? 0,
    hasData: g.deviationRate !== null && g.deviationRate !== undefined,
  }
}

/**
 * OP-STATS-TIMEPATTERNS → GET /stats/time-patterns?period= (ST-F1-11 AC-3).
 *
 * [버그 수정 2026-08] 이전 어댑터는 서버가 시간별 원자료(`efficiencyByHour`)를
 * 주고 FE가 4구간으로 합산한다고 가정했다 — 정본 TimePatternReport를 다시
 * 확인해 보니 실제로는 서버가 이미 DAWN/MORNING/AFTERNOON/NIGHT 4개 slot으로
 * 집계해서 준다(`slots: [{slot, totalCount, completedCount, completionRate}]`).
 * per-hour 합산 로직 자체가 없는 필드를 읽고 있었던 것 — 지금은 그 4개
 * slot을 TIME_BANDS(statsConstants.js)의 `slot` enum으로 그대로 찾아 매핑만
 * 한다. 구간 경계를 바꾸는 일은 이제 백엔드 쪽 변경이다(그래서 statsConstants.js
 * 쪽 주석도 "이 파일만 고쳐서는 안 된다"로 갱신함).
 */
export function getStatsTimePatterns(period) {
  return withDevFallback(
    () => apiClient.get('/stats/time-patterns', { params: { period } }),
    () => mockBackend.getStatsTimePatterns(period),
  ).then((raw) => normalizeTimePatterns(raw))
}

function normalizeTimePatterns(raw) {
  const bySlot = new Map((raw?.slots ?? []).map((s) => [s.slot, s]))
  const bands = TIME_BANDS.map((band) => {
    const entry = bySlot.get(band.slot)
    return {
      key: band.key,
      label: band.label,
      // 서버가 `completionRate: null`로 이미 "기록 없음"을 표시해 준다(AC-3의
      // "무데이터 구간은 0%와 명확히 구분" 요구를 서버가 계약으로 보장) — FE가
      // totalCount로 다시 판정할 필요가 없다, 그대로 옮기기만 한다.
      rate: entry?.completionRate ?? null,
      totalCount: entry?.totalCount ?? 0,
    }
  })
  return { bands, summary: summarizeTimeBands(bands) }
}

// One Korean sentence naming the band with the highest completion rate, e.g.
// "오전에 완료율이 가장 높아요 (79%)." — mirrors the reference design's own
// summary line under the chart. Falls back to a neutral, non-alarming sentence
// when every band is "기록 없음" (no ties are special-cased: reduce picks the
// first max, which is fine — the copy only ever names ONE band).
function summarizeTimeBands(bands) {
  const withData = bands.filter((b) => b.rate !== null)
  if (withData.length === 0) return '아직 시간대별 완료 기록이 없어요.'
  const top = withData.reduce((best, b) => (b.rate > best.rate ? b : best))
  return `${top.label}에 완료율이 가장 높아요 (${top.rate}%).`
}

export default getCorrectionProposal
