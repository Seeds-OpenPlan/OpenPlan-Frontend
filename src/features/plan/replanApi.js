/*
  OP functions for the replan-alternatives modal (ST-F1-07 — PLAN-29). Each maps
  1:1 to an endpoint; consumers (usePlanData's useReplanOptions/useApplyReplanOption)
  call ONLY these. Same DEV mock-fallback rule as planApi/taskApi/scheduleApi.

  ENDPOINT NOTE — apply: the 작업지시 writes the apply step as POST
  `.../application` (api-contracts.md §2.7 mirrors that verbatim). The BE 명세서
  (07번) instead documents PATCH `/replan-options/{id}/selection` with body
  `{isSelected}`, and the ERD's replan_options row carries `is_selected` /
  `selected_at` fields that match THAT shape — not "application" — exactly. This
  file follows the 07 spec + ERD (same precedent as planApi's validate/save
  endpoint notes: 07 wins when it disagrees with the 작업지시).

  ENDPOINT NOTE — list: the 07 spec has NO GET list endpoint for replan-options
  at all (api-contracts.md's OP-REPLAN-LIST doesn't correspond to anything in the
  07 CSV). This isn't a gap in practice: POST generate's OWN response already
  carries the option(s) for the strategy just requested, so nothing here ever
  needs to re-fetch a list — see usePlanData.js's useReplanOptions for how the
  three per-strategy responses are assembled into the 4-way comparison.
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
 * OP-REPLAN-APPLY → PATCH /replan-options/{id}/selection, body {isSelected:true}.
 * Returns only `{ message }` (no updated week) — the caller refetches the week
 * to see the swapped blocks (useApplyReplanOption's onSuccess).
 *
 * A 409 here means the option is no longer applicable (the 07 spec's own case is
 * "이미 선택된 재계획 대안"; a plan that moved on since this batch was generated
 * would plausibly land here too) — it carries no `details.latest`, unlike
 * E-COM-006, so OVL-CONFLICT's 3-choice UI has nothing to render for it. The
 * caller's job is simply "다시 생성 유도" (AC-3): re-open the generation step, not
 * a version-diff overlay.
 */
export function selectReplanOption(replanOptionId) {
  return withDevFallback(
    () => apiClient.patch(`/replan-options/${replanOptionId}/selection`, { isSelected: true }),
    () => mockBackend.selectReplanOption(replanOptionId),
  )
}
