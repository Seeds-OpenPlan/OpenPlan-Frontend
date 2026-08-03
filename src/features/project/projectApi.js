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

  ONE DELIBERATE EXCEPTION to that "neither owns the other" rule: getTask/
  updateTask below also import planFixtures' own mockBackend — see their own
  header comments. The owner explicitly asked the DEV mock to resolve a task
  regardless of which mock store minted its id (a real backend has ONE tasks
  table and never has this problem at all); routing by the taskId's own
  namespace prefix (`task-*` vs `plan-task-*`, disjoint by construction — see
  planFixtures.js's own `nextId('plan-task')` comment) is the narrowest
  possible reach across that boundary, and only these two functions do it.
*/

import { apiClient } from '../../api/client'
import { mockBackend } from './projectFixtures'
import { mockBackend as planMockBackend } from '../plan/planFixtures'
import { clampPriority } from '../plan/planPlacement'
import { snapDuration } from '../plan/planTime'
import { unwrapList } from '../../api/unwrap'
import { fetchAllPages } from '../../api/paging'

// `plan-task-*` ids are minted only by planFixtures.js's own seed/placement
// code (never by this store) — see that file's own comment on the prefix.
const isPlanTaskId = (taskId) => typeof taskId === 'string' && taskId.startsWith('plan-task-')

async function withDevFallback(realCall, mockCall) {
  try {
    return await realCall()
  } catch (error) {
    if (import.meta.env.DEV && error?.isNetwork) return mockCall()
    throw error
  }
}

/*
  이 파일의 목록 함수는 전부 `api/unwrap.js`의 `unwrapList`를 쓴다. 예전엔 이
  파일 안에 같은 일을 하는 `toList`가 따로 있었는데(W2 실연결 때 여기서 먼저
  터진 버그의 응급 처치였다), 공용 헬퍼가 생긴 뒤로도 한동안 둘이 공존했다.
  같은 규칙을 두 곳에서 관리하면 한쪽만 고쳐지는 게 시간 문제라 하나로 합쳤다
  — 왜 이 가드가 필요한지(실서버는 벗겨진 배열, mock은 이름 붙은 객체)는
  unwrap.js 자신의 헤더에 있다.
*/
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
    // 1~3 only — the 정보 수정 PUT re-sends this value untouched (the form never
    // exposes it), so an out-of-range one would 400 (see clampPriority).
    priority: clampPriority(p.priority),
    closedAt: p.closedAt ?? p.closed_at ?? null,
    version: p.version ?? 1,
    taskCount: p.taskCount ?? p.task_count ?? 0,
    completedCount: p.completedCount ?? p.completed_count ?? 0,
    placedCount: p.placedCount ?? p.placed_count ?? 0,
    unplacedCount: p.unplacedCount ?? p.unplaced_count ?? 0,
    dueSoonCount: p.dueSoonCount ?? p.due_soon_count ?? 0,
  }
}

/*
  실서버 대조 (2026-07-29, TaskUpdateRequest): 편집 PATCH가 받는 건
  {title, memo, estimatedMinutes, priority, dueDate, categoryId, version}
  뿐이다. 편집 폼이 함께 보내던 두 필드는 각각 이렇게 어긋났다:

  - `status` — `@Null` 이라 담겨 오기만 해도 400("status는 지정할 수 없습니다").
    상태는 전용 엔드포인트(PATCH /tasks/{id}/status)만 바꾼다. 즉 지금까지
    태스크 편집 저장은 실서버에서 항상 실패했다. 폼의 상태 라디오는 그대로
    두되(모의 서버에선 계속 동작한다) 실 요청에서는 빼낸다 — 실서버 상태
    변경은 완료 토글이 담당한다.
  - `category` — 서버 필드는 `categoryId`(UUID)인데 이 앱의 카테고리는 아직
    GET /categories 자체가 404(미구현)라 목업 문자열이다. 문자열을 UUID 자리에
    실어 보내면 그 자체로 400이므로, 실 카테고리 엔드포인트가 생기기 전까지는
    보내지 않는다(모의 서버 쪽은 지금처럼 왕복한다).
*/
function toTaskUpdateBody(body) {
  const request = { ...body }
  delete request.status
  delete request.category
  return request
}

