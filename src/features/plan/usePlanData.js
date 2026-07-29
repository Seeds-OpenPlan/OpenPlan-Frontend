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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  deleteBlock,
  getAvailability,
  getWeek,
  normalizeValidationPayload,
  patchBlock,
  putAvailabilities,
  saveWeek,
  validatePlan,
} from './planApi'
import {
  getUnplacedTasks,
  patchTaskStatus,
  postAutoPlacements,
  postBlock,
  postBlockBatch,
  postExecutionRecord,
} from './taskApi'
import { patchSchedule, postScheduleBlock } from './scheduleApi'
import { addFixedException, getFixedSchedules, removeFixedException } from './fixedScheduleApi'
import { generateReplanOption, selectReplanOption } from './replanApi'
import { GENERATED_STRATEGY_TYPES } from './replanStrategies'
import { addWeeksISO } from './planTime'
import { dashboardKey } from '../dashboard/useDashboard'
import { toast } from '../../hooks/useToasts'
import { systemMessages } from '../../constants/systemMessages'

export const weekPlanKey = (weekStartISO) => ['weekPlan', weekStartISO]
export const availabilityKey = () => ['availability']
export const unplacedTasksKey = (projectId = null) => ['unplacedTasks', projectId]
export const fixedSchedulesKey = (weekStartISO) => ['fixedSchedules', weekStartISO]

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
 *
 * BUG FIX (block "duplication" after a quick re-move): every mutation here
 * follows optimistic-write → background PATCH → `finally` invalidate, and
 * `invalidateQueries` refetches in the background (~100ms+ over the mock). If an
 * EARLIER action's refetch is still in flight when THIS move applies its own
 * optimistic write, that stale refetch can land afterward and overwrite the
 * cache with a server snapshot that predates this move — visually the block
 * snaps back to its old spot, then jumps forward again once this move's own
 * refetch lands. In rapid "place → immediately re-move" sequences this reads as
 * the block momentarily duplicating. `cancelQueries` (fire-and-forget; its
 * abort effect on the in-flight retryer is synchronous — no await needed to
 * keep this function's optimistic write in the same tick) neutralizes any such
 * stale refetch before we write, so only OUR write and OUR later invalidate can
 * ever land for this key.
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

      // Cancel any stale in-flight refetch for the affected week(s) BEFORE
      // writing — see the stale-refetch race note above.
      queryClient.cancelQueries({ queryKey: weekPlanKey(sourceWeek) })
      if (targetWeek !== sourceWeek) {
        queryClient.cancelQueries({ queryKey: weekPlanKey(targetWeek) })
      }

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

/**
 * PUT availabilities (PLAN-32). OPTIMISTIC like every other write here — onMutate
 * writes the new patterns synchronously so the band lands in the same React batch
 * as the drag's preview-clear (waiting for the round-trip made the edge visibly
 * snap back and then jump). The pre-edit snapshot is restored on failure.
 */
export function useSaveAvailability() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patterns) => putAvailabilities(patterns),
    onMutate: (patterns) => {
      // Fire-and-forget: cancelQueries' abort is synchronous, so the optimistic
      // write below still lands in this same batch (no stale refetch can clobber).
      queryClient.cancelQueries({ queryKey: availabilityKey() })
      const prev = queryClient.getQueryData(availabilityKey())
      queryClient.setQueryData(availabilityKey(), patterns)
      return { prev }
    },
    onSuccess: () => {
      toast({ tone: 'success', message: '가용 시간을 저장했습니다' })
    },
    onError: (_err, _patterns, context) => {
      if (context?.prev) queryClient.setQueryData(availabilityKey(), context.prev)
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
 *
 * See useMoveBlock's header for the stale-refetch race this hook also guards
 * against via `cancelQueries` (a re-move right after placement was the repro
 * that surfaced it — the block would appear to duplicate/jump).
 *
 * BUG FIX (re-entrant placement leaves a permanently-stuck `temp-` ghost): a
 * single physical drop must call this EXACTLY once, but nothing here enforced
 * that — the optimistic write below is an unconditional array append with no
 * check for a placement of the SAME task already in flight. The concrete
 * trigger (found via an actual query-core repro, not guesswork): the caller,
 * usePlacementDrag's `up()` handler, called this from INSIDE a
 * `setDrag((d) => { onDropRef.current(d.task, slot); return null })` functional
 * updater — a side effect inside a state updater, which React 19 Strict Mode
 * (enabled in main.jsx) deliberately double-invokes in dev
 * (react-dom-client.development.js `shouldDoubleInvokeUserFnsInHooksDEV`) to
 * surface exactly this class of impurity. That call site is now fixed too, but
 * this hook must not rely on every future caller getting that right — a
 * re-entrant call for a task whose placement hasn't settled yet (POST still in
 * flight) is guarded here unconditionally: `inFlightRef` tracks temp ids
 * currently being placed and turns a repeat call into a no-op, so the temp
 * entry's lifecycle stays deterministic (exactly one optimistic entry, exactly
 * one POST) no matter how many times placement is re-triggered. A LATER,
 * genuinely separate placement of the same task (e.g. re-placing an A4
 * remainder after the first one fully reconciled) is unaffected — the guard
 * only blocks a call that overlaps a STILL-PENDING one for the same task.
 */
