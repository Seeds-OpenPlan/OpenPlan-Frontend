/*
  Copy resolver for the dashboard's merged issue surface (S5 먼저 볼 문제, which
  absorbs S2 우선 행동 — see RiskList.jsx's own header). Rewritten for the real
  `DashboardView` contract (W6, 2026-08-23): `riskIssues[]` items carry
  `{ riskType, count, description, routePath }` and `priorityAction` carries
  `{ actionType, reason, routePath }` — NEITHER has a `code`, `severity`,
  `params`, or `label`/`message` pair anymore, so the old AC-3 rule ("카탈로그
  코드 매칭 시 violationCopy() 우선, 아니면 서버 문구") no longer has a code to
  match against. The dashboard's `riskType` enum (UNASSIGNED_TASKS/OUT_OF_WBS/
  FIXED_CONFLICT/DEADLINE_SOON) is its own taxonomy, distinct from PLAN-24~27's
  V-codes, and the server already sends a ready-made `description` sentence —
  reusing violationCatalog's templated message() with no `params` to fill it
  would only produce a WORSE string (placeholder nouns like "대상 블록") than
  just showing the server's own text, so this file no longer imports
  violationMessages' catalog at all. RiskList.jsx still imports that module's
  `severityLabels` directly (plain '차단'/'경고' KO word map, no code
  dependency) to turn the `severity` this function returns into a badge word —
  that reuse lives at the render call site, not here.
*/

// riskType has no severity field of its own in the contract — this table is a
// judgment call (no decision doc backs it), documented here so it's the one
// place to correct if product/BE later clarifies:
//  - FIXED_CONFLICT: 배치 자체가 불가능한 실제 충돌 → 차단.
//  - DEADLINE_SOON: 시간이 급하다는 성격상 차단으로 취급(경고로 묻히면 놓치기
//    쉽다).
//  - UNASSIGNED_TASKS / OUT_OF_WBS: 아직 배치가 안 됐거나 범위 밖일 뿐, 계획
//    자체를 막지는 않음 → 경고.
const RISK_SEVERITY = {
  FIXED_CONFLICT: 'blocking',
  DEADLINE_SOON: 'blocking',
  UNASSIGNED_TASKS: 'warning',
  OUT_OF_WBS: 'warning',
}

/**
 * @param {{riskType?: string, description?: string, reason?: string}} issue
 *   A raw `riskIssues[]` row (has `riskType`/`description`), OR a
 *   `priorityAction`-derived row (no `riskType` — has `reason` instead).
 * @returns {{severity: 'blocking'|'warning', text: string}}
 */
export function resolveIssueCopy(issue) {
  if (!issue?.riskType) {
    // priorityAction 파생 행: 서버가 이미 "가장 급한 하나"로 골라 준
    // 결과이므로 severity는 항상 blocking으로 취급한다 — 계약에 severity
    // 필드가 없어 내리는 판단값(리드 확인 요망, 위 RISK_SEVERITY와 같은
    // 성격의 가정).
    return { severity: 'blocking', text: issue?.reason ?? '' }
  }
  return {
    severity: RISK_SEVERITY[issue.riskType] ?? 'warning',
    text: issue.description ?? '',
  }
}

export default resolveIssueCopy