function normalizeTask(t) {
  return {
    taskId: t.taskId ?? t.task_id,
    projectId: t.projectId ?? t.project_id ?? null,
    title: t.title,
    memo: t.memo ?? '',
    // [가정—신규] (ST-F1-09 AC-1): the spec's preferred prefill source for a
    // task's default estimate is user_preferences (ST-F1-12, not built yet),
    // so both TaskCreateForm's create mode AND TaskEditPage's edit mode fall
    // back to this SAME hardcoded 60 until that settings surface exists —
    // one fallback number in one place, not a second copy on the edit page.
    //
    // snapDuration wraps the whole fallback chain: POST /projects/{id}/tasks
    // itself requires estimatedMinutes to be a 5-minute multiple (BE-confirmed
    // openapi contract), and this is the value TaskEditModal seeds its
    // MinuteStepper from AND re-sends untouched if the user never touches
    // that field — so an odd value here would round-trip straight back out.
    estimatedMinutes: snapDuration(t.estimatedMinutes ?? t.estimated_minutes ?? 60),
    // 1~3 only — 태스크 편집 prefills this select and 프로젝트 복제 copies it
    // straight into a create body (see clampPriority).
    priority: clampPriority(t.priority),
    dueDate: t.dueDate ?? t.due_date ?? null,
    status: t.status ?? 'UNASSIGNED', // UNASSIGNED · IN_PROGRESS · COMPLETED (ERD tasks.status)
    dueSoon: t.dueSoon ?? t.due_soon ?? false, // [가정] — no documented "마감 임박" flag; see §PROJ.0.2
    // [가정—신규] (ST-F1-09 AC-1 카테고리 Select): no ERD column/endpoint for a
    // task category exists yet (see getCategories below). `null` renders as
    // the edit form's "없음" option and round-trips through PATCH unchanged.
    category: t.category ?? null,
    // [가정—신규] (ST-F1-09 AC-4): optimistic-lock counter for the edit
    // page's conflict overlay. No other task write path in this codebase
    // needed it (create has nothing to conflict with; delete/schedule don't
    // send a body to lock); TaskEditPage is the first to.
    version: t.version ?? 1,
    // [가정—신규] (ST-F1-09 code review, Thomas item 5): last-saved
    // timestamp. ConflictOverlay.jsx's own `formatSavedAt` has always read
    // `latest?.updatedAt` for its "최신 저장 정보" box — nothing populated it
    // before this task shape did. `null` (not a fabricated "now") when the
    // source genuinely has none, so that box correctly stays hidden rather
    // than showing a fake time.
    updatedAt: t.updatedAt ?? t.updated_at ?? null,
    // §CONTRACT GAP (G-2, owner review 2026-07-24, for BE-1): an
    // IN_PROGRESS (배치됨) task's row has no way to say WHICH plan block or
    // week it's placed in — no weekStartISO, no planBlockId. That's why
    // TaskRow renders no "배치 해제" action for this status (see that
    // file's own comment) — usePlanData.useRemoveBlockWithUndo (PLAN-16)
    // needs both to unplace anything. If this endpoint (or a future
    // OP-PROJ-WBS revision) starts returning them per task, that hook
    // becomes directly reusable here. The SAME gap is why TaskEditPage's own
    // AC-3 preview (useTaskEditPreview.js) can never find a task's REAL
    // placement either — it always previews a tentative slot instead; see
    // that hook's own header comment.
  }
}

/** OP-PROJ-LIST → GET /projects. No server `status` filter is relied on here
 * (§PROJ.0.1's two tabs — 진행중/종료 — don't map cleanly onto the ERD's three
 * values IN_PROGRESS/PAUSED/CLOSED; a 중지 project has to surface somewhere,
 * and the 진행중 tab is the only place it visually fits). Always fetches the
 * FULL list; the page splits it into tabs client-side (진행중 tab = anything
 * not CLOSED, 종료 tab = CLOSED) — same "fetch once, filter client-side"
 * choice usePlanData.useUnplacedTasks makes for its own project chips.
 *
 * PAGING (W2+ meta 유실 해소): this endpoint pages too (server default
 * size=20, max 100) — walked in full via `fetchAllPages` (api/paging.js), the
 * same helper taskApi.getUnplacedTasks uses, rather than trusting one page to
 * be everyone's whole project list. Also switched to `unwrapList` here: the
 * bare `r?.projects ?? []` this used to read is exactly the "real server
 * returns an array, not `{projects:[...]}`" bug unwrap.js's own header
 * describes as having "already surfaced once in projectApi" — it had crept
 * back in on just these two functions (see getProjectTasks below too). */