export function usePlaceTask() {
  const queryClient = useQueryClient()
  const inFlightRef = useRef(new Set())

  return useCallback(
    ({ weeklyPlanId, weekStartISO, task, startAt, endAt }) => {
      const weekKey = weekPlanKey(weekStartISO)
      // A client-only temp id until the POST returns the real planBlockId; the
      // follow-up invalidate reconciles it away.
      const tempId = `temp-${task.taskId}`

      // Re-entrant guard (see BUG FIX note above): a placement for this exact
      // task is already in flight — skip instead of appending a second temp
      // entry / firing a second POST.
      if (inFlightRef.current.has(tempId)) return
      inFlightRef.current.add(tempId)

      const prevWeek = queryClient.getQueryData(weekKey)

      // Cancel stale in-flight refetches for both keys we're about to write
      // optimistically (see useMoveBlock's header).
      queryClient.cancelQueries({ queryKey: weekKey })
      queryClient.cancelQueries({ queryKey: ['unplacedTasks'] })

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
        .then((result) => {
          // Reconcile the optimistic temp id to the server's real planBlockId as
          // soon as the POST resolves, so the block becomes a first-class,
          // interactable block without waiting on the refetch (temp-id race fix).
          const realId = result?.planBlockId
          if (!realId) return
          // Cancel a stale in-flight refetch before writing (see this hook's
          // header) so it can't land after this reconcile and revert it.
          queryClient.cancelQueries({ queryKey: weekKey })
          queryClient.setQueryData(weekKey, (wk) => {
            if (!wk) return wk
            // Defensive dedupe: if a background refetch already delivered the
            // real block under `realId` (e.g. it resolved between the optimistic
            // add and this reconcile), drop the now-redundant temp entry instead
            // of renaming it — renaming would leave TWO blocks sharing `realId`,
            // the literal "duplicated block" symptom.
            const realAlreadyPresent = wk.blocks.some((b) => b.planBlockId === realId)
            return {
              ...wk,
              blocks: realAlreadyPresent
                ? wk.blocks.filter((b) => b.planBlockId !== tempId)
                : wk.blocks.map((b) =>
                    b.planBlockId === tempId ? { ...b, planBlockId: realId } : b,
                  ),
            }
          })
        })
        .catch(() => {
          queryClient.setQueryData(weekKey, prevWeek)
          // `finally` below invalidates ['unplacedTasks'] unconditionally right
          // after this runs — invalidating it here too was a redundant extra
          // round-trip on the error path only (harmless, just wasteful).
          toast({ tone: 'error', message: systemMessages.error.writeTitle })
        })
        .finally(() => {
          // Release the guard on EVERY path (success, failure, or a soft no-op
          // reconcile) so a genuinely later placement of this same task is never
          // permanently blocked.
          inFlightRef.current.delete(tempId)
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
      // See useMoveBlock's header for why this precedes the optimistic write.
      queryClient.cancelQueries({ queryKey: weekKey })
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
      // No `version` argument: this toggle acts on a plan block, which carries
      // no task version — patchTaskStatus reads the task for it (see its own
      // header for why the lookup lives there and not here).
      patchTaskStatus(taskId, complete)
        .catch(() => {
          queryClient.setQueryData(weekKey, prevWeek)
          toast({ tone: 'error', message: systemMessages.error.writeTitle })
        })
        .finally(() => queryClient.invalidateQueries({ queryKey: weekKey }))
    },
    [queryClient],
  )
}

/**
 * Returns `resize({ weekStartISO, planBlockId, blockType, startAt, endAt })` — A2
 * edge-drag resize. Optimistic block-time change + PATCH. Shrinking a TASK block
 * below its estimate frees remainder time, so the unplaced list is invalidated too
 * (A4 "남은 시간은 미배치에 다시 계산").
 */
export function useResizeBlock() {
  const queryClient = useQueryClient()
  return useCallback(
    ({ weekStartISO, planBlockId, blockType, startAt, endAt }) => {
      const weekKey = weekPlanKey(weekStartISO)
      const prevWeek = queryClient.getQueryData(weekKey)
      // See useMoveBlock's header for why this precedes the optimistic write.
      queryClient.cancelQueries({ queryKey: weekKey })
      queryClient.setQueryData(weekKey, (wk) =>
        wk
          ? {
              ...wk,
              blocks: wk.blocks.map((b) =>
                b.planBlockId === planBlockId ? { ...b, startAt, endAt } : b,
              ),
            }
          : wk,
      )
      patchBlock(planBlockId, { startAt, endAt })
        .catch(() => {
          queryClient.setQueryData(weekKey, prevWeek)
          toast({ tone: 'error', message: systemMessages.error.writeTitle })
        })
        .finally(() => {
          queryClient.invalidateQueries({ queryKey: weekKey })
          if (blockType === 'TASK') {
            queryClient.invalidateQueries({ queryKey: ['unplacedTasks'] })
          }
        })
    },
    [queryClient],
  )
}

const UNDO_WINDOW_MS = 6000

/**
 * Returns `removeBlock({ weekStartISO, weeklyPlanId, block, mode, claim })` — a
 * soft delete with an "실행 취소" toast (PLAN-16 배치 해제 / PLAN-18 일정 삭제) that ALSO
 * returns a `{ id, type:'remove', undo, redo }` history entry for the ↶/↷ stack.
 * This hook only owns server I/O; the caller (WeeklyPage) owns stack bookkeeping
 * (`history.record`) — same split as `useMoveBlock`/`handleUserMove` — so this
 * module never imports `usePlanHistory` directly (ADR-0002 boundary above).
 *
 * The block is removed AND deleted on the server IMMEDIATELY so the cache and
 * server never disagree — a DEFERRED delete let a background refetch resurrect
 * the block at its old spot for a frame. `mode`: 'unplace' also returns the task
 * to the backlog; 'delete' drops a schedule.
 *
 * TWO independent UI paths can invert this SAME removal: the toast's "실행 취소"
 * (fires any time within 6s, possibly after the user did other things) and the
 * ↶ button (strict LIFO, via usePlanHistory). Both must not fire the recreate
 * twice. The toast calls the injected `claim(entryId)` FIRST — which is expected
 * to be `usePlanHistory`'s `claim` action, atomically removing this entry from
 * the stack's `past` wherever it sits; if ↶ already popped it, `claim` returns
 * null and the toast becomes a no-op. `claim` is optional (defaults to "always
 * allowed") so this hook stays independently usable/testable without a wired
 * history store.
 */
export function useRemoveBlockWithUndo() {
  const queryClient = useQueryClient()
  return useCallback(
    ({ weekStartISO, weeklyPlanId, block, mode, claim }) => {
      const weekKey = weekPlanKey(weekStartISO)
      const isUnplace = mode === 'unplace'
      const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: weekKey })
        if (isUnplace) queryClient.invalidateQueries({ queryKey: ['unplacedTasks'] })
      }

      // Mutable across undo/redo cycles: recreating gets a NEW server id, so a
      // later redo (re-delete) must target that id instead of the original
      // (now-gone) one. `block` itself is never mutated (caller may still hold
      // a reference to it elsewhere) — we swap this local binding instead.
      let current = block

      // The actual server delete + optimistic cache filter. Shared by the
      // original action (below) and by a stack `redo` (re-applying the removal).
      const runRemove = () => {
        const prevWeek = queryClient.getQueryData(weekKey)
        // See useMoveBlock's header for why this precedes the optimistic write.
        queryClient.cancelQueries({ queryKey: weekKey })
        queryClient.setQueryData(weekKey, (wk) =>
          wk
            ? {
                ...wk,
                blocks: wk.blocks.filter((b) => b.planBlockId !== current.planBlockId),
                ...(isUnplace ? { unplacedCount: (wk.unplacedCount ?? 0) + 1 } : {}),
              }
            : wk,
        )
        deleteBlock(current.planBlockId)
          .catch(() => {
            queryClient.setQueryData(weekKey, prevWeek)
            toast({ tone: 'error', message: systemMessages.error.writeTitle })
          })
          .finally(invalidate)
      }

      // Re-creates the block from its captured data (a new id; the follow-up
      // refetch reconciles). Task blocks re-place; schedule blocks re-create.
      // Shared by the toast's "실행 취소" and by a stack `undo`.
      const runRecreate = () => {
        const recreate = isUnplace
          ? postBlock(weeklyPlanId, {
              taskId: current.taskId,
              blockType: 'TASK',
              title: current.title,
              startAt: current.startAt,
              endAt: current.endAt,
              status: 'SCHEDULED',
            })
          : postScheduleBlock(weeklyPlanId, {
              blockType: 'SCHEDULE',
              title: current.title,
              startAt: current.startAt,
              endAt: current.endAt,
              status: 'SCHEDULED',
              memo: current.memo ?? '',
              estimatedMinutes: current.estimatedMinutes ?? undefined,
              priority: current.priority ?? undefined,
            })
        recreate
          .then((result) => {
            if (result?.planBlockId) current = { ...current, planBlockId: result.planBlockId }
          })
          .catch(() => toast({ tone: 'error', message: systemMessages.error.writeTitle }))
          .finally(invalidate)
      }

      runRemove()

      // A stable id lets the toast target THIS removal specifically via `claim`,
      // independent of whatever else the user does before the 6s window closes.
      const entryId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `remove-${current.planBlockId}-${Date.now()}`

      toast({
        tone: 'info',
        message: isUnplace ? '미배치로 되돌렸습니다' : '일정을 삭제했습니다',
        duration: UNDO_WINDOW_MS,
        action: {
          label: '실행 취소',
          onClick: () => {
            const claimed = claim ? claim(entryId) : true
            if (claimed) runRecreate()
          },
        },
      })

      return { id: entryId, type: 'remove', undo: runRecreate, redo: runRemove }
    },
    [queryClient],
  )
}

