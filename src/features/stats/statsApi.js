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
import { mockBackend } from './statsFixtures'
import { TIME_BANDS } from './statsConstants'

/**
 * Returns `{ category, suggestedMinutes, sampleSize }`, or `null` when no
 * proposal exists for `category` — including a null/empty category ("없음"),
 * which short-circuits WITHOUT a request: "없음" can never have a correction
 * proposal by definition, so there is nothing to ask the server.
 */
export function getCorrectionProposal(category) {
  if (!category) return Promise.resolve(null)
  return withDevFallback(
    () => apiClient.get('/stats/correction-proposals', { params: { category } }),
    () => mockBackend.getCorrectionProposal(category),
  )
}

// --- ST-F1-11: 수행 통계 -----------------------------------------------------

// A resolved payload counts as "no data" when it isn't a real object — this
// covers BOTH shapes an empty read can arrive in: `null`/`undefined` (a mock
// or an already-unwrapped envelope with nothing in `data`), and `''` (what
// apiClient's response interceptor hands back for a real 204 with an empty
// body, per the 07 API 명세서's own "204: 조회 기간 내 통계 없음" branch for
// /stats/summaries). Treating both the same way means AC-4's empty state is
// ready the moment the real backend starts sending 204s — no adapter change.
function isEmptyPayload(raw) {
  return !raw || typeof raw !== 'object'
}

/**
 * OP-STATS-SUMMARIES → GET /stats/summaries?period= (ST-F1-11 AC-1 · AC-4).
 * `period` is one of STATS_PERIODS' values (statsConstants.js).
 *
 * AC-4's "이력 0" is NOT a client-invented flag — it IS the 204 branch the 07
 * API 명세서 documents for this exact endpoint. A 204 resolves through axios
 * (2xx never rejects) as an empty body, so `isEmptyPayload` catches it here and
 * normalizes to `hasHistory: false` with every section nulled out, instead of
 * `StatisticsPage` having to separately guess "were all these zeros, or was
 * there nothing to measure?" from zeroed numbers alone.
 */
export function getStatsSummaries(period) {
  return withDevFallback(
    () => apiClient.get('/stats/summaries', { params: { period } }),
    () => mockBackend.getStatsSummaries(period),
  ).then((raw) => normalizeSummaries(raw, period))
}

function normalizeSummaries(raw, period) {
  if (isEmptyPayload(raw)) {
    return {
      period,
      hasHistory: false,
      completionRate: null,
      totalTime: null,
      avgDeviation: null,
      delayedTaskCount: null,
      projectInvestments: [],
      delayedTasks: [],
    }
  }
  return {
    period,
    hasHistory: true,
    completionRate: raw.completionRate ?? null,
    totalTime: raw.totalTime ?? null,
    avgDeviation: raw.avgDeviation ?? null,
    delayedTaskCount: raw.delayedTaskCount ?? null,
    projectInvestments: raw.projectInvestments ?? [],
    delayedTasks: raw.delayedTasks ?? [],
  }
}

/**
 * OP-STATS-DEVIATIONS → GET /stats/deviations?groupBy=&period= (ST-F1-11 AC-2).
 *
 * ENDPOINT NOTE [가정-확장]: the 07 API 명세서 documents this route with NO query
 * params and a single flat `{plannedTime, actualTime}` pair (one aggregate, not
 * a breakdown) — too thin for AC-2's "프로젝트별/카테고리별 목록" toggle.
 * `groupBy`/`period` are added here as the FE-adopted contract, the same
 * "adopt the shape the screen needs now, reconcile against real Swagger later"
 * move dashboardApi.js's own header documents for `/dashboard`.
 *
 * Every group the server sends back is passed through AS-IS, including a
 * `sampleSize: 0` row (e.g. a category nobody has ever logged a task under) —
 * this function does not filter anything out, which is what keeps AC-2's
 * "'없음' 그룹도 표시" true structurally instead of by a special case here.
 */
export function getStatsDeviations(groupBy, period) {
  return withDevFallback(
    () => apiClient.get('/stats/deviations', { params: { groupBy, period } }),
    () => mockBackend.getStatsDeviations(groupBy, period),
  ).then((raw) => (raw?.groups ?? (Array.isArray(raw) ? raw : [])).map(normalizeDeviationGroup))
}

function normalizeDeviationGroup(g) {
  return {
    key: g.key ?? g.category ?? g.projectId ?? null,
    label: g.label ?? g.name ?? '없음',
    deviationMinutes: g.deviationMinutes ?? 0,
    sampleSize: g.sampleSize ?? 0,
  }
}

/**
 * OP-STATS-TIMEPATTERNS → GET /stats/time-patterns?period= (ST-F1-11 AC-3).
 *
 * ENDPOINT NOTE [가정-확장]: same `period` extension as getStatsDeviations
 * above; the 07 API 명세서's sample body only shows `efficiencyByHour: []` with
 * no documented element shape, so `{hour, completedCount, totalCount}` per
 * entry is this adapter's own assumption pending a real Swagger definition.
 *
 * The 4구간(새벽/오전/오후/야간) aggregation happens HERE, not on the server
 * (팀리드 결정: "4구간 완료율은 FE에서 집계") — time-patterns stays the raw
 * per-hour source of truth, and TIME_BANDS (statsConstants.js) is the single
 * place the hour→band mapping lives, so changing the split later is a one-file
 * edit, not a hunt through every consumer.
 */
export function getStatsTimePatterns(period) {
  return withDevFallback(
    () => apiClient.get('/stats/time-patterns', { params: { period } }),
    () => mockBackend.getStatsTimePatterns(period),
  ).then((raw) => normalizeTimePatterns(raw))
}

function normalizeTimePatterns(raw) {
  const byHour = new Map((raw?.efficiencyByHour ?? []).map((e) => [e.hour, e]))
  const bands = TIME_BANDS.map((band) => {
    let completed = 0
    let total = 0
    for (const hour of band.hours) {
      const entry = byHour.get(hour)
      if (entry) {
        completed += entry.completedCount ?? 0
        total += entry.totalCount ?? 0
      }
    }
    return {
      key: band.key,
      label: band.label,
      // `total === 0` means this band has NO tracked executions at all — AC-3
      // requires that to read as "기록 없음", visibly different from a real 0%
      // (a band WITH executions that all happened to be missed). `rate: null`
      // is the one signal TimeBandChart needs to tell the two apart; it never
      // has to re-derive "no data" from a suspiciously-round 0 itself.
      rate: total > 0 ? Math.round((completed / total) * 100) : null,
      totalCount: total,
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
