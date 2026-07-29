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
import { unwrapList } from '../../api/unwrap'
import { clampPriority } from './planPlacement'

/** Normalize a task to the camelCase shape the panel reads (tolerates snake_case). */
function normalizeTask(t) {
  return {
    taskId: t.taskId ?? t.task_id,
    projectId: t.projectId ?? t.project_id ?? null,
    projectName: t.projectName ?? t.project_name ?? null,
    title: t.title,
    estimatedMinutes: t.estimatedMinutes ?? t.estimated_minutes ?? 60,
    // null stays null here (this panel sorts unknown priorities LAST — see
    // byPriorityThenDue's own 99 default — rather than treating them as 보통).
    priority: clampPriority(t.priority, null),
    dueDate: t.dueDate ?? t.due_date ?? null,
    // The optimistic-lock counter, carried so a completion toggle driven from
    // THIS list can send it without re-reading the task (see patchTaskStatus).
    version: t.version ?? t.task_version ?? null,
    // Present only on auto-place leftovers (AC-3): why a task stayed unplaced.
    reason: t.reason ?? null,
  }
}

// tasks.status values (ERD) that mean the task is NOT in the unplaced backlog.
const PLACED_OR_DONE = new Set(['IN_PROGRESS', 'COMPLETED'])

/**
 * OP-TASK-UNPLACED → GET /tasks?status=UNASSIGNED.
 *
 * PARAM CORRECTION (BE 확인, 2026-07-29): the real endpoint takes NO
 * `projectId` query param — it was being sent as a filter the server simply
 * has no binding for. A project-scoped call therefore filters client-side on
 * the normalized `projectId` instead of asking the server to.
 *
 * `status` is likewise re-checked here rather than trusted: if the server
 * ignores that param too (unconfirmed — BE only ruled on `projectId`), an
 * unfiltered list would otherwise render every task in the account as
 * "미배치". Deliberately a DENY list of the two ERD values that mean "not in
 * the backlog" (IN_PROGRESS = 배치됨, COMPLETED = 완료), not an allow-list of
 * 'UNASSIGNED': an enum value this FE doesn't recognize — or a payload with no
 * status at all, which is what the DEV mock returns — then still shows up.
 * Showing one task too many is recoverable; silently emptying the panel
 * because the server spells a status differently is not.
 *
 * `size` (실서버 확인, 2026-07-29): this endpoint is PAGED — `size` defaults to
 * 20 and caps at 100 — so sending nothing silently truncated the backlog at 20
 * with no indication, which the client-side project filter above would then
 * narrow further (a project's tasks could vanish entirely just for sitting
 * past the first page). 100 is the server's own maximum, taken here as a
 * deliberate ceiling, not a fix: the response's `meta.page` is dropped by
 * client.js's interceptor, so nothing on this path can even SEE that a 101st
 * task exists. Real paging needs that meta first (see the readiness doc's
 * "meta 유실" item); until then this is the widest single page available.
 */
export function getUnplacedTasks(projectId) {
  return withDevFallback(
    () => apiClient.get('/tasks', { params: { status: 'UNASSIGNED', size: 100 } }),
    () => mockBackend.getUnplacedTasks(projectId),
    // Real server: GET /tasks returns the array directly (`data:[Task]`). Mock
    // fixture: `{ tasks: [...] }`. unwrapList tolerates both (see api/unwrap.js).
  ).then((r) =>
    unwrapList(r, 'tasks')
      .filter((t) => !PLACED_OR_DONE.has(t.status ?? t.task_status ?? null))
      .map(normalizeTask)
      .filter((t) => !projectId || t.projectId === projectId),
  )
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
 * The task's current optimistic-lock version, read straight off GET /tasks/{id}
 * — "태스크 불러올 때 응답에 같이 오는 숫자". Resolves to null instead of
 * throwing when the read fails, so a DEV run against no backend still reaches
 * patchTaskStatus's own mock fallback rather than dying on the lookup; against
 * a real server the PATCH that follows is what surfaces the failure.
 */
function readTaskVersion(taskId) {
  return apiClient
    .get(`/tasks/${taskId}`)
    .then((t) => t?.version ?? t?.task_version ?? null)
    .catch(() => null)
}

/**
 * OP-TASK-STATUS → PATCH /tasks/{taskId}/status (PLAN-13/14 완료/미완료).
 * Task-block completion mirrors onto its blocks.
 *
 * BODY CORRECTION (BE 확인, 2026-07-29): the real endpoint reads
 * `{ completed: boolean, version: number }` — NOT the `{ status: 'COMPLETED' }`
 * enum this used to send, which 400s. `version` is the task's optimistic-lock
 * counter, the same number every task read hands back.
 *
 * The weekly grid's toggle doesn't have that number: it acts on a plan BLOCK,
 * and a block payload carries no task version (planApi.normalizeBlock). So when
 * the caller can't supply one, the task is read first and the version THAT read
 * returned is what gets sent — the "받은 뒤에 그대로 같이 보내라" contract, just
 * resolved here instead of at every call site. Callers already holding a fresh
 * task (the unplaced list, which now carries `version`) pass it and skip the GET.
 */
export async function patchTaskStatus(taskId, completed, version) {
  const lockVersion = version ?? (await readTaskVersion(taskId))
  return withDevFallback(
    () => apiClient.patch(`/tasks/${taskId}/status`, { completed, version: lockVersion }),
    // The mock store still models completion as the task/block STATUS enum
    // (it mirrors the flag onto every block of the task, which is what the
    // grid re-reads) — the boolean is translated back for it here.
    () => mockBackend.setTaskStatus(taskId, completed ? 'COMPLETED' : 'IN_PROGRESS'),
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