// --- ST-F1-04 Phase 2: execution log · schedule create/edit -----------------

/**
 * POST /tasks/{id}/execution-records — PLAN-15 실제 시간 기록 (write-only).
 * Shared by both WeeklyPage and HomePage (dashboard) — either caller logging
 * an execution record changes numbers the dashboard's own aggregates read
 * (S1/S3 in ui-spec-dash.md), so this invalidates `dashboardKey()` regardless
 * of which screen fired the mutation, matching this codebase's write-then-
 * invalidate convention (every other mutation above does the same for its
 * own reads). Without this, the dashboard GET keeps serving its cached
 * (now-stale) aggregate for up to its own staleTime after a log succeeds.
 */
export function useLogExecution() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, body }) => postExecutionRecord(taskId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardKey() })
      toast({ tone: 'success', message: '통계에 반영되었습니다' })
    },
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

// --- ST-F1-06: fixed schedule blocks · week exceptions -----------------------

/**
 * GET /fixed-schedules — recurring, immovable schedules plus this week's
 * `activeThisWeek` (PLAN-33/34). A generous staleTime: a fixed schedule's own
 * weekday/time rarely changes (그 편집은 ST-F1-12 소관, out of scope here) and its
 * per-week exception only changes through `useToggleFixedException` below, which
 * invalidates this exact key on success — so there is nothing for a short
 * staleTime to catch that the mutation doesn't already refresh.
 */
