/*
  OP functions for the unplaced panel & task placement (ST-F1-03 — ux-flow-map §2,
  api-contracts §2.7). Each maps 1:1 to an endpoint; the TanStack hooks call ONLY
  these, never apiClient directly, so the OP↔endpoint mapping stays in one place.

  Placement is a two-phase auto flow per the story AC (RB-PLAN-01):
    POST .../auto-placements  → a DRAFT set of proposed placements (no write)
    POST .../block-batches    → commit the applied draft
  keeping "적용 = 초안 확정, 저장(확정)은 별개" (C-2 double protection). The DEV
  mock fallback mirrors planApi's: real path in prod, mock only on a network error.
*/

import { apiClient } from '../../api/client'
import { withDevFallback } from './planApi'
import { mockBackend } from './planFixtures'

/** Normalize a task to the camelCase shape the panel reads (tolerates snake_case). */
function normalizeTask(t) {
  return {
    taskId: t.taskId ?? t.task_id,
    projectId: t.projectId ?? t.project_id ?? null,
    projectName: t.projectName ?? t.project_name ?? null,
    title: t.title,
    estimatedMinutes: t.estimatedMinutes ?? t.estimated_minutes ?? 60,
    priority: t.priority ?? null,
    dueDate: t.dueDate ?? t.due_date ?? null,
    // Present only on auto-place leftovers (AC-3): why a task stayed unplaced.
    reason: t.reason ?? null,
  }
}

/** OP-TASK-UNPLACED → GET /tasks?status=UNASSIGNED (optionally project-filtered). */
export function getUnplacedTasks(projectId) {
  const params = { status: 'UNASSIGNED' }
  if (projectId) params.projectId = projectId
  return withDevFallback(
    () => apiClient.get('/tasks', { params }),
    () => mockBackend.getUnplacedTasks(projectId),
  ).then((r) => (r?.tasks ?? []).map(normalizeTask))
}

/**
 * OP-PLAN-PLACE → POST /weekly-plans/{id}/blocks (blockType=TASK). Places one
 * task at a target span. Returns { planBlockId }.
 */
export function postBlock(weeklyPlanId, body) {
  return withDevFallback(
    () => apiClient.post(`/weekly-plans/${weeklyPlanId}/blocks`, body),
    () => mockBackend.createBlock(weeklyPlanId, body),
  )
}

/**
 * OP-PLAN-AUTOPLACE → POST /weekly-plans/{id}/auto-placements. Returns a DRAFT
 * { placements, unplaced } — no server-side write happens here (the draft is
 * applied later via postBlockBatch).
 */
export function postAutoPlacements(weeklyPlanId, priorityType = 'DEADLINE_FIRST') {
  return withDevFallback(
    () => apiClient.post(`/weekly-plans/${weeklyPlanId}/auto-placements`, { priorityType }),
    () => mockBackend.autoPlace(weeklyPlanId, priorityType),
  ).then((r) => ({
    placements: r?.placements ?? [],
    unplaced: (r?.unplaced ?? []).map(normalizeTask),
  }))
}

/**
 * OP-PLAN-BLOCKBATCH → POST /weekly-plans/{id}/block-batches. Commits an applied
 * auto-place draft as a batch of blocks. Returns { placedCount }.
 */
export function postBlockBatch(weeklyPlanId, placements) {
  return withDevFallback(
    () => apiClient.post(`/weekly-plans/${weeklyPlanId}/block-batches`, { placements }),
    () => mockBackend.commitBatch(weeklyPlanId, placements),
  )
}

/**
 * OP-TASK-STATUS → PATCH /tasks/{taskId}/status (PLAN-13/14 완료/미완료). `status`
 * is 'COMPLETED' or 'IN_PROGRESS'. Task-block completion mirrors onto its blocks.
 */
export function patchTaskStatus(taskId, status) {
  return withDevFallback(
    () => apiClient.patch(`/tasks/${taskId}/status`, { status }),
    () => mockBackend.setTaskStatus(taskId, status),
  )
}

/**
 * OP-TASK-EXEC → POST /tasks/{taskId}/execution-records (PLAN-15 실제 시간 기록).
 * Body: { startedAt, endedAt, actualMinutes, memo }. Returns { executionRecordId }.
 *
 * Guards `taskId` explicitly rather than letting a missing one silently
 * become the literal string "undefined" in the URL (`POST
 * /tasks/undefined/execution-records`) — the mock backend below never
 * validates its `taskId` argument at all, so this call used to succeed
 * against the mock while a real server would 404/400 it. The caller (dashboard
 * TodayBoard's [기록] button) is now gated on `item.taskId` existing before
 * this ever fires, but this stays a hard guard rather than trusting every
 * future caller to remember that.
 */
export function postExecutionRecord(taskId, body) {
  if (taskId == null) {
    return Promise.reject(new Error('postExecutionRecord: taskId is required'))
  }
  return withDevFallback(
    () => apiClient.post(`/tasks/${taskId}/execution-records`, body),
    () => mockBackend.logExecution(taskId, body),
  )
}
