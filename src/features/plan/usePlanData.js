/*
  TanStack Query wiring for the weekly plan. Server state lives here; local draft
  concerns (undo stack, drag) live in their own stores/hooks (ADR-0002 boundary).

  - useWeekPlan: OP-PLAN-GETWEEK with ±1-week prefetch (PLAN-02 AC-2) and
    keepPreviousData so navigating weeks keeps the previous grid skeleton in
    place instead of blanking (NFR-024, "이전 골격 유지").
  - useMoveBlock: optimistic block move (PLAN-19 AC-1) — cache updates in <100ms,
    then PATCH; on error the snapshot is restored (409/422 both roll back).
  - useSaveAvailability: PUT availabilities then invalidate (PLAN-32).
*/

import { useCallback, useEffect } from 'react'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { getAvailability, getWeek, patchBlock, putAvailabilities } from './planApi'
import { addWeeksISO } from './planTime'
import { toast } from '../../hooks/useToasts'
import { systemMessages } from '../../constants/systemMessages'

export const weekPlanKey = (weekStartISO) => ['weekPlan', weekStartISO]
export const availabilityKey = () => ['availability']

const WEEK_STALE_MS = 60 * 1000

export function useWeekPlan(weekStartISO) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: weekPlanKey(weekStartISO),
    queryFn: () => getWeek(weekStartISO),
    placeholderData: keepPreviousData,
    staleTime: WEEK_STALE_MS,
  })

  // Prefetch the adjacent weeks so ‹ › navigation is instant (PLAN-02 AC-2).
  useEffect(() => {
    for (const delta of [-1, 1]) {
      const iso = addWeeksISO(weekStartISO, delta)
      queryClient.prefetchQuery({
        queryKey: weekPlanKey(iso),
        queryFn: () => getWeek(iso),
        staleTime: WEEK_STALE_MS,
      })
    }
  }, [weekStartISO, queryClient])

  return query
}

export function useAvailability() {
  return useQuery({
    queryKey: availabilityKey(),
    queryFn: getAvailability,
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Returns a `move(vars)` function for an optimistic block move. `vars`:
 *   { planBlockId, startAt, endAt, sourceWeek, targetWeek }
 * sourceWeek/targetWeek are week-start ISO keys; they differ only on a
 * week-boundary move (PLAN-20), in which case the block hops caches.
 *
 * The optimistic cache update is applied SYNCHRONOUSLY (not via an async
 * onMutate), so the caller can clear the drag ghost in the same React batch —
 * otherwise the block would flash at its old position for one frame between the
 * ghost clearing and an async cache update landing. The PATCH then runs in the
 * background; any failure restores the pre-move snapshot (409/422 both roll back).
 */
export function useMoveBlock() {
  const queryClient = useQueryClient()

  return useCallback(
    ({ planBlockId, startAt, endAt, sourceWeek, targetWeek }) => {
      const applyToCache = (weekKey, updater) => {
        queryClient.setQueryData(weekPlanKey(weekKey), (prev) =>
          prev ? updater(prev) : prev,
        )
      }

      // Snapshot both affected weeks BEFORE mutating, for rollback.
      const prevSource = queryClient.getQueryData(weekPlanKey(sourceWeek))
      const prevTarget = queryClient.getQueryData(weekPlanKey(targetWeek))
      const moved =
        prevSource?.blocks?.find((b) => b.planBlockId === planBlockId) ?? null

      // Optimistic, synchronous.
      if (targetWeek === sourceWeek) {
        applyToCache(sourceWeek, (wk) => ({
          ...wk,
          blocks: wk.blocks.map((b) =>
            b.planBlockId === planBlockId ? { ...b, startAt, endAt } : b,
          ),
        }))
      } else {
        applyToCache(sourceWeek, (wk) => ({
          ...wk,
          blocks: wk.blocks.filter((b) => b.planBlockId !== planBlockId),
        }))
        if (moved) {
          applyToCache(targetWeek, (wk) => ({
            ...wk,
            blocks: [...wk.blocks, { ...moved, startAt, endAt }],
          }))
        }
      }

      // Background PATCH; writes are never auto-retried (the user retries).
      patchBlock(planBlockId, { startAt, endAt, __targetWeek: targetWeek })
        .catch(() => {
          queryClient.setQueryData(weekPlanKey(sourceWeek), prevSource)
          if (targetWeek !== sourceWeek) {
            queryClient.setQueryData(weekPlanKey(targetWeek), prevTarget)
          }
          toast({ tone: 'info', message: systemMessages.error.getTitle })
        })
        .finally(() => {
          queryClient.invalidateQueries({ queryKey: weekPlanKey(sourceWeek) })
          if (targetWeek !== sourceWeek) {
            queryClient.invalidateQueries({ queryKey: weekPlanKey(targetWeek) })
          }
        })
    },
    [queryClient],
  )
}

export function useSaveAvailability() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patterns) => putAvailabilities(patterns),
    onSuccess: (patterns) => {
      queryClient.setQueryData(availabilityKey(), patterns)
      toast({ tone: 'success', message: '가용 시간을 저장했습니다' })
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: availabilityKey() })
      toast({ tone: 'info', message: systemMessages.error.writeTitle })
    },
  })
}