export function useFixedSchedules(weekStartISO) {
  return useQuery({
    queryKey: fixedSchedulesKey(weekStartISO),
    queryFn: () => getFixedSchedules(weekStartISO),
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Returns `toggle({ fixedScheduleId, weekStartISO, activate })` — PLAN-33 이번 주만
 * 비활성화 (`activate: false`, POST a week-exception) / PLAN-34 다시 활성화
 * (`activate: true`, DELETE it).
 *
 * Deliberately NOT optimistic, unlike the drag/placement hooks above: those exist
 * to hide network latency from a POINTER interaction with a <100ms budget. This
 * is a menu click — a plain invalidate-on-success is simpler and correct, and
 * skips modeling a rollback for a cache shape (fixed schedules) that nothing else
 * writes to.
 *
 * The caller (WeeklyPage) is expected to ALSO force `validation.revalidate(blocks)`
 * in its own `onSuccess` (AC-3): this hook only knows about the fixed-schedules
 * cache, not the validation loop, which lives in `usePlanValidation` and needs
 * the CURRENT block set as its argument — threading that through this generic
 * hook would couple it to a caller-specific concern it has no other reason to
 * know about.
 */
export function useToggleFixedException() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ fixedScheduleId, weekStartISO, activate }) =>
      activate
        ? removeFixedException(fixedScheduleId, weekStartISO)
        : addFixedException(fixedScheduleId, weekStartISO),
    onSuccess: (_data, { weekStartISO, activate }) => {
      queryClient.invalidateQueries({ queryKey: fixedSchedulesKey(weekStartISO) })
      toast({
        tone: 'success',
        message: activate ? '고정 일정을 다시 활성화했습니다' : '이번 주만 비활성화했습니다',
      })
    },
    onError: () => toast({ tone: 'error', message: systemMessages.error.writeTitle }),
  })
}

