const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Shared day-math for ACCT-04/05 (+ ACCT-06's expired sub-state). Two very
 * different callers need the exact same formula to agree on when "expired"
 * flips true:
 *   - authFixtures.js's own `login()` mock — computes this straight from a
 *     user record for the E-AUTH-008 (비활성화된 계정) error `details` (no
 *     account resource fetch happens pre-login).
 *   - OvlAccountReactivate's SettingsAccountPage caller — derives the same
 *     shape from useAccount()'s already-fetched `deactivatedAt`/
 *     `reactivationDeadlineDays` fields.
 * Pulled out to its own (non-component) module rather than living inside
 * either file, so react-refresh's "a file exporting a component must only
 * export components" rule doesn't force one of them to duplicate the math
 * instead of importing it.
 */
export function deriveReactivationInfo({ deactivatedAt, reactivationDeadlineDays }) {
  const daysSince = Math.floor((Date.now() - new Date(deactivatedAt).getTime()) / DAY_MS)
  const daysRemaining = reactivationDeadlineDays - daysSince
  return {
    reactivationDeadlineDays,
    daysRemaining: Math.max(daysRemaining, 0),
    // true면 유예기간을 넘겨 데이터가 이미 삭제 처리된 것으로 취급(ACCT-06) —
    // 재활성화 버튼 대신 삭제 안내 + 재가입 유도로 분기.
    deletionEligible: daysRemaining <= 0,
  }
}

export default deriveReactivationInfo
