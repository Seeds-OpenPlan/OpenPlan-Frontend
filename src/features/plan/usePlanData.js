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
import { deleteBlock, getAvailability, getWeek, patchBlock, putAvailabilities } from './planApi'
import {
  getUnplacedTasks,
  patchTaskStatus,
  postAutoPlacements,
  postBlock,
  postBlockBatch,
  postExecutionRecord,
} from './taskApi'
import { patchSchedule, postScheduleBlock } from './scheduleApi'
import { addWeeksISO } from './planTime'
import { toast } from '../../hooks/useToasts'
import { systemMessages } from '../../constants/systemMessages'

export const weekPlanKey = (weekStartISO) => ['weekPlan', weekStartISO]
export const availabilityKey = () => ['availability']
export const unplacedTasksKey = (projectId = null) => ['unplacedTasks', projectId]

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
          toast({ tone: 'error', message: systemMessages.error.getTitle })
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
      toast({ tone: 'error', message: systemMessages.error.writeTitle })
    },
  })
}

// --- ST-F1-03: unplaced panel · task placement · auto placement --------------

/** GET /tasks?status=UNASSIGNED — the unplaced backlog (optional project filter). */
export function useUnplacedTasks(projectId = null) {
  return useQuery({
    queryKey: unplacedTasksKey(projectId),
    queryFn: () => getUnplacedTasks(projectId),
    staleTime: 30 * 1000,
  })
}

/**
 * Returns `placeTask(vars)` for an optimistic single-task placement (PLAN-06/07).
 * `vars`: { weeklyPlanId, weekStartISO, task, startAt, endAt }.
 *
 * Optimistic + synchronous (mirrors useMoveBlock): the block appears on the grid
 * and the task leaves the panel in the same React batch (<100ms, AC-1), then POST
 * runs in the background; any failure restores both caches (409/422 roll back).
 */
export function usePlaceTask() {
  const queryClient = useQueryClient()

  return useCallback(
    ({ weeklyPlanId, weekStartISO, task, startAt, endAt }) => {
      const weekKey = weekPlanKey(weekStartISO)
      const prevWeek = queryClient.getQueryData(weekKey)
      // A client-only temp id until the POST returns the real planBlockId; the
      // follow-up invalidate reconciles it away.
      const tempId = `temp-${task.taskId}`

      queryClient.setQueryData(weekKey, (wk) =>
        wk
          ? {
              ...wk,
              blocks: [
                ...wk.blocks,
                {
                  planBlockId: tempId,
                  blockType: 'TASK',
                  title: task.title,
                  tone: 'brand',
                  status: 'SCHEDULED',
                  taskId: task.taskId,
                  scheduleId: null,
                  startAt,
                  endAt,
                },
              ],
              unplacedCount: Math.max(0, (wk.unplacedCount ?? 0) - 1),
            }
          : wk,
      )
      // Drop the task from every unplaced list (all filters), instantly.
      queryClient.setQueriesData({ queryKey: ['unplacedTasks'] }, (list) =>
        Array.isArray(list) ? list.filter((t) => t.taskId !== task.taskId) : list,
      )

      postBlock(weeklyPlanId, {
        taskId: task.taskId,
        blockType: 'TASK',
        title: task.title,
        startAt,
        endAt,
        status: 'SCHEDULED',
      })
        .catch(() => {
          queryClient.setQueryData(weekKey, prevWeek)
          queryClient.invalidateQueries({ queryKey: ['unplacedTasks'] })
          toast({ tone: 'error', message: systemMessages.error.writeTitle })
        })
        .finally(() => {
          queryClient.invalidateQueries({ queryKey: weekKey })
          queryClient.invalidateQueries({ queryKey: ['unplacedTasks'] })
        })
    },
    [queryClient],
  )
}

/**
 * POST /weekly-plans/{id}/auto-placements — returns a DRAFT { placements, unplaced }
 * and mutates NOTHING (the caller holds it as a local overlay until applied).
 */
export function useAutoPlace() {
  return useMutation({
    mutationFn: ({ weeklyPlanId, priorityType }) =>
      postAutoPlacements(weeklyPlanId, priorityType),
    onError: () => {
      toast({ tone: 'error', message: systemMessages.error.writeTitle })
    },
  })
}

/**
 * POST /weekly-plans/{id}/block-batches — commit an applied auto-place draft.
 * On success the week + backlog refetch; the plan stays a DRAFT (confirm =
 * ST-F1-05), which is the C-2 "적용해도 미저장" double protection.
 */
export function useApplyAutoPlace() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ weeklyPlanId, placements }) => postBlockBatch(weeklyPlanId, placements),
    onSuccess: (_data, { weekStartISO }) => {
      queryClient.invalidateQueries({ queryKey: weekPlanKey(weekStartISO) })
      queryClient.invalidateQueries({ queryKey: ['unplacedTasks'] })
    },
    onError: () => {
      toast({ tone: 'error', message: systemMessages.error.writeTitle })
    },
  })
}

// --- ST-F1-04: block action menu (complete/uncomplete · unplace · delete) ----

/**
 * Returns `setComplete({ weekStartISO, taskId, complete })` — PLAN-13/14. Marks
 * every block of the task COMPLETED/SCHEDULED optimistically, then PATCHes the
 * task status. This commits IMMEDIATELY and independently of the plan draft (J3),
 * so it never touches the undo stack.
 */
