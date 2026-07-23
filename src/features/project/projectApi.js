/*
  OP functions for the project screens (ST-F1-08 — ui-spec §PROJ, api-contracts
  §2.5). Each maps 1:1 to an endpoint from the 07 API 명세서 (the authoritative
  contract per the story's own note — it wins over FE-1 작업지시 wording where
  the two disagree, same convention planApi.js/taskApi.js already follow).

  DEV fallback mirrors planApi.js's own rule: the real call runs first; only a
  genuine network failure (no server reachable) falls back to the in-memory
  mock, so the mock→real swap stays a base-URL change (build-plan §3). Kept as
  a LOCAL copy of the same tiny retry wrapper rather than importing
  planApi.withDevFallback — project and plan are separate feature folders
  (src/features/plan vs src/features/project) and neither owns the other.
*/

import { apiClient } from '../../api/client'
import { mockBackend } from './projectFixtures'

async function withDevFallback(realCall, mockCall) {
  try {
    return await realCall()
  } catch (error) {
    if (import.meta.env.DEV && error?.isNetwork) return mockCall()
    throw error
  }
}

/*
  ASSUMPTION (§보고): the 07 spec's list/detail response samples are thin
  (`{projects: []}` / `{projectId, title, description}`) and document no
  aggregate fields at all — no taskCount/completedCount/placedCount/
  unplacedCount, nothing the list-card badges (§PROJ.0.2) or the completion
  progress bar (§PROJ.0.3) could read. Rather than an N+1 fetch of every
  project's task list just to compute a badge, this adapter reads those
  aggregates OPTIMISTICALLY off the project payload (falling back to 0 when
  absent) on the assumption the real endpoint will eventually include them
  (a common "list with rollup counts" shape). The DEV mock backend computes
  them for real from its own task store so the screen is honestly
  demonstrable; a real server that omits them will simply show zero counts
  everywhere until BE adds the rollup — flagged for the lead/BE-1 to confirm.

  Also tolerates `title` (the CSV detail SAMPLE uses this key) alongside
  `name` (the ERD column, and what create/edit send) — likely a spec typo,
  not two real fields; same "accept both, mock is authoritative-ish" stance
  planApi.js takes on snake_case/camelCase.
*/
function normalizeProject(p) {
  return {
    projectId: p.projectId ?? p.project_id,
    name: p.name ?? p.title ?? '',
    description: p.description ?? '',
    dueDate: p.dueDate ?? p.due_date ?? null,
    status: p.status ?? 'IN_PROGRESS',
    priority: p.priority ?? 2,
    closedAt: p.closedAt ?? p.closed_at ?? null,
    version: p.version ?? 1,
    taskCount: p.taskCount ?? p.task_count ?? 0,
    completedCount: p.completedCount ?? p.completed_count ?? 0,
    placedCount: p.placedCount ?? p.placed_count ?? 0,
    unplacedCount: p.unplacedCount ?? p.unplaced_count ?? 0,
    dueSoonCount: p.dueSoonCount ?? p.due_soon_count ?? 0,
  }
}

function normalizeTask(t) {
  return {
    taskId: t.taskId ?? t.task_id,
    projectId: t.projectId ?? t.project_id ?? null,
    title: t.title,
    memo: t.memo ?? '',
    estimatedMinutes: t.estimatedMinutes ?? t.estimated_minutes ?? 60,
    priority: t.priority ?? 2,
    dueDate: t.dueDate ?? t.due_date ?? null,
    status: t.status ?? 'UNASSIGNED', // UNASSIGNED · IN_PROGRESS · COMPLETED (ERD tasks.status)
    dueSoon: t.dueSoon ?? t.due_soon ?? false, // [가정] — no documented "마감 임박" flag; see §PROJ.0.2
    // §CONTRACT GAP (G-2, owner review 2026-07-24, for BE-1): an
    // IN_PROGRESS (배치됨) task's row has no way to say WHICH plan block or
    // week it's placed in — no weekStartISO, no planBlockId. That's why
    // TaskRow renders no "배치 해제" action for this status (see that
    // file's own comment) — usePlanData.useRemoveBlockWithUndo (PLAN-16)
    // needs both to unplace anything. If this endpoint (or a future
    // OP-PROJ-WBS revision) starts returning them per task, that hook
    // becomes directly reusable here.
  }
}

/** OP-PROJ-LIST → GET /projects. No server `status` filter is relied on here
 * (§PROJ.0.1's two tabs — 진행중/종료 — don't map cleanly onto the ERD's three
 * values IN_PROGRESS/PAUSED/CLOSED; a 중지 project has to surface somewhere,
 * and the 진행중 tab is the only place it visually fits). Always fetches the
 * FULL list; the page splits it into tabs client-side (진행중 tab = anything
 * not CLOSED, 종료 tab = CLOSED) — same "fetch once, filter client-side"
 * choice usePlanData.useUnplacedTasks makes for its own project chips. */
