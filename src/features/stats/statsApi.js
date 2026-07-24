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

export default getCorrectionProposal
