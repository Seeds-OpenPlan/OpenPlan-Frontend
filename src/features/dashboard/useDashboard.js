import { useQuery } from '@tanstack/react-query'
import { getDashboard } from './dashboardApi'

/*
  TanStack Query wiring for the dashboard's single GET (server state lives here,
  same ADR-0002 split every other feature module follows). staleTime is short —
  the dashboard is a "what should I do right now" surface, so a stale badge
  count or priority action is worse than an extra background refetch on
  remount. The single auto-retry-on-network-error policy (queryClient.js,
  ADR-0001) already covers §DASH.7's "error(요청 자체 실패): GET 자동 1회 재시도".
*/
export const dashboardKey = () => ['dashboard']

export function useDashboardQuery() {
  return useQuery({
    queryKey: dashboardKey(),
    queryFn: getDashboard,
    staleTime: 30 * 1000,
  })
}

export default useDashboardQuery