export function getProjects() {
  return withDevFallback(
    () => apiClient.get('/projects'),
    () => mockBackend.getProjects(),
  ).then((r) => (r?.projects ?? []).map(normalizeProject))
}

/** OP-PROJ-DETAIL → GET /projects/{id}. */
export function getProject(projectId) {
  return withDevFallback(
    () => apiClient.get(`/projects/${projectId}`),
    () => mockBackend.getProject(projectId),
  ).then(normalizeProject)
}

/** OP-PROJ-CREATE → POST /projects. Returns { projectId }. */
export function createProject(body) {
  return withDevFallback(
    () => apiClient.post('/projects', body),
    () => mockBackend.createProject(body),
  )
}

/** OP-PROJ-UPDATE → PATCH /projects/{id} (name/description/dueDate/priority,
 * and — per the 07 spec's own PATCH body sample — status too, though
 * §PROJ.5 sends status through the DEDICATED endpoint below when only the
 * status changed; this one is used for the info-only edit half of "관리"). */
export function updateProject(projectId, body) {
  return withDevFallback(
    () => apiClient.patch(`/projects/${projectId}`, body),
    () => mockBackend.updateProject(projectId, body),
  )
}

/**
 * OP-PROJ-STATUS → PATCH /projects/{id}/status.
 *
 * DIVERGENCE NOTE (§보고): the 07 spec's OWN request sample for this endpoint
 * sends `{"status":"ON_HOLD"}`, but the ERD (12. 상세 ERD)'s `projects.status`
 * column is documented as `IN_PROGRESS / PAUSED / CLOSED` — "ON_HOLD" appears
 * nowhere else in either source. The ERD is treated as authoritative for the
 * ENUM VALUES themselves (the 07 sample is presumably a stray draft value),
 * so this adapter sends/expects PAUSED for "중지". Flagged for BE-1 to confirm
 * which string the real server actually accepts.
 */
export function updateProjectStatus(projectId, status) {
  return withDevFallback(
    () => apiClient.patch(`/projects/${projectId}/status`, { status }),
    () => mockBackend.updateProjectStatus(projectId, status),
  )
}

/** OP-PROJ-DELETE → DELETE /projects/{id}. */
export function deleteProject(projectId) {
  return withDevFallback(
    () => apiClient.delete(`/projects/${projectId}`),
    () => mockBackend.deleteProject(projectId),
  )
}

/** OP-PROJ-TASKS → GET /projects/{id}/tasks. */
export function getProjectTasks(projectId) {
  return withDevFallback(
    () => apiClient.get(`/projects/${projectId}/tasks`),
    () => mockBackend.getProjectTasks(projectId),
  ).then((r) => (r?.tasks ?? []).map(normalizeTask))
}

/** OP-TASK-CREATE → POST /projects/{id}/tasks (PROJ-17 태스크 추가). Returns
 * { taskId }. */
export function createTask(projectId, body) {
  return withDevFallback(
    () => apiClient.post(`/projects/${projectId}/tasks`, body),
    () => mockBackend.createTask(projectId, body),
  )
}

/**
 * OP-TASK-UPDATE → PATCH /tasks/{taskId} (G-1, owner review 2026-07-24).
 * [가정 — 신규]: no endpoint anywhere in the 07 spec or this codebase edits a
 * task's own metadata (title/estimatedMinutes/priority/dueDate/memo) — that
 * was always SCR-TASK-EDIT's job (ST-F1-09, not built yet). The owner asked
 * for edit NOW, routed through THIS screen instead of a dedicated page, so
 * unlike G-2/G-9 (which reuse an existing write) this one genuinely has
 * nothing to reuse — flagged for BE-1 to confirm the real path/verb once
 * ST-F1-09 defines its own contract; this adapter follows the same
 * `PATCH /tasks/{id}/schedule` shape `updateTaskSchedule` above already uses
 * for the other task-scoped write. Body is a partial merge (only fields the
 * form actually edited), matching `updateProject`'s own PATCH semantics.
 */
export function updateTask(taskId, body) {
  return withDevFallback(
    () => apiClient.patch(`/tasks/${taskId}`, body),
    () => mockBackend.updateTask(taskId, body),
  )
}

/** OP-TASK-DELETE → DELETE /tasks/{taskId} (G-1). Same [가정 — 신규] note as
 * updateTask above — no delete-a-task endpoint existed before this. */
export function deleteTask(taskId) {
  return withDevFallback(
    () => apiClient.delete(`/tasks/${taskId}`),
    () => mockBackend.deleteTask(taskId),
  )
}

/**
 * OP-PROJ-VALIDATION → GET /projects/{id}/validation-issues (RB-PROJ-02 구조
 * 경고 배너). The 07 spec documents this endpoint under "WBS/계획 뷰" with no
 * fixed issue-code catalog — the same "issues: []" shape as the weekly-plan
 * validation, adapted here via `structureWarnings.js` exactly like
 * violationMessages.js adapts the plan's own issues.
 */
