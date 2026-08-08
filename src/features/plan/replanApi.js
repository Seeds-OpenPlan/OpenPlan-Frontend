/*
  OP functions for the replan-alternatives modal (ST-F1-07 — PLAN-29). Each maps
  1:1 to an endpoint; consumers (usePlanData's useReplanOptions/useApplyReplanOption)
  call ONLY these. Same DEV mock-fallback rule as planApi/taskApi/scheduleApi.

  ENDPOINT NOTE — apply (W4 — corrects this header's own prior note, which had
  it backwards): `openapi.yaml`'s `applyReplanOption` is POST
  `/replan-options/{optionId}/application`, no body — exactly what the 작업지시
  said all along. The PATCH `/replan-options/{id}/selection` `{isSelected}`
  shape this file used to follow was this repo's own guess from the 07번 API
  명세서 CSV, retired 2026-07-24; `openapi.yaml` (BE-1's Swagger source) is now
  the ONE spec this repo treats as authoritative for any endpoint it documents
  — same correction as planApi's validate/save endpoint notes.

  ENDPOINT NOTE — list: `openapi.yaml` DOES document a GET list endpoint after
  all (operationId `listReplanOptions`, `GET /weekly-plans/{planId}/replan-
  options` — reusing generateReplanOption's own path, distinguished by verb).
  This corrects this header's own prior claim that no such endpoint existed
  (true of the retired 07 CSV, not of openapi.yaml). Still no caller here for
  it, on purpose (out of THIS change's scope) — POST generate's own response
  already carries the option(s) for the strategy just requested, so nothing in
  this app has needed to re-fetch a list yet; see usePlanData.js's
  useReplanOptions for how the three per-strategy responses are assembled into
  the 4-way comparison. A future "새로고침" affordance on the compare modal
  (openapi's own summary: "대안 재조회 (비교 화면 새로고침)") is the first
  caller `listReplanOptions` would actually need.
*/

import { apiClient } from '../../api/client'
import { withDevFallback } from './planApi'
import { mockBackend } from './planFixtures'

// Denormalize one server replan_options row (ERD §"replan_options") to the shape
// the modal reads. `proposedBlocks` carries the FULL block set this option would
// replace the week with (not a diff) — needed both to show a meaningful compare
// and, later, so a real server implementation of PATCH .../selection has a whole
// snapshot to apply rather than a partial one.
function normalizeReplanOption(raw) {
  return {
    replanOptionId: raw.replanOptionId ?? raw.replan_option_id,
    strategyType: raw.strategyType ?? raw.strategy_type,
    changeSummary: raw.changeSummary ?? raw.change_summary ?? '',
    recommendationReason: raw.recommendationReason ?? raw.recommendation_reason ?? '',
    score: raw.score ?? null,
    proposedBlocks: raw.proposedBlocks ?? raw.proposed_blocks ?? [],
  }
}

/**
 * OP-REPLAN-GEN → POST /weekly-plans/{id}/replan-options, body {strategyType}.
 *
 * ASSUMPTION (flagged to the team lead — the spec doesn't say either way): the
 * request body carries exactly ONE strategyType, so this call is made ONCE PER
 * STRATEGY rather than once for all three — see usePlanData.js's
 * useReplanOptions, which calls this three times in parallel. The response is
 * still an ARRAY (`replanOptions: []`) even for one strategyType — the ERD's
 * `score` field implies the server MAY rank several candidates under one
 * strategy — so this keeps only the top-scored entry (or the first, if no
 * option carries a score) as "the" alternative representing that strategy.
 *
 * Resolves to `null` when the server has nothing to propose for this strategy
 * (e.g. nothing currently conflicts, for MINIMAL_CHANGE) — a legitimate result,
 * not an error; the caller renders that as "제안할 변경 사항이 없습니다", not a
 * failed card.
 */
export function generateReplanOption(weeklyPlanId, strategyType) {
  return withDevFallback(
    () => apiClient.post(`/weekly-plans/${weeklyPlanId}/replan-options`, { strategyType }),
    () => mockBackend.generateReplanOption(weeklyPlanId, strategyType),
  ).then((r) => {
    const options = (r?.replanOptions ?? []).map(normalizeReplanOption)
    if (options.length === 0) return null
    return options.reduce((best, o) => ((o.score ?? 0) > (best.score ?? 0) ? o : best))
  })
}

/**
 * OP-REPLAN-APPLY → POST /replan-options/{optionId}/application, no body (W4 —
 * see this file's own header for why the endpoint moved from the old PATCH
 * `.../selection` guess). Response is now a full `WeeklyPlanView` ("반영 후
 * 주간 화면 최신 상태", openapi.yaml's own description) rather than the old
 * `{ message }` this function used to expect — but the caller still only
 * REFETCHES the week rather than consuming this payload directly
 * (useApplyReplanOption's `onSuccess` ignores `_data` and invalidates the week
 * query). That is not a mismatch to fix here: this adapter has never unwrapped
 * the WeeklyPlanView envelope (`{plan, blocks, fixedSchedules, ...}` — same
 * gap flagged, and left alone, on planApi.getWeek's own W4 header), and
 * `saveWeek` follows the identical "ignore the resolved value, invalidate and
 * refetch" pattern for the exact same reason — consistent with how the rest
 * of this domain already treats a write's response as a signal, not a source
 * of truth, until that envelope gets a real adapter.
 *
 * A 409 here means the option is no longer applicable (a plan that moved on
 * since this batch was generated, or the option was already applied) — it
 * carries no `details.latest`, unlike E-COM-006, so OVL-CONFLICT's 3-choice UI
 * has nothing to render for it. The caller's job is simply "다시 생성 유도"
 * (AC-3): re-open the generation step, not a version-diff overlay.
 */
export function selectReplanOption(replanOptionId) {
  return withDevFallback(
    () => apiClient.post(`/replan-options/${replanOptionId}/application`),
    () => mockBackend.selectReplanOption(replanOptionId),
  )
}