// --- ST-F1-05: validation dry-run loop · week confirm ------------------------

// Local edits settle in bursts (a drag emits many optimistic writes). The
// story's own figure (AC-1) is 300ms; the product owner asked for a snappier
// feel after a live walkthrough and this trades some of the budget for it —
// 150ms still leaves ~850ms of the 1s ceiling (NFR-025) for the round trip and
// the re-render, at the cost of issuing dry-run requests roughly twice as
// often against the real server during a sustained drag.
export const VALIDATION_DEBOUNCE_MS = 150

const EMPTY_VALIDATION = { issues: [], blockingCount: 0, warningCount: 0 }

// A result that was never computed for the block set on screen. `signature: null`
// can never equal a real signature, which is what makes `stale` true.
const NO_RESULT = { planId: null, signature: null, ...EMPTY_VALIDATION, delayed: false }

// What the dry-run actually depends on. A refetch hands back a NEW array with
// identical contents on every invalidate, so comparing content — not identity —
// is what stops the loop from firing a request per background refetch.
function blockSignature(weeklyPlanId, blocks) {
  const parts = (blocks ?? [])
    .map((b) => `${b.planBlockId}@${b.startAt}~${b.endAt}#${b.blockType}#${b.status}`)
    .sort()
  return `${weeklyPlanId}|${parts.join(',')}`
}

