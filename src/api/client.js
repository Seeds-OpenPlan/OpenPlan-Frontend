import axios from 'axios'
import { useSessionStore } from '../features/auth/sessionStore'

/*
  Single shared axios instance and the one place where the response envelope is
  unwrapped, errors are normalized to AppError, token refresh is triggered, and
  the trace id is logged. Consumer code (TanStack Query fns) sees only the
  unwrapped payload or an AppError — never a raw axios error, never the envelope
  (ADR-0004, story §2.3).

  This layer NEVER retries. Automatic GET retry lives solely in the QueryClient
  (ADR-0001) — putting a retry here too would double-retry (story §2.2).
*/

// 백엔드 API 기본 주소. 빌드 시 Vite가 import.meta.env로 주입한다.
const baseURL = import.meta.env.VITE_API_BASE_URL

// 개발 환경에서 값이 없으면 명확히 경고한다.
// 상대경로('')로 폴백해 앱이 죽지 않도록만 한다.
if (import.meta.env.DEV && !baseURL) {
  console.warn(
    '[api] VITE_API_BASE_URL이 설정되지 않았습니다. ' +
      '.env(.local)에 값을 지정하세요. 현재는 상대경로로 폴백합니다.',
  )
}

// 토큰 저장 확인(W4, 2026-08-08): 이 코드베이스 어디에도 access/refresh 토큰을
// 담는 localStorage/sessionStorage/Authorization 헤더가 없다 — 세션은 항상
// httpOnly Set-Cookie(op_at/op_rt)로만 오간다(위 token-refresh 코멘트 참조).
// `withCredentials`도 추가하지 않았다: dev는 Vite 프록시(vite.config.js
// `/api` → 실서버 13.208.66.211, changeOrigin), 배포는 nginx 단일 오리진(D-11)이라
// 브라우저 기준 항상 동일 출처 — 쿠키가 자동으로 실린다. 교차 출처가 되는
// 순간(예: 프록시 없이 별도 API 도메인 직접 호출)에만 이 설정이 필요해진다.
export const apiClient = axios.create({
  baseURL: baseURL ?? '',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

/**
 * Normalized error shape every consumer branches on. `code` and `status` are the
 * two inputs the retry policy (queryClient) and surface routing (errorRouting)
 * depend on, so they must always be present (story §2.3).
 *
 * @typedef {Object} AppError
 * @property {string} code       - envelope.error.code, or 'E-COM-000' (unknown),
 *                                  or 'E-NET-OFFLINE' (no response).
 * @property {number|null} status - HTTP status; null for network errors.
 * @property {unknown} details    - envelope.error.details, or null.
 * @property {string|null} traceId
 * @property {boolean} isNetwork  - true when a request was sent but no response came.
 * @property {Error} original
 */
export class AppError extends Error {
  constructor({ code, status, details, traceId, isNetwork, original }) {
    // message is for developer logs only; UI copy never reads it (R1: no message parsing).
    super(code)
    this.name = 'AppError'
    this.code = code
    this.status = status
    this.details = details
    this.traceId = traceId
    this.isNetwork = isNetwork
    this.original = original
  }
}

// Build a short unique id for request tracing. crypto.randomUUID is available in
// all target browsers (React 19 baseline); fall back defensively for old runtimes.
function makeTraceId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `trace-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

// Turn any axios failure into an AppError. Reads the error envelope's `code`
// only — never the human `message` (R1). Network failures (no response) become
// E-NET-OFFLINE so the offline surface and the retry policy share one input.
function normalizeError(error) {
  const response = error?.response
  const traceId = response?.headers?.['x-trace-id'] ?? null

  if (!response && error?.request) {
    return new AppError({
      code: 'E-NET-OFFLINE',
      status: null,
      details: null,
      traceId,
      isNetwork: true,
      original: error,
    })
  }

  const envelope = response?.data
  const code = envelope?.error?.code ?? 'E-COM-000'
  const details = envelope?.error?.details ?? null

  return new AppError({
    code,
    status: response?.status ?? null,
    details,
    traceId,
    isNetwork: false,
    original: error,
  })
}

// --- Request interceptor: inject a per-request trace id. ---
apiClient.interceptors.request.use(
  (config) => {
    config.headers = config.headers ?? {}
    if (!config.headers['X-Trace-Id']) {
      config.headers['X-Trace-Id'] = makeTraceId()
    }
    return config
  },
  (error) => Promise.reject(error),
)

// --- Response interceptor: unwrap envelope, refresh on 401, normalize errors. ---
apiClient.interceptors.response.use(
  // Success: hand the caller the unwrapped payload. `data.data` is the envelope
  // body; the `?? data` fallback tolerates non-enveloped responses defensively.
  //
  // META OPT-IN (W2 meta 유실 해소, docs/w2-connection-readiness.md §2/§6): the
  // envelope also carries `meta` (e.g. `meta.page` for paged lists), which the
  // default return value below still drops — on purpose. Dozens of *Api.js
  // call sites across the codebase already depend on this interceptor handing
  // back the BARE payload (an array, a task object, …), so changing the
  // default shape to `{data, meta}` for every caller would be a breaking
  // change repo-wide for the sake of the handful of callers that actually page.
  // Instead, a caller that needs `meta` sets `withMeta: true` on its OWN
  // request config (axios preserves unknown config keys onto `response.config`)
  // and gets `{data, meta}` back; every other request is unaffected. See
  // api/paging.js — the one place today that sets this flag, to walk paged
  // list endpoints (tasks/projects/support-tickets) page by page.
  (response) => {
    const payload = response.data?.data ?? response.data
    if (response.config?.withMeta) {
      return { data: payload, meta: response.data?.meta ?? null }
    }
    return payload
  },
  async (error) => {
    const appError = normalizeError(error)
    const config = error?.config ?? {}

    // Token refresh on 401. Two guards prevent infinite recursion:
    //  1. config._retry — blocks re-refreshing the SAME original request twice.
    //  2. config._skipAuthRefresh — set on the refresh call itself so that if
    //     the refresh token is also expired (refresh returns 401), it does NOT
    //     re-trigger this branch; it normalizes straight to an AppError and is
    //     delegated to the session surface below. Story §2.3 N-3.
    //
    // 판정 기준이 code에서 status로 바뀌었다(W5 인증 실연결, 2026-08-18).
    // 실서버 ErrorCode.java에 401은 넷이다 — E-COM-002(인증 필요) ·
    // E-AUTH-001(로그인 실패) · E-AUTH-002 · E-AUTH-007(refresh 무효/만료).
    // `code === 'E-COM-002'` 하나만 보던 동안 나머지 셋은 갱신도 만료 처리도
    // 받지 못하고 그대로 호출부로 떨어졌다(팀장 지적: "401이 뜨는데 코드
    // 상으로는 401 처리가 없다"). 세션이 없는 것이 정상인 호출 — 로그인·가입·
    // 메일인증·비밀번호 재설정 — 은 authApi.js가 자기 요청에 직접
    // `_skipAuthRefresh`를 달아 빠져나간다. 그래야 E-AUTH-001(비밀번호 틀림)이
    // 토큰 갱신 시도나 세션 만료 오버레이로 잘못 번역되지 않는다.
    // 로그아웃 진행 중이면 갱신 자체를 시도하지 않는다. 쿠키가 막 지워진
    // 참이라 갱신은 어차피 실패하고, 마운트된 쿼리 수만큼 무의미한
    // token-refresh 요청이 나간 뒤 그 실패들이 만료 오버레이로 번역된다.
    const { loggingOut } = useSessionStore.getState()
    if (appError.status === 401 && !config._retry && !config._skipAuthRefresh && !loggingOut) {
      try {
        // Path per openapi single source (/auth/token-refresh, no request body —
        // refresh token travels as the httpOnly op_rt cookie, ADR-0001).
        await apiClient.post('/auth/token-refresh', null, { _skipAuthRefresh: true })
        // Re-issue the original request once. The success interceptor unwraps it,
        // so the caller receives the retried payload transparently.
        return apiClient({ ...config, _retry: true })
      } catch {
        // 갱신 실패 = 세션이 실제로 끝났다. sessionStore.js 헤더가 "REAL
        // INTEGRATION POINT"로 지목해 둔 바로 그 자리 — OVL-SESSION(AUTH-08)을
        // 띄워, 배경을 언마운트하지 않은 채(NFR-019) 재로그인을 받고 성공하면
        // previousPath로 되돌린다(NFR-004).
        //
        // `_sessionProbe`(router.js sessionGuardLoader의 GET /auth/session)는
        // 제외한다: 그 401은 "만료"가 아니라 "애초에 로그인한 적 없음"일 수
        // 있고, 그 경우의 목적지는 오버레이가 아니라 로그인 화면이다. 가드가
        // 401을 직접 redirect('/login')으로 처리하므로, 여기서 함께 오버레이를
        // 띄우면 로그인 화면 위에 "세션이 만료되었습니다"가 겹쳐 뜬다.
        //
        // 되돌아갈 경로는 지금 이 순간의 주소다 — 사용자가 보고 있던 화면.
        if (!config._sessionProbe) {
          const path =
            typeof window !== 'undefined'
              ? `${window.location.pathname}${window.location.search}`
              : null
          useSessionStore.getState().expire(path)
        }
        // 그리고 원래의 401을 그대로 호출부에 돌려준다(아래 reject).
      }
    }

    // Log trace id + code for support diagnostics; never shown to the user (R1/§3).
    console.error(`[api] request failed code=${appError.code} traceId=${appError.traceId ?? 'none'}`)

    return Promise.reject(appError)
  },
)

export default apiClient
