import axios from 'axios'

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
  (response) => response.data?.data ?? response.data,
  async (error) => {
    const appError = normalizeError(error)
    const config = error?.config ?? {}

    // Token refresh on 401 (E-COM-002). Two guards prevent infinite recursion:
    //  1. config._retry — blocks re-refreshing the SAME original request twice.
    //  2. config._skipAuthRefresh — set on the refresh call itself so that if
    //     the refresh token is also expired (refresh returns 401), it does NOT
    //     re-trigger this branch; it normalizes straight to AppError(E-COM-002)
    //     and is delegated to the session surface (ST-F1-14). Story §2.3 N-3.
    if (appError.code === 'E-COM-002' && !config._retry && !config._skipAuthRefresh) {
      try {
        await apiClient.post('/auth/refresh', null, { _skipAuthRefresh: true })
        // Re-issue the original request once. The success interceptor unwraps it,
        // so the caller receives the retried payload transparently.
        return apiClient({ ...config, _retry: true })
      } catch {
        // Refresh failed — fall through to reject with the original 401 error.
      }
    }

    // Log trace id + code for support diagnostics; never shown to the user (R1/§3).
    console.error(`[api] request failed code=${appError.code} traceId=${appError.traceId ?? 'none'}`)

    return Promise.reject(appError)
  },
)

export default apiClient
