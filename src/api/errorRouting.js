/*
  Single catalog mapping a normalized AppError to the UI surface that should
  handle it. This is the ONLY place error.code → surface routing lives; consumer
  code must not branch on error strings ad hoc (SS1 R1, story §2.4).

  Priority: error.code first, HTTP status as fallback. The full code catalog is
  now confirmed against the real backend (ErrorCode.java + errors.properties,
  실서버 대조 2026-08-03), so every code this app can actually receive gets its
  own explicit `case` below. The status-based branches in `default` are now a
  SAFETY NET ONLY — for a code this catalog doesn't know about yet (a future
  addition, or a typo'd envelope) — not a stand-in for a confirmed code.
*/

/**
 * @param {import('./client').AppError} appError
 * @returns {{ kind: string, surface?: string, variant?: string, handledBy?: string }}
 */
export function resolveErrorSurface(appError) {
  switch (appError.code) {
    // Handled inside the interceptor (token refresh); never reaches a screen.
    case 'E-COM-002':
      return { kind: 'REFRESH', handledBy: 'interceptor' }

    // Genuine optimistic-lock conflict (someone else saved this exact resource
    // first) → the 3-choice conflict overlay. `details.latest` is required.
    case 'E-COM-006':
      return { kind: 'CONFLICT', surface: 'OVL-CONFLICT' }

    case 'E-COM-003':
      return { kind: 'FORBIDDEN', surface: 'SCR-403' }

    case 'E-COM-004':
      return { kind: 'NOTFOUND', surface: 'SCR-404' }

    // Input failed server-side format/shape validation (details.fields carries
    // which ones) — the same inline surface a client-side field error uses.
    case 'E-COM-009':
      return { kind: 'VALIDATION', surface: 'inline' }

    // Rate limited. Distinct from a hard failure: the request itself was fine,
    // it just needs to be tried again after a pause — PTN-ERROR's copy/retry
    // action still applies, `variant` only tells the caller not to word it as
    // "something broke".
    case 'E-COM-007':
      return { kind: 'RATE_LIMITED', surface: 'PTN-ERROR', variant: 'retry-later' }

    // Service temporarily down. Same shape as 429 above (transient, retryable)
    // but a different cause worth logging separately.
    case 'E-COM-008':
      return { kind: 'UNAVAILABLE', surface: 'PTN-ERROR', variant: 'retry-later' }

    // NOT a race. The server re-ran validation on confirm/save and found
    // blocking items STILL present (PLAN-28) — the exact same "차단" state
    // ReviewPanel/PlanHeader already model for the client-side dry-run, just
    // discovered again server-side. `details.issues` carries the current
    // blocking list, same shape as the dry-run's own 200/206/409 body — the
    // caller re-syncs the review panel from it (see planApi.js's
    // normalizeValidationPayload, shared by both routes).
    //
    // CORRECTED 2026-08-03: this used to be routed to OVL-CONFLICT as a
    // "confirm race" (E-COM-006's job). That was a real bug — a user hitting
    // this 409 saw a false "다른 곳에서 먼저 저장되었습니다" 3-choice overlay for
    // what is actually a validation-gate rejection, nothing to do with a
    // concurrent edit. E-COM-006 above is the real race; this is not.
    case 'E-PLAN-004':
      return { kind: 'VALIDATION', surface: 'PNL-REVIEW' }

    // No response reached the server → offline surface.
    case 'E-NET-OFFLINE':
      return { kind: 'OFFLINE', surface: 'PTN-OFFLINE' }

    // --- auth/account states (ST-F1-14 surfaces) ---------------------------

    // Refresh-token/session itself is gone (distinct from E-COM-002's access-
    // token expiry, which the interceptor already retries transparently) →
    // the always-mounted re-login gate.
    case 'E-AUTH-007':
      return { kind: 'SESSION_EXPIRED', surface: 'OVL-SESSION' }

    // Account exists and the password is right, but it's locked. No dedicated
    // overlay exists yet — same inline slot LoginPage already renders E-AUTH-001
    // in (loginErrorCopy), just different copy.
    case 'E-AUTH-002':
      return { kind: 'ACCOUNT_LOCKED', surface: 'inline' }

    // Login blocked pending email verification → the verify-email screen,
    // matching what LoginPage's onError already does by hand (navigate there).
    case 'E-AUTH-005':
      return { kind: 'AUTH_UNVERIFIED', surface: 'SCR-AUTH-VERIFY' }

    // A verification/reset link is expired, already used, or malformed. Same
    // KIND for both — "this link no longer works" — different SURFACE because
    // the two links land on different screens (VerifyEmailPage vs
    // ResetPasswordPage each already render their own "링크가 유효하지 않습니다"
    // state for this).
    case 'E-AUTH-004':
      return { kind: 'AUTH_LINK_EXPIRED', surface: 'SCR-AUTH-VERIFY' }
    case 'E-AUTH-006':
      return { kind: 'AUTH_LINK_EXPIRED', surface: 'SCR-AUTH-RESET' }

    // Deactivated (still inside the reactivation window) vs permanently
    // deleted (window passed) — same overlay component, two branches
    // (OvlAccountReactivate's `deletionEligible` prop already models exactly
    // this split).
    case 'E-AUTH-008':
      return { kind: 'ACCOUNT_DEACTIVATED', surface: 'OVL-ACCT-REACT' }
    case 'E-AUTH-009':
      return { kind: 'ACCOUNT_DELETED', surface: 'OVL-ACCT-REACT' }

    // Endpoint not built on the real BE yet (auth surface is stub-only until
    // 4주차 — authApi.js's own header). Routed away from generic PTN-ERROR's
    // "문제가 발생했습니다" copy on purpose: that copy reads as a real bug during
    // dev, when this is actually "come back once BE-3 ships this route".
    case 'E-AUTH-011':
      return { kind: 'NOT_IMPLEMENTED', surface: 'PTN-ERROR', variant: 'not-implemented' }

    default:
      // Status fallbacks for a code this catalog doesn't recognize yet — NOT a
      // substitute for the explicit cases above, which now cover every 403/
      // 404/422 this app is documented to receive.
      if (appError.status === 403) return { kind: 'FORBIDDEN', surface: 'SCR-403' }
      if (appError.status === 404) return { kind: 'NOTFOUND', surface: 'SCR-404' }
      if (appError.status === 422) return { kind: 'VALIDATION', surface: 'inline' }
      // 5xx, E-COM-000 (unknown), and everything else → generic error surface.
      return { kind: 'GENERIC', surface: 'PTN-ERROR' }
  }
}

export default resolveErrorSurface
