import { QueryClient } from '@tanstack/react-query'

/*
  The single home of retry policy (ADR-0001). axios NEVER retries; this is the
  only place automatic retry is configured, so reads and writes cannot be
  double-retried (story §2.2).

  Created outside React render so it is not re-instantiated on re-render.
*/
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // GET is idempotent → at most ONE automatic retry (SS1 R2). TanStack's
      // default is 3, so the explicit cap is required. 4xx are deterministic —
      // retrying them is pointless, so stop immediately. Only network errors
      // (status null) and 5xx are worth a single retry.
      retry: (failureCount, error) => {
        if (failureCount >= 1) return false
        const status = error?.status ?? null // AppError.status
        if (status && status >= 400 && status < 500) return false
        return true
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
      // Pause queries while offline; auto-resume on reconnect (SYS-07 AC-4).
      networkMode: 'online',
    },
    mutations: {
      // Writes are never auto-retried — the user retries manually (SS1 R2, AC-2).
      retry: 0,
    },
  },
})

export default queryClient
