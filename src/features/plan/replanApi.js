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
  options` — reusing generateReplanOptions' own path, distinguished by verb).
  This corrects this header's own prior claim that no such endpoint existed
  (true of the retired 07 CSV, not of openapi.yaml). Still no caller here for
  it, on purpose (out of THIS change's scope) — POST generate's own response
  already carries all three alternatives, so nothing in this app has needed to
  re-fetch a list yet; see usePlanData.js's useReplanOptions for how that one
  response is split across the three cards of the 4-way comparison. A future
  "새로고침" affordance on the compare modal (openapi's own summary: "대안
  재조회 (비교 화면 새로고침)") is the first caller `listReplanOptions` would
  actually need.
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
 * OP-REPLAN-GEN → POST /weekly-plans/{planId}/replan-options, 바디 없음.
 *
 * 정본(openapi.yaml `generateReplanOptions`)은 requestBody를 두지 않고, 한 번의
 * 호출로 기준선 + 대안 3종을 `data.options[]`에 함께 돌려준다.
 *
 * 이 함수는 그 계약이 확정되기 전의 추측을 따르고 있었다 — `{strategyType}` 바디를
 * 실어 전략별로 3회 호출하고, 응답을 `replanOptions`로 읽는 형태. 서버가 그 이름의
 * 필드를 준 적이 없어 결과가 항상 빈 배열 → null이 되었고, 그래서 실서버에서는 세
 * 카드가 전부 "제안할 변경 사항이 없습니다"로 굳고 [적용]이 영영 비활성이었다
 * (기준선만 프론트 상수라 유일하게 선택 가능했다).
 *
 * 🔴 전략별로 나눠 부르면 안 된다. 서버는 이 오퍼레이션마다 그 계획의 기존 대안을
 * **전면 교체**하므로(ReplanOptionController "재생성 시 기존 대안 전면 교체"),
 * 3회 호출하면 앞선 두 번의 replanOptionId가 DB에서 사라진 채 화면에만 남아 적용
 * 단계에서 404가 난다. 필드 이름만 고치고 호출 구조를 그대로 두면 증상이 "카드가
 * 안 뜬다"에서 "고르면 실패한다"로 옮겨갈 뿐이다.
 *
 * 응답의 `baseline`(KEEP_CURRENT)은 읽지 않는다 — 서버가 행을 만들지 않아 적용
 * 대상이 아니고, 모달은 replanStrategies.js의 BASELINE_OPTION 상수를 네 번째
 * 카드로 렌더한다.
 *
 * @returns {Promise<Array>} 전략별 대안 배열(정규화 완료). 서버가 제안할 것이
 *   하나도 없으면 빈 배열 — 오류가 아니다.
 */
export function generateReplanOptions(weeklyPlanId) {
  return withDevFallback(
    () => apiClient.post(`/weekly-plans/${weeklyPlanId}/replan-options`),
    () => mockBackend.generateReplanOptions(weeklyPlanId),
  ).then((r) => (r?.options ?? []).map(normalizeReplanOption))
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