export function getProjectStructureWarnings(projectId) {
  return withDevFallback(
    () => apiClient.get(`/projects/${projectId}/validation-issues`),
    () => mockBackend.getStructureWarnings(projectId),
  ).then((r) => r?.issues ?? [])
}

/**
 * OP-PROJ-DRAFT-CREATE → POST /projects/{id}/task-structuring-drafts
 * (RB-PROJ-01). Returns { draftId, tasks: [...] }.
 */
export function createStructuringDraft(projectId, body) {
  return withDevFallback(
    () => apiClient.post(`/projects/${projectId}/task-structuring-drafts`, body),
    () => mockBackend.createStructuringDraft(projectId, body),
  )
}

/**
 * OP-PROJ-DRAFT-APPLY → POST /projects/{id}/task-structuring-drafts/{draftId}/apply.
 * Body: { selectedTaskIds, mergePolicy }. Returns { createdTaskIds }.
 */
export function applyStructuringDraft(projectId, draftId, selectedTaskIds) {
  return withDevFallback(
    () =>
      apiClient.post(`/projects/${projectId}/task-structuring-drafts/${draftId}/apply`, {
        selectedTaskIds,
        mergePolicy: 'APPEND',
      }),
    () => mockBackend.applyStructuringDraft(projectId, draftId, selectedTaskIds),
  )
}

/** OP-PROJ-WBS → GET /projects/{id}/wbs (§PROJ.3 계획 탭). Returns { nodes }. */
export function getProjectWbs(projectId) {
  return withDevFallback(
    () => apiClient.get(`/projects/${projectId}/wbs`),
    () => mockBackend.getProjectWbs(projectId),
  ).then((r) =>
    (r?.nodes ?? []).map((n) => ({
      taskId: n.taskId ?? n.task_id,
      title: n.title,
      estimatedMinutes: n.estimatedMinutes ?? n.estimated_minutes ?? 60,
      plannedStartDate: n.plannedStartDate ?? n.planned_start_date ?? n.startDate ?? n.start_date ?? null,
      plannedEndDate: n.plannedEndDate ?? n.planned_end_date ?? n.endDate ?? n.end_date ?? null,
    })),
  )
}

/** OP-TASK-SCHEDULE → PATCH /tasks/{taskId}/schedule (PROJ-14 WBS 바 드래그
 * commit — day-only, no time-of-day). Body: { plannedStartDate, plannedEndDate }. */
export function updateTaskSchedule(taskId, { plannedStartDate, plannedEndDate }) {
  return withDevFallback(
    () => apiClient.patch(`/tasks/${taskId}/schedule`, { plannedStartDate, plannedEndDate }),
    () => mockBackend.updateTaskSchedule(taskId, { plannedStartDate, plannedEndDate }),
  )
}

/**
 * OP-PROJ-DUP (PROJ-10/11/12) — composed, NOT a single endpoint.
 *
 * DIVERGENCE NOTE (§보고): the 07 spec documents NO duplicate-project endpoint
 * at all — ui-spec §PROJ.6 itself names it only as "OP-PROJ-DUP" pending a
 * real contract. Rather than call a guessed URL that would 404 in production,
 * this composes the ALREADY-documented primitives a real server does support:
 * create the project, then re-create each task under it (preserving its
 * estimate/priority/dueDate), then re-apply any WBS date range the source
 * task had. This is exactly the copy a dedicated endpoint would perform
 * server-side — just done here, client-orchestrated, until BE-1 adds one.
 *
 * `sourceTasks`/`sourceWbsNodes` are what the CALLER already has loaded (the
 * WS page's own task-tab + WBS-tab queries) — no extra fetch needed here.
 */
export async function duplicateProject(project, sourceTasks, sourceWbsNodes, newName) {
  const { projectId: newProjectId } = await createProject({
    name: newName,
    description: project.description,
    dueDate: project.dueDate,
    priority: project.priority,
  })

  const wbsByTaskId = new Map((sourceWbsNodes ?? []).map((n) => [n.taskId, n]))
  for (const task of sourceTasks ?? []) {
    const { taskId: newTaskId } = await createTask(newProjectId, {
      title: task.title,
      memo: task.memo,
      estimatedMinutes: task.estimatedMinutes,
      priority: task.priority,
      dueDate: task.dueDate,
    })
    const range = wbsByTaskId.get(task.taskId)
    if (range?.plannedStartDate && range?.plannedEndDate) {
      await updateTaskSchedule(newTaskId, {
        plannedStartDate: range.plannedStartDate,
        plannedEndDate: range.plannedEndDate,
      })
    }
  }

  return { projectId: newProjectId }
}

export { normalizeProject, normalizeTask }