/**
 * The validation dry-run loop (AC-1): local block change → 300ms debounce → POST
 * validation-issues → badges, block marks and the review panel all update from
 * ONE result object.
 *
 * Deliberately NOT a useQuery: this is a POST whose body is the local draft, it
 * must never be cached or auto-retried, and — most importantly — the previous
 * result has to SURVIVE a failure. TanStack would surface an error state; the AC
 * requires the last good result to stay on screen with a "검증 지연" marker
 * instead, because a plan silently showing zero violations is worse than a plan
 * showing slightly stale ones.
 *
 * Out-of-order responses are the real hazard here (this codebase has already
 * been bitten by a late response overwriting a newer one — see useMoveBlock's
 * header). Every run takes a sequence number and only the CURRENT one is allowed
 * to write state, so a slow early dry-run that lands after a fast later one is
 * discarded rather than resurrecting stale violations.
 *
 * DISPLAY AND GATE ARE TWO DIFFERENT QUESTIONS, and this hook answers both
 * separately. "Keep showing the last result on failure" (AC-1) is a DISPLAY rule;
 * reusing it as the SAVE rule would mean a plan is judged safe by a check that
 * never ran on it. So the result carries the `signature` of the block set it was
 * computed FROM, and `stale` compares that against the block set on screen right
 * now. Anything the counts cannot vouch for — first load, the debounce window,
 * an in-flight request, a failed one — makes `stale` true while the badges and
 * the panel keep showing the last thing we did know.
 *
 * @param {{weeklyPlanId?: string, blocks: Array, enabled?: boolean}} args
 *   `blocks` must be referentially stable across renders that didn't change it
 *   (the caller memoizes it), otherwise the debounce is rescheduled forever.
 */
export function usePlanValidation({ weeklyPlanId, blocks, enabled = true }) {
  // planId is stored WITH the result so a week change invalidates it by
  // comparison during render — no reset effect, no setState-in-effect.
  const [state, setState] = useState(NO_RESULT)
  const [inFlight, setInFlight] = useState(false)
  const seqRef = useRef(0)
  const lastSignatureRef = useRef(null)

  // The block set as it stands RIGHT NOW. Recomputed only when the memoized
  // `blocks` identity changes, and compared against the signature the current
  // result was computed from.
  const currentSignature = useMemo(
    () => blockSignature(weeklyPlanId, blocks),
    [weeklyPlanId, blocks],
  )

  const runValidation = useCallback(
    (blocksToCheck, signature) => {
      if (!weeklyPlanId) return
      seqRef.current += 1
      const seq = seqRef.current
      setInFlight(true)
      validatePlan(weeklyPlanId, blocksToCheck)
        .then((next) => {
          if (seq !== seqRef.current) return // a newer run already answered
          // Stamp the result with WHAT it was computed from — that stamp is the
          // whole basis of `stale`, and therefore of the save gate.
          setState({ planId: weeklyPlanId, signature, ...next, delayed: false })
        })
        .catch(() => {
          if (seq !== seqRef.current) return
          // Keep the last good result VISIBLE; its signature stays whatever it
          // was, so it can no longer vouch for the current blocks and the gate
          // closes on its own.
          setState((prev) => ({ ...prev, delayed: true }))
          // Forget the signature we just failed on, so the next time the blocks
          // arrive (any edit, or the background refetch another mutation
          // triggers) counts as "changed" and the loop retries by itself. Without
          // this, one failed dry-run would freeze the badges until the user
          // happened to edit something.
          lastSignatureRef.current = null
        })
        .finally(() => {
          // Only the newest run owns this flag; an older one finishing later must
          // not declare the newer one done.
          if (seq === seqRef.current) setInFlight(false)
        })
    },
    [weeklyPlanId],
  )

  useEffect(() => {
    if (!enabled || !weeklyPlanId) return undefined
    const timer = setTimeout(() => {
      if (currentSignature === lastSignatureRef.current) return
      lastSignatureRef.current = currentSignature
      runValidation(blocks, currentSignature)
    }, VALIDATION_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [enabled, weeklyPlanId, blocks, currentSignature, runValidation])

  /** Force a run regardless of the signature (used after a save conflict). */
  const revalidate = useCallback(
    (currentBlocks) => {
      lastSignatureRef.current = null
      runValidation(currentBlocks, blockSignature(weeklyPlanId, currentBlocks))
    },
    [runValidation, weeklyPlanId],
  )

  /**
   * Adopt issues the SERVER handed us outside the dry-run — the 409 save
   * conflict's `details.issues` (AC-4). Bumping the sequence first means an
   * in-flight dry-run started before the save can't overwrite them.
   *
   * The adopted result is stamped `signature: null` ON PURPOSE. These issues
   * describe the SERVER's newer version of the week, not the block set on this
   * screen, so they may show what is wrong but must not be allowed to certify
   * anything as savable — `stale` stays true until a real dry-run runs.
   */
  const applyServerIssues = useCallback(
    (issues) => {
      seqRef.current += 1
      lastSignatureRef.current = null
      setInFlight(false)
      setState({
        planId: weeklyPlanId,
        signature: null,
        ...normalizeValidationPayload({ issues }),
        delayed: false,
      })
    },
    [weeklyPlanId],
  )

  // A result from a different week is simply not ours (week nav is instant, the
  // dry-run is not).
  const isCurrent = state.planId === weeklyPlanId && weeklyPlanId != null
  return {
    issues: isCurrent ? state.issues : EMPTY_VALIDATION.issues,
    blockingCount: isCurrent ? state.blockingCount : 0,
    warningCount: isCurrent ? state.warningCount : 0,
    // "검증 지연": the last dry-run didn't answer, so what's shown may be behind.
    delayed: isCurrent ? state.delayed : false,
    hasResult: isCurrent,
    /*
      The gate input. True whenever the counts above cannot be trusted to
      describe the blocks currently on screen:
        !isCurrent                 — nothing validated for this week yet
        delayed                    — the last attempt failed; the result predates it
        inFlight                   — an answer is on its way; this one is superseded
        signature mismatch         — edited since (covers the debounce window, the
                                     optimistic-update gap, and server-supplied issues)
      Display never reads this — only the save gate does.
    */
    stale:
      !isCurrent || state.delayed || inFlight || state.signature !== currentSignature,
    revalidate,
    applyServerIssues,
  }
}

/**
 * PUT /weekly-plans/{id} with status CONFIRMED — PLAN-03 저장. Success invalidates
 * the week (the server may renumber/adjust on confirm) and announces it.
 *
 * No onError here ON PURPOSE: the save's failure branches are not generic. A 409
 * has to re-sync the review panel and restore the disabled save button (AC-4),
 * which needs the validation handle the CALLER owns, so the caller passes its own
 * onError to `mutate`.
 */
export function useSaveWeek() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ weeklyPlanId, weekStartDate, weekEndDate, totalPlannedMinutes }) =>
      saveWeek(weeklyPlanId, { weekStartDate, weekEndDate, totalPlannedMinutes }),
    onSuccess: (_data, { weekStartISO }) => {
      queryClient.invalidateQueries({ queryKey: weekPlanKey(weekStartISO) })
      toast({ tone: 'success', message: '주간 계획을 저장했습니다' })
    },
  })
}

