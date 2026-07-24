/*
  DEV-only mock for GET /stats/correction-proposals ([가정—신규], ST-F1-09
  AC-2 "제안 칩" — 최근 {카테고리} 편차 반영). No such endpoint exists in the
  07 API 명세서 yet. A real implementation would derive this from execution-
  record history (planned vs. actual minutes per category, ST-F1-04 PLAN-15
  logExecution) — this mock returns a fixed table instead so the suggestion
  chip is demonstrable without wiring that aggregation across two otherwise
  unrelated features (project tasks + plan execution records).

  Keyed by the SAME category strings projectFixtures.js seeds (CATEGORY_LIST).
  A category with NO entry here (자기계발) means AC-2's chip correctly stays
  hidden — that "no proposal" state is deliberately kept reachable, not just
  the "has one" state.
*/

const MOCK_LATENCY_MS = 60
const delay = (ms = MOCK_LATENCY_MS) => new Promise((resolve) => setTimeout(resolve, ms))

// category -> { suggestedMinutes, sampleSize }. suggestedMinutes is what the
// chip offers to fill the 예상시간 field with on click (never automatically).
const PROPOSALS = {
  코딩테스트: { suggestedMinutes: 75, sampleSize: 6 },
  취업준비: { suggestedMinutes: 100, sampleSize: 4 },
  // 자기계발: intentionally absent.
}

export const mockBackend = {
  async getCorrectionProposal(category) {
    await delay()
    const entry = PROPOSALS[category]
    if (!entry) return null
    return { category, ...entry }
  },
}

export default mockBackend
