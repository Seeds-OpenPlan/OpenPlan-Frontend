/*
  AC-3 미리보기 for SCR-TASK-EDIT (ST-F1-09). Builds a VIRTUAL plan block from
  the edit form's CURRENT, UNSAVED values and runs it through the exact same
  dry-run the weekly plan itself uses (planApi.validatePlan, via
  usePlanValidation) — one validation engine, not a second implementation that
  could quietly disagree with the real grid. The dry-run WRITES NOTHING
  (planApi.js's own OP-PLAN-VALIDATE contract, "writes nothing" verbatim in its
  header) — that is the whole reason it is safe to run on every keystroke, and
  it is what makes PLAN-11 ("실제로 저장되지 않았습니다") an accurate caption
  rather than a hopeful one.

  TARGET WEEK ([가정—신규], AC-3 "the task's current weekly plan if placed,
  else the current/active week"): a project-store task (see projectApi.getTask
  and normalizeTask's own comments) carries NO plan-placement reference at
  all — the identical, already-documented gap TaskRow.jsx's own G-2 comment
  describes from the project side. There is therefore no reliable way to ask
  "which week is this task placed in" from here. This hook always previews
  against the CURRENT week and always computes a TENTATIVE slot for the
  virtual block (via findFirstFreeSlot — the SAME free-slot search the
  unplaced panel's own quick-place button uses, so "where would this land"
  answers consistently everywhere it is asked), even for an already-placed
  (IN_PROGRESS/배치됨) task. The `taskId`-exclusion filter below is kept
  anyway, wired correctly, so a future placement-aware getTask can slot a real
  match in without this hook's own logic changing — today it is simply a
  no-op (a project-store taskId never matches a plan-mock block's taskId).

  A SECOND, narrower limitation worth flagging: the mock's own V3 "마감일 이후
  배치" rule (planFixtures.js computeValidationIssues) reads a placed task's
  dueDate from the PLAN mock's OWN task registry (placedTaskData), not from
  the block payload sent in the dry-run body — so no ad-hoc virtual block,
  however it is shaped, can ever trigger V3 through this preview. Every other
  rule (V1 겹침 · V2 고정 일정 충돌 · V4 가용 시간 초과 · V5 가용 시간 밖 배치 ·
  V6 버퍼 부족) works normally, since those are computed purely from block
  timing/duration, which this virtual block genuinely has.
*/
import { useMemo } from 'react'
import { useAvailability, usePlanValidation, useWeekPlan } from '../plan/usePlanData'
import { composeTimestamp, currentWeekStartISO, weekDays } from '../plan/planTime'
import { findFirstFreeSlot } from '../plan/planPlacement'

// Never sent to a real server as a real id — validatePlan's dry-run body only
// needs ids to be internally consistent WITHIN one request, not persisted.
const PREVIEW_BLOCK_ID = '__task-edit-preview__'

/**
 * @param {{taskId: string, title: string, estimatedMinutes: number}} args
 *   No `dueDate` param: the mock's V3 rule can't read it from an ad-hoc
 *   virtual block regardless (see the header comment's second limitation),
 *   so accepting it here would only suggest a capability this hook doesn't
 *   have.
 */
export function useTaskEditPreview({ taskId, title, estimatedMinutes }) {
  const weekStartISO = currentWeekStartISO()
  const weekQuery = useWeekPlan(weekStartISO)
  const availabilityQuery = useAvailability()

  const week = weekQuery.data
  const availability = availabilityQuery.data
  const days = useMemo(() => weekDays(weekStartISO), [weekStartISO])

  // The real week's blocks, minus any that belong to THIS task (see the
  // header comment — currently never matches anything, kept for forward
  // compatibility rather than removed as "dead").
  const otherBlocks = useMemo(
    () => (week?.blocks ?? []).filter((b) => b.taskId !== taskId),
    [week, taskId],
  )

  const virtualBlock = useMemo(() => {
    if (!availability) return null // still loading — nothing to search yet
    const duration = Math.max(5, Number(estimatedMinutes) || 0)
    const slot = findFirstFreeSlot({ days, availability, blocks: otherBlocks, durationMin: duration })
    if (!slot) return null
    const startAt = composeTimestamp(days[slot.dayIndex], slot.startMin)
    const endAt = composeTimestamp(days[slot.dayIndex], slot.startMin + duration)
    return {
      planBlockId: PREVIEW_BLOCK_ID,
      blockType: 'TASK',
      title: title?.trim() || '(제목 없음)',
      taskId: taskId ?? PREVIEW_BLOCK_ID,
      scheduleId: null,
      startAt,
      endAt,
      status: 'SCHEDULED',
    }
  }, [days, availability, otherBlocks, estimatedMinutes, title, taskId])

  const mergedBlocks = useMemo(
    () => (virtualBlock ? [...otherBlocks, virtualBlock] : otherBlocks),
    [otherBlocks, virtualBlock],
  )

  const validation = usePlanValidation({
    weeklyPlanId: week?.weeklyPlanId,
    blocks: mergedBlocks,
    enabled: Boolean(week?.weeklyPlanId) && Boolean(virtualBlock),
  })

  return {
    weekStartISO,
    days,
    availability: availability ?? [],
    blocks: mergedBlocks,
    virtualBlock,
    loading: weekQuery.isLoading || availabilityQuery.isLoading,
    // A week that HAS loaded but couldn't fit the virtual block anywhere
    // (a genuinely full week) — distinct from "still loading".
    noSlot: Boolean(week) && Boolean(availability) && !virtualBlock,
    ...validation,
  }
}

export default useTaskEditPreview