// --- ST-F1-07: replan alternatives (PLAN-29 · RB-PLAN-03~05) -----------------

// NFR-029 "진행 5초 안내" — a slow-connection NOTICE, not a spinner replacement.
// The three strategies below run in parallel, so this timer covers the WHOLE
// batch: if even one is still in flight 5s after generation started, the modal
// says so instead of leaving a bare per-card skeleton with no explanation.
const SLOW_GENERATE_MS = 5000

const IDLE_STRATEGY_STATE = { status: 'idle', option: null, error: null }

function initialStrategyState() {
  return Object.fromEntries(GENERATED_STRATEGY_TYPES.map((t) => [t, IDLE_STRATEGY_STATE]))
}

/**
 * Drives the THREE generated alternatives (MINIMAL_CHANGE/DEADLINE_FIRST/
 * WORKLOAD_BALANCE) as an explicit per-strategy state machine — idle → loading →
 * success | error — so one strategy failing to generate never blocks the other
 * two from rendering (a partial result beats an all-or-nothing spinner). The
 * BASELINE (기존 계획 유지안) alternative is NOT modeled here: it never calls the
 * server at all — see replanStrategies.js's BASELINE_OPTION, which
 * ReplanOptionsModal renders as a fourth, always-ready card.
 *
 * NOT a useQuery: each call's body is "generate a NEW alternative against the
 * CURRENT draft", never cached, never meaningfully retried (a stale-server retry
 * of "generate" is not the same request once the draft has moved on) — the same
 * reasoning usePlanValidation gives for being a plain callback-driven hook.
 *
 * Deliberately NOT wired to a persisted default strategy here: FIX-12's "재계획
 * 대안 기본값" picker is ST-F1-12, which does not exist yet, so there is no
 * `user_preferences.default_replan_strategy` value to read. The caller
 * (WeeklyPage) defaults the modal's SELECTION to BASELINE instead — the one
 * alternative that changes nothing, which is the safest default when no
 * preference has been set (see ReplanOptionsModal).
 */
