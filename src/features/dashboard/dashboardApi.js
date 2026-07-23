/*
  OP-DASH-ASSEMBLE → GET /dashboard (ui-spec-dash.md intro · FE-1 작업지시
  ST-F1-10). The real 07번 API CSV only documents five separate dashboard
  endpoints (weekly-status · todo-items · risk-solutions · today-execution ·
  weekly-impact) — this single call is the FE-adopted contract pending BE-1
  actually shipping an assembly endpoint; every consumer (the page + the five
  section components) is written against the shape below, so the day BE-1
  either ships `/dashboard` as-is or FE has to fan out to the five endpoints
  itself, only THIS file's body changes.

  Same withDevFallback convention as planApi.js/taskApi.js — reused directly
  from planApi (not re-implemented) so the mock-fallback rule stays defined in
  exactly one place across every OP module.
*/
import { apiClient } from '../../api/client'
import { withDevFallback } from '../plan/planApi'
import { mockDashboard } from './dashboardFixtures'

/**
 * A section is present in the payload → pass it through as-is (including a
 * legitimate `null`, which several sections use for "nothing to show" —
 * priorityAction: null is the AC-3 긍정 카드, risks: [] is "지금 볼 문제가
 * 없습니다"). A section MISSING from the payload (key absent → undefined) means
 * the assembly's own partial-failure case (§DASH.7) — normalized to a sentinel
 * object so the page can tell "this section failed" apart from "this section is
 * legitimately empty" without guessing at whatever shape the real error marker
 * turns out to be [가정, contract unconfirmed — same open question as
 * ux-flow-map §5's risk entry].
 */
function sectionOrError(value) {
  return value === undefined ? { error: true } : value
}

function normalizeDashboard(raw) {
  const data = raw ?? {}
  return {
    planStatus: data.planStatus ?? 'DRAFT',
    isEmpty: Boolean(data.isEmpty),
    weeklyStatus: sectionOrError(data.weeklyStatus),
    priorityAction: data.priorityAction === undefined ? { error: true } : data.priorityAction,
    todayExecution: sectionOrError(data.todayExecution),
    weeklyImpact: sectionOrError(data.weeklyImpact),
    risks: data.risks === undefined ? { error: true } : data.risks,
  }
}

export function getDashboard() {
  return withDevFallback(
    () => apiClient.get('/dashboard'),
    () => mockDashboard(),
  ).then(normalizeDashboard)
}

export default getDashboard
