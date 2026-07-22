/*
  OP functions for personal-schedule blocks (ST-F1-04 — PLAN-08 create, PLAN-17
  edit). Each maps 1:1 to an endpoint; consumers (TanStack hooks) call ONLY these.
  Same DEV mock-fallback rule as planApi/taskApi: real path in prod, mock only on a
  genuine network error, so the mock→real switch is a base-URL change only.
*/

import { apiClient } from '../../api/client'
import { withDevFallback } from './planApi'
import { mockBackend } from './planFixtures'

/**
 * OP-SCHED-CREATE → POST /weekly-plans/{id}/blocks (blockType=SCHEDULE, PLAN-08).
 * Body: { blockType:'SCHEDULE', title, startAt, endAt, status, estimatedMinutes,
 * priority, memo }. Returns { planBlockId, scheduleId }.
 */
export function postScheduleBlock(weeklyPlanId, body) {
  return withDevFallback(
    () => apiClient.post(`/weekly-plans/${weeklyPlanId}/blocks`, body),
    () => mockBackend.createScheduleBlock(weeklyPlanId, body),
  )
}

/**
 * OP-SCHED-UPDATE → PATCH /schedules/{scheduleId} (PLAN-17). Body: { title,
 * startAt, endAt, memo, status, estimatedMinutes, priority }.
 */
export function patchSchedule(scheduleId, patch) {
  return withDevFallback(
    () => apiClient.patch(`/schedules/${scheduleId}`, patch),
    () => mockBackend.updateSchedule(scheduleId, patch),
  )
}
