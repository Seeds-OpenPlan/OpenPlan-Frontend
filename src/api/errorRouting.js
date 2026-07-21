/*
  Single catalog mapping a normalized AppError to the UI surface that should
  handle it. This is the ONLY place error.code → surface routing lives; consumer
  code must not branch on error strings ad hoc (SS1 R1, story §2.4).

  Priority: error.code first, HTTP status as fallback. The real error.code
  strings for 403/404/422 are not yet confirmed in the API contract, so those
  fall through to the status branches for now; when Swagger confirms them, add
  explicit `case` entries here — no other file changes (story §9.1-A).
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

    // Optimistic-lock conflict → the 3-choice conflict overlay.
    case 'E-COM-006':
      return { kind: 'CONFLICT', surface: 'OVL-CONFLICT' }

    // Confirmed race on a plan write — same overlay, distinct variant.
    case 'E-PLAN-004':
      return { kind: 'CONFLICT', surface: 'OVL-CONFLICT', variant: 'confirm-race' }

    // No response reached the server → offline surface.
    case 'E-NET-OFFLINE':
      return { kind: 'OFFLINE', surface: 'PTN-OFFLINE' }

    default:
      // Status fallbacks until exact codes are confirmed.
      if (appError.status === 403) return { kind: 'FORBIDDEN', surface: 'SCR-403' }
      if (appError.status === 404) return { kind: 'NOTFOUND', surface: 'SCR-404' }
      if (appError.status === 422) return { kind: 'VALIDATION', surface: 'inline' }
      // 5xx, E-COM-000 (unknown), and everything else → generic error surface.
      return { kind: 'GENERIC', surface: 'PTN-ERROR' }
  }
}

export default resolveErrorSurface