export function useSetBlockComplete() {
  const queryClient = useQueryClient()
  return useCallback(
    ({ weekStartISO, taskId, complete }) => {
      const weekKey = weekPlanKey(weekStartISO)
      const prevWeek = queryClient.getQueryData(weekKey)
      const blockStatus = complete ? 'COMPLETED' : 'SCHEDULED'
      queryClient.setQueryData(weekKey, (wk) =>
        wk
          ? {
              ...wk,
              blocks: wk.blocks.map((b) =>
                b.taskId === taskId ? { ...b, status: blockStatus } : b,
              ),
            }
          : wk,
      )
      patchTaskStatus(taskId, complete ? 'COMPLETED' : 'IN_PROGRESS')
        .catch(() => {
          queryClient.setQueryData(weekKey, prevWeek)
          toast({ tone: 'error', message: systemMessages.error.writeTitle })
        })
        .finally(() => queryClient.invalidateQueries({ queryKey: weekKey }))
    },
    [queryClient],
  )
}

const UNDO_WINDOW_MS = 6000

/**
 * Returns `removeBlock({ weekStartISO, weeklyPlanId, block, mode })` — a soft
 * delete with an "실행 취소" toast (PLAN-16 배치 해제 / PLAN-18 일정 삭제). The block is
 * removed AND deleted on the server IMMEDIATELY so the cache and server never
 * disagree — a DEFERRED delete let a background refetch resurrect the block at its
 * old spot for a frame. Undo RE-CREATES the block. `mode`: 'unplace' also returns
 * the task to the backlog; 'delete' drops a schedule.
 */
export function useRemoveBlockWithUndo() {
  const queryClient = useQueryClient()
  return useCallback(
    ({ weekStartISO, weeklyPlanId, block, mode }) => {
      const weekKey = weekPlanKey(weekStartISO)
      const prevWeek = queryClient.getQueryData(weekKey)
      const isUnplace = mode === 'unplace'
      const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: weekKey })
        if (isUnplace) queryClient.invalidateQueries({ queryKey: ['unplacedTasks'] })
      }

      // Optimistic remove, then commit the server delete right away (consistent
      // with the cache → no resurrection on refetch).
      queryClient.setQueryData(weekKey, (wk) =>
        wk
          ? {
              ...wk,
              blocks: wk.blocks.filter((b) => b.planBlockId !== block.planBlockId),
              ...(isUnplace ? { unplacedCount: (wk.unplacedCount ?? 0) + 1 } : {}),
            }
          : wk,
      )
      deleteBlock(block.planBlockId)
        .catch(() => {
          queryClient.setQueryData(weekKey, prevWeek)
          toast({ tone: 'error', message: systemMessages.error.writeTitle })
        })
        .finally(invalidate)

      // Undo re-creates the block from its captured data (a new id; the follow-up
      // refetch reconciles). Task blocks re-place; schedule blocks re-create.
      const undo = () => {
        const recreate = isUnplace
          ? postBlock(weeklyPlanId, {
              taskId: block.taskId,
              blockType: 'TASK',
              title: block.title,
              startAt: block.startAt,
              endAt: block.endAt,
              status: 'SCHEDULED',
            })
          : postScheduleBlock(weeklyPlanId, {
              blockType: 'SCHEDULE',
              title: block.title,
              startAt: block.startAt,
              endAt: block.endAt,
              status: 'SCHEDULED',
              memo: block.memo ?? '',
              estimatedMinutes: block.estimatedMinutes ?? undefined,
              priority: block.priority ?? undefined,
            })
        recreate
          .catch(() => toast({ tone: 'error', message: systemMessages.error.writeTitle }))
          .finally(invalidate)
      }

      toast({
        tone: 'info',
        message: isUnplace ? '미배치로 되돌렸습니다' : '일정을 삭제했습니다',
        duration: UNDO_WINDOW_MS,
        action: { label: '실행 취소', onClick: undo },
      })
    },
    [queryClient],
  )
}

// --- ST-F1-04 Phase 2: execution log · schedule create/edit -----------------

/** POST /tasks/{id}/execution-records — PLAN-15 실제 시간 기록 (write-only). */
export function useLogExecution() {
  return useMutation({
    mutationFn: ({ taskId, body }) => postExecutionRecord(taskId, body),
    onSuccess: () => toast({ tone: 'success', message: '통계에 반영되었습니다' }),
    onError: () => toast({ tone: 'error', message: systemMessages.error.writeTitle }),
  })
}

/** POST /weekly-plans/{id}/blocks (SCHEDULE inline) — PLAN-08 일정 배치. */
export function useCreateScheduleBlock() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ weeklyPlanId, body }) => postScheduleBlock(weeklyPlanId, body),
    onSuccess: (_data, { weekStartISO }) => {
      queryClient.invalidateQueries({ queryKey: weekPlanKey(weekStartISO) })
      toast({ tone: 'success', message: '일정을 추가했습니다' })
    },
    onError: () => toast({ tone: 'error', message: systemMessages.error.writeTitle }),
  })
}

/** PATCH /schedules/{id} — PLAN-17 일정 편집. Refetches the week to reflect it. */
export function useUpdateSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ scheduleId, patch }) => patchSchedule(scheduleId, patch),
    onSuccess: (_data, { weekStartISO }) => {
      queryClient.invalidateQueries({ queryKey: weekPlanKey(weekStartISO) })
      toast({ tone: 'success', message: '일정을 수정했습니다' })
    },
    onError: () => toast({ tone: 'error', message: systemMessages.error.writeTitle }),
  })
}