export function getProjects() {
  const realCall = (page, size) => apiClient.get('/projects', { params: { page, size }, withMeta: true })
  // Mock fallback is wired ONLY into page 1 (fetchAllPages's own header
  // comment explains why: letting a LATER page also fall back risks
  // splicing page-1-real items together with the mock's whole list). Page
  // 2+ reuses `realCall` directly, unwrapped — no fallback possible there.
  const fetchFirstPage = (page, size) =>
    withDevFallback(
      () => realCall(page, size),
      () => mockBackend.getProjects().then((data) => ({ data, meta: null })),
    )
  return fetchAllPages(fetchFirstPage, realCall, (data) => unwrapList(data, 'projects')).then((items) =>
    items.map(normalizeProject),
  )
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

/**
 * OP-PROJ-UPDATE → PUT /projects/{id} (W2 live-connect correction, 2026-07-26).
 *
 * DIVERGENCE NOTE (§보고): the pre-W2 code called PATCH here per the 07 spec's
 * body sample. Live against the real server, PATCH /projects/{id} has no
 * route at all (only PUT is mapped — see ProjectController) and — because an
 * unmatched-method-but-matched-path request throws
 * HttpRequestMethodNotSupportedException, which the real server's
 * GlobalExceptionHandler has no specific handler for — it fell through to the
 * catch-all and came back as a confusing generic 500 (E-COM-005), not a 404/405.
 * Flagged for BE-1 as its own small bug (should 405), but the FE-side fix is
 * simply calling the verb the server actually maps: PUT.
 *
 * PUT also means **full replacement**, not a partial merge — the real
 * ProjectUpdateRequest requires all four editable fields (name/description/
 * dueDate/priority) AND a `version` (optimistic-lock input, 400 if missing,
 * confirmed live). `body` must carry the CURRENT priority/version even when
 * the caller's form never lets the user touch those fields (see
 * ProjectsPage.handleManageSubmit's own comment on why it now reads them off
 * `project` instead of leaving them out).
 */
export function updateProject(projectId, body) {
  return withDevFallback(
    () => apiClient.put(`/projects/${projectId}`, body),
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
 * so this adapter sends/expects PAUSED for "중지". Confirmed live: the real
 * server accepts PAUSED and rejects ON_HOLD (422 unrecognized enum), so no
 * further BE-1 confirmation is needed on this point.
 *
 * `version` (W2 live-connect correction, 2026-07-26): the pre-W2 code sent
 * only `{status}`. Live, the real ProjectStatusChangeRequest requires
 * `version` too (`@NotNull` — confirmed 400 E-COM-001 without it), the same
 * optimistic-lock input PUT above needs. The caller must pass the project's
 * CURRENT version — and if an info PUT just ran first in the same submit
 * (§PROJ.5's info-then-status sequence), the version THAT call returned, not
 * the stale pre-edit one, since the PUT already bumped it server-side (see
 * ProjectsPage.handleManageSubmit's own comment).
 */
export function updateProjectStatus(projectId, status, version) {
  return withDevFallback(
    () => apiClient.patch(`/projects/${projectId}/status`, { status, version }),
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

/** OP-PROJ-TASKS → GET /projects/{id}/tasks.
 *
 * 서버 기본 size=20(최대 100) — 이 목록엔 페이저가 없으므로 `fetchAllPages`
 * (api/paging.js)로 전 페이지를 이어 받는다(taskApi.getUnplacedTasks와 같은
 * 이유). `unwrapList`로 교체: 이전엔 `r?.tasks ?? []`를 그대로 읽어 실서버가
 * 벗겨진 배열을 주면 조용히 빈 목록이 되던 버그(unwrap.js 자체 헤더가 말하는
 * "이미 한 번 터진 버그")가 이 두 함수(getProjects 포함)에만 남아 있었다. */
export function getProjectTasks(projectId) {
  const realCall = (page, size) =>
    apiClient.get(`/projects/${projectId}/tasks`, { params: { page, size }, withMeta: true })
  // Mock fallback only on page 1 — see fetchAllPages's header on why a later
  // page must never be allowed to fall back to the mock's whole list.
  const fetchFirstPage = (page, size) =>
    withDevFallback(
      () => realCall(page, size),
      () => mockBackend.getProjectTasks(projectId).then((data) => ({ data, meta: null })),
    )
  return fetchAllPages(fetchFirstPage, realCall, (data) => unwrapList(data, 'tasks')).then((items) =>
    items.map(normalizeTask),
  )
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
 * OP-TASK-DETAIL → GET /tasks/{taskId} ([가정—신규], ST-F1-09). No endpoint
 * anywhere in the 07 spec or this codebase reads a SINGLE task by its bare id
 * before this story — every prior task read came bundled with a project
 * (getProjectTasks). SCR-TASK-EDIT is reached by just a taskId (a project
 * row's own 편집 action, TaskRow.jsx — or WeeklyPage.jsx's own 태스크 편집
 * context-menu item, `navigate(\`/tasks/${block.taskId}/edit\`)`), so it needs
 * to hydrate itself from that id alone, not from an already-loaded list.
 *
 * CROSS-STORE BRIDGE (owner follow-up, dev-server walkthrough — supersedes
 * this function's own earlier "CROSS-STORE GAP" note): a taskId reached via
 * WeeklyPage.jsx's "태스크 편집" context menu is a PLAN-store id
 * (`plan-task-*`, minted by planFixtures.js — never by this store), which
 * this store's own mockBackend.getTask (searching only tasksByProject) can
 * never resolve. The owner confirmed this used to matter in DEV ONLY — a
 * real backend has ONE `tasks` table and a placed block's task is always
 * real and editable there — so the mock now ROUTES by the id's own prefix
 * instead of always searching the project store:
 *   `task-*`      → mockBackend.getTask (unchanged — projectFixtures.js)
 *   `plan-task-*` → planMockBackend.getTask (planFixtures.js's own bridge —
 *                   see that function's header for the full contract)
 * SAFE BY CONSTRUCTION, not a reintroduction of the wrong-task BLOCKER
 * Thomas caught earlier: the two prefixes are DISJOINT (planFixtures.js's
 * own `nextId('plan-task')` comment), so a plan id can never reach the
 * PROJECT store's search and a project id can never reach the plan store's —
 * routing by prefix cannot cross-match, only correctly dispatch. An id
 * matching NEITHER store's prefix pattern (or matching one but genuinely
 * absent from it) still 404s — the real not-found path stays reachable
 * (TaskEditModalError renders in place, per that component's own comment).
 */
export function getTask(taskId) {
  return withDevFallback(
    () => apiClient.get(`/tasks/${taskId}`),
    () => (isPlanTaskId(taskId) ? planMockBackend.getTask(taskId) : mockBackend.getTask(taskId)),
  ).then(normalizeTask)
}

/**
 * OP-TASK-CATEGORIES → GET /categories ([가정—신규], ST-F1-09 AC-1). No
 * category endpoint or ERD column exists yet for tasks; see normalizeTask's
 * own `category` note. A small static list stands in until BE-1 defines the
 * real model.
 */
export function getCategories() {
  return withDevFallback(
    () => apiClient.get('/categories'),
    () => mockBackend.getCategories(),
  ).then((r) => unwrapList(r, 'categories'))
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
 *
 * Same namespace routing as getTask above (owner follow-up) — a `plan-task-*`
 * id's save goes to planMockBackend.updateTask instead of 404ing, including
 * the SAME optimistic-lock 409 (E-COM-006) contract, so ConflictOverlay/
 * "재시도" behave identically regardless of which store answers.
 */
export function updateTask(taskId, body) {
  return withDevFallback(
    () => apiClient.patch(`/tasks/${taskId}`, toTaskUpdateBody(body)),
    () => (isPlanTaskId(taskId) ? planMockBackend.updateTask(taskId, body) : mockBackend.updateTask(taskId, body)),
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
  ).then((r) => unwrapList(r, 'issues'))
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
    unwrapList(r, 'nodes').map((n) => ({
      taskId: n.taskId ?? n.task_id,
      title: n.title,
      // Same read-boundary snap as normalizeTask above, for consistency —
      // this WBS-node estimate only feeds WbsTimeline's day-count display
      // today (duplicateProject re-creates tasks from getProjectTasks's own
      // already-snapped list, not from here), but snapping every server
      // value this field name can come from keeps that guarantee true
      // regardless of which adapter a future caller reaches for.
      estimatedMinutes: snapDuration(n.estimatedMinutes ?? n.estimated_minutes ?? 60),
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