export function useReplanOptions(weeklyPlanId) {
  const [byType, setByType] = useState(initialStrategyState)
  const [slowNotice, setSlowNotice] = useState(false)
  const slowTimerRef = useRef(null)
  // Guards a late response from a PREVIOUS generate() call (e.g. a fast retry
  // right after a slow initial batch) from overwriting a newer one's state.
  const seqRef = useRef(0)

  const runOne = useCallback(
    (strategyType, seq) => {
      setByType((prev) => ({ ...prev, [strategyType]: { status: 'loading', option: null, error: null } }))
      generateReplanOption(weeklyPlanId, strategyType)
        .then((option) => {
          if (seq !== seqRef.current) return
          setByType((prev) => ({ ...prev, [strategyType]: { status: 'success', option, error: null } }))
        })
        .catch((error) => {
          if (seq !== seqRef.current) return
          setByType((prev) => ({ ...prev, [strategyType]: { status: 'error', option: null, error } }))
        })
    },
    [weeklyPlanId],
  )

  const generate = useCallback(
    (types = GENERATED_STRATEGY_TYPES) => {
      if (!weeklyPlanId) return
      seqRef.current += 1
      const seq = seqRef.current
      clearTimeout(slowTimerRef.current)
      setSlowNotice(false)
      slowTimerRef.current = setTimeout(() => setSlowNotice(true), SLOW_GENERATE_MS)
      for (const type of types) runOne(type, seq)
    },
    [weeklyPlanId, runOne],
  )

  // Regenerate just the ONE strategy a user asked to retry, leaving the other
  // two (already succeeded or still loading) alone.
  const retry = useCallback((type) => generate([type]), [generate])

  const reset = useCallback(() => {
    seqRef.current += 1 // invalidate any response still in flight
    clearTimeout(slowTimerRef.current)
    setByType(initialStrategyState())
    setSlowNotice(false)
  }, [])

  useEffect(() => () => clearTimeout(slowTimerRef.current), [])

  const isGenerating = Object.values(byType).some((s) => s.status === 'loading')
  // No effect needed to take `slowNotice` back down once generation finishes:
  // every consumer reads it as `slowNotice && isGenerating` (see
  // ReplanOptionsModal), so a stale `true` left over from a just-finished batch
  // is already inert — and the NEXT generate() call clears it itself before
  // arming a fresh timer, so nothing is left "on" would ever surface again.

  return { byType, generate, retry, reset, isGenerating, slowNotice }
}

/**
 * PATCH /replan-options/{id}/selection — AC-3 "초안 교체 반영". The endpoint
 * returns no updated week (07 spec: `{message:"APPLIED"}` only), so success just
 * invalidates the week query; the caller (WeeklyPage) is expected to ALSO force
 * `validation.revalidate(blocks)` afterward, same split as
 * useToggleFixedException's header explains — this hook only knows about the
 * week cache, not the validation loop.
 *
 * No onError here on purpose (mirrors useSaveWeek): a 409 on this endpoint means
 * "this option is no longer selectable" (already applied, or the plan moved on
 * since it was generated) and the recovery is "다시 생성", which is a
 * modal-specific UI decision the CALLER makes, not a generic toast this hook
 * could give on its own.
 */
export function useApplyReplanOption() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ replanOptionId }) => selectReplanOption(replanOptionId),
    onSuccess: (_data, { weekStartISO }) => {
      queryClient.invalidateQueries({ queryKey: weekPlanKey(weekStartISO) })
    },
  })
}
