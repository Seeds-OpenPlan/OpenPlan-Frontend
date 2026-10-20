/*
  OP function for the AI 설명 (plan explanation) feature on the weekly plan
  screen. One endpoint, no request body; the TanStack hook (usePlanData.js's
  useGeneratePlanExplanation) calls ONLY this — same "OP module per concern"
  split as replanApi.js/fixedScheduleApi.js, kept separate from planApi.js
  rather than added there so that file doesn't grow for an unrelated feature.

  LATENCY (BE 작업지시): the model call is usually 2~3s but can take up to
  15~20s on a cold start before the server's own fallback kicks in. apiClient's
  shared default timeout (client.js, 10s) would cut off a perfectly normal slow
  response as a client-side network error, so this call overrides it per-request
  to 25s — long enough to never fire before the server would have answered or
  itself given up.
*/

import { apiClient } from '../../api/client'
import { withDevFallback } from './planApi'
import { mockBackend } from './planFixtures'

// Any response the server sends that is missing a field still renders as
// something (never `undefined` reaching JSX) — the contract guarantees both
// fields, but normalizing defensively costs nothing and matches every other
// adapter in this domain (see planApi.normalizeBlock's own header).
function normalizeExplanation(raw) {
  return {
    explanation: raw?.explanation ?? '',
    model: raw?.model ?? null,
  }
}

/**
 * OP-PLAN-EXPLAIN → POST /weekly-plans/{weeklyPlanId}/explanation, 바디 없음.
 * 성공 시 `{ explanation, model }` — explanation은 마크다운이 아닌 한국어
 * 평문 3~6문장(계약). 실패(모델 일시 불가 등 503 계열 포함)는 이 앱 공통의
 * AppError로 그대로 올라간다 — 호출부(PlanExplanationPanel)가 상태 코드별로
 * 다른 문구를 보여줘야 하므로 여기서 에러를 삼키거나 토스트로 뭉개지 않는다.
 */
export function generatePlanExplanation(weeklyPlanId) {
  return withDevFallback(
    () =>
      apiClient.post(`/weekly-plans/${weeklyPlanId}/explanation`, null, {
        timeout: 25000,
      }),
    () => mockBackend.generatePlanExplanation(weeklyPlanId),
  ).then(normalizeExplanation)
}
