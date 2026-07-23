/*
  Copy resolver for the dashboard's two issue surfaces (S2 우선 행동 · S5 먼저 볼
  문제). AC-3 rule: "카탈로그 코드 매칭 시 violationCopy() 우선, 아니면 서버 문구" —
  reuse the PLAN-24~27 violation catalog (violationMessages.js, P4's single
  source) when the server code matches a known V-rule, so a shared problem (e.g.
  a fixed-schedule conflict) reads with EXACTLY the same words here as it does in
  the weekly-plan review panel. A code the catalog doesn't know (this screen's
  own risks — an unplaced deadline task, a daily overrun — aren't PLAN-24~27
  violations at all) falls back to the server's own label/message verbatim,
  rather than the catalog's generic unknownViolation() copy ("검토 필요") — that
  fallback exists for an unrecognized VALIDATION code, not for a normal risk type
  this screen was always going to render server text for.
*/
import { violationCatalog, violationCopy, severityLabels } from '../plan/violationMessages'

/**
 * @param {{code?: string, severity?: string, params?: object, label?: string, message?: string}} issue
 * @returns {{code: string, severity: 'blocking'|'warning', label: string, text: string}}
 */
export function resolveIssueCopy(issue) {
  if (issue?.code && violationCatalog[issue.code]) {
    return violationCopy(issue)
  }
  // Server severity may arrive as any casing/word; only 'warning' opens the
  // gate to the softer label — everything else defaults to the safer 차단,
  // mirroring unknownViolation's own fail-safe direction (violationMessages.js).
  const severity = issue?.severity === 'warning' ? 'warning' : 'blocking'
  return {
    code: issue?.code ?? 'UNKNOWN',
    severity,
    label: issue?.label ?? severityLabels[severity],
    text: issue?.message ?? issue?.label ?? '',
  }
}

export default resolveIssueCopy
