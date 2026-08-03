/*
  TanStack Query wiring for the project screens (ST-F1-08). Server state only —
  local UI state (which overlay is open, draft edits before "선택 항목 저장")
  stays in the page/component (ADR-0002 boundary, same split usePlanData.js
  documents for the weekly plan).
*/

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  applyStructuringDraft,
  createProject,
  createStructuringDraft,
  createTask,
  deleteProject,
  deleteTask,
  duplicateProject,
  getProject,
  getProjects,
  getProjectStructureWarnings,
  getProjectTasks,
  getProjectWbs,
  getTask,
  updateProject,
  updateProjectStatus,
  updateTask,
  updateTaskSchedule,
} from './projectApi'
import { createTaskCategory, deleteTaskCategory, getTaskCategories } from './taskCategoryApi'
import { toast } from '../../hooks/useToasts'
import { systemMessages } from '../../constants/systemMessages'

export const projectsKey = () => ['projects']
export const projectKey = (projectId) => ['project', projectId]
export const projectTasksKey = (projectId) => ['projectTasks', projectId]
export const structureWarningsKey = (projectId) => ['projectStructureWarnings', projectId]
export const projectWbsKey = (projectId) => ['projectWbs', projectId]
export const taskKey = (taskId) => ['task', taskId]
export const taskCategoriesKey = () => ['taskCategories']

/** GET /projects — SCR-PROJ-LIST (§PROJ.1). Tabs split this client-side. */
export function useProjects() {
  return useQuery({
    queryKey: projectsKey(),
    queryFn: getProjects,
    staleTime: 30 * 1000,
  })
}

/** GET /projects/{id} — SCR-PROJ-WS header (§PROJ.2). */
export function useProject(projectId) {
  return useQuery({
    queryKey: projectKey(projectId),
    queryFn: () => getProject(projectId),
    enabled: Boolean(projectId),
    staleTime: 30 * 1000,
  })
}

/** POST /projects (PROJ-02). Invalidates the list so the new card appears;
 * the caller navigates to the new WS on success (no cache pre-seed — the WS
 * query just fetches once it mounts).
 *
 * No onError toast here ON PURPOSE (mirrors useSaveWeek/useUpdateProject):
 * OVL-PROJ-CREATE shows its own inline ErrorState + "다시 시도" with the
 * input preserved (§PROJ.4 AC), which a generic toast would only duplicate. */
export function useCreateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body) => createProject(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectsKey() })
    },
  })
}

/** PUT /projects/{id} (PROJ-06 정보 편집 절반 — real endpoint is PUT full-replace,
 * corrected from PATCH during W2 live-connect; see updateProject's own comment
 * in projectApi.js). */
export function useUpdateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, body }) => updateProject(projectId, body),
    onSuccess: (_data, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: projectsKey() })
      queryClient.invalidateQueries({ queryKey: projectKey(projectId) })
    },
    // No onError toast here on purpose (mirrors useSaveWeek): OVL-PROJ-MANAGE
    // shows a 409 as an inline OVL-CONFLICT-routed error, which is a
    // caller-specific decision, not a generic toast this hook can give.
  })
}

/** PATCH /projects/{id}/status (PROJ-07 상태 전환).
 *
 * No onError toast here either (same reasoning as useUpdateProject just
 * above): this is called right after the info PUT, from the SAME
 * OVL-PROJ-MANAGE submit chain, which surfaces either overlay's failure as
 * one inline error — a hook-level toast on top would double-report it.
 *
 * `version` (W2 live-connect correction, 2026-07-26): required by the real
 * endpoint's optimistic-lock check — see updateProjectStatus's own comment
 * in projectApi.js and ProjectsPage.handleManageSubmit's for why the CALLER
 * (not this hook) is responsible for picking the right version to send. */
export function useUpdateProjectStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, status, version }) => updateProjectStatus(projectId, status, version),
    onSuccess: (_data, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: projectsKey() })
      queryClient.invalidateQueries({ queryKey: projectKey(projectId) })
    },
  })
}

/** DELETE /projects/{id} (PROJ-09, AC-3 연쇄 삭제 확인 이후). */
export function useDeleteProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (projectId) => deleteProject(projectId),
    onSuccess: (_data, projectId) => {
      queryClient.invalidateQueries({ queryKey: projectsKey() })
      queryClient.removeQueries({ queryKey: projectKey(projectId) })
      toast({ tone: 'success', message: '프로젝트를 삭제했습니다' })
    },
    onError: () => toast({ tone: 'error', message: systemMessages.error.writeTitle }),
  })
}

/** OP-PROJ-DUP composite (PROJ-10~12, §PROJ.6 Step 3 복제 실행). See
 * projectApi.duplicateProject's own header for why this is a composed write,
 * not a single mutationFn call. */
export function useDuplicateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ project, sourceTasks, sourceWbsNodes, newName }) =>
      duplicateProject(project, sourceTasks, sourceWbsNodes, newName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectsKey() })
      toast({ tone: 'success', message: '복제본 프로젝트를 만들었습니다' })
    },
    // No onError toast here — Step 3 shows its own inline ErrorState with a
    // "다시 시도" that resubmits the SAME step (input/step preserved, §PROJ.6).
  })
}

/** GET /tasks/{taskId} — SCR-TASK-EDIT's own hydration (ST-F1-09, no bundled
 * project task list to read from — see projectApi.getTask's own header). */
export function useTask(taskId) {
  return useQuery({
    queryKey: taskKey(taskId),
    queryFn: () => getTask(taskId),
    enabled: Boolean(taskId),
  })
}

/**
 * GET /task-categories (W3, real endpoint — supersedes the old placeholder
 * `useCategories`/getCategories that read a 404 route). Shared source for
 * every screen that needs the preset list: SCR-TASK-EDIT/생성 폼's Select
 * (TaskEditModal/TaskCreateForm), StatisticsPage's 카테고리별 편차 hint row, and
 * the CRUD screen itself (SettingsTaskCategoriesPage) — one query key, one
 * cache entry, never re-fetched per caller. Long staleTime: a small,
 * rarely-changing lookup list, not per-task data (same reasoning the old
 * hook already had).
 */
export function useTaskCategories() {
  return useQuery({
    queryKey: taskCategoriesKey(),
    queryFn: getTaskCategories,
    staleTime: 10 * 60 * 1000,
  })
}

/**
 * POST /task-categories (W3 SC-01). Name-length (422 E-COM-009) and
 * duplicate-name (409 E-CAT-001) failures are surfaced to the CALLER via the
 * rejected promise/mutation.error — the settings form branches on those two
 * codes itself to show an inline, field-specific message (R1: never parse
 * `message`); this hook's own onError only toasts anything ELSE.
 */
export function useCreateTaskCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name) => createTaskCategory(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskCategoriesKey() })
      toast({ tone: 'success', message: '카테고리를 추가했습니다' })
    },
    onError: (error) => {
      if (error?.code === 'E-CAT-001' || error?.code === 'E-COM-009') return
      toast({ tone: 'error', message: systemMessages.error.writeTitle })
    },
  })
}

/**
 * DELETE /task-categories/{id} (W3 SC-01). Hard delete — the SERVER resets
 * every task that referenced this category to categoryId=null (FK ON DELETE
 * SET NULL, confirmed live), so this hook does not separately patch any task
 * cache: only THIS list needs invalidating. A task screen open at the exact
 * moment of deletion keeps showing its now-stale categoryId until its own
 * next re-fetch — same "no cross-invalidation for a resource this store
 * doesn't own" boundary useUpdateTaskSchedule's own comment draws elsewhere.
 */
export function useDeleteTaskCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (taskCategoryId) => deleteTaskCategory(taskCategoryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskCategoriesKey() })
      toast({ tone: 'success', message: '카테고리를 삭제했습니다' })
    },
    onError: () => toast({ tone: 'error', message: systemMessages.error.writeTitle }),
  })
}

/** GET /projects/{id}/tasks — 태스크 탭 (§PROJ.2.1). */
export function useProjectTasks(projectId) {
  return useQuery({
    queryKey: projectTasksKey(projectId),
    queryFn: () => getProjectTasks(projectId),
    enabled: Boolean(projectId),
    staleTime: 15 * 1000,
  })
}

/** POST /projects/{id}/tasks (PROJ-17 태스크 추가). Invalidates the task list,
 * the project's own aggregate counts (badges), and the structure-warning
 * check (adding a task can clear "태스크 수 부족"). */
export function useCreateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, body }) => createTask(projectId, body),
    onSuccess: (_data, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: projectTasksKey(projectId) })
      queryClient.invalidateQueries({ queryKey: projectKey(projectId) })
      queryClient.invalidateQueries({ queryKey: projectsKey() })
      queryClient.invalidateQueries({ queryKey: structureWarningsKey(projectId) })
      toast({
        tone: 'success',
        message: '태스크를 추가했습니다. 주간 계획에서 배치할 수 있습니다',
      })
    },
    onError: () => toast({ tone: 'error', message: systemMessages.error.writeTitle }),
  })
}

/** PATCH /tasks/{taskId} (G-1, owner review 2026-07-24 — see projectApi's own
 * [가정 — 신규] note on updateTask). Invalidates the same set useCreateTask
 * does: the task list itself, the project's aggregate badges (title/estimate
 * changes don't move those counts, but this hook doesn't know which fields a
 * given call touched, so it invalidates uniformly rather than guessing), the
 * structure-warning check (editing estimatedMinutes can clear
 * "예상시간 미입력"), AND the WBS query — a task's title/estimate shows up
 * there too (the fixed column's own label, and the default-duration math the
 * [기간 설정] button uses). No onError toast: the form's own inline
 * ErrorState + "다시 시도" carries the failure (same reasoning as
 * useCreateProject/useUpdateProject above). Also invalidates `taskKey(taskId)`
 * (added for ST-F1-09 — TaskEditModal's own detail query) so a save success
 * doesn't leave the JUST-EDITED task's cached detail stale if it is reopened
 * right after.
 *
 * `projectId` guard (owner follow-up, ST-F1-09): a task edited via
 * WeeklyPage's "태스크 편집" (a plan-store task — see projectApi.getTask's
 * own namespace-routing comment) may have no REAL projectId at all (`null`,
 * or one of planFixtures.js's own fictional seed strings like `'proj-1'`
 * that names no project in THIS store). `invalidateQueries` with such a key
 * is harmless on its own (nothing is ever cached under a fake/null project
 * id, so it is just a no-op miss, never a throw) — this guard exists for
 * clarity and to avoid firing four pointless invalidate calls, not because
 * the unguarded version was actually unsafe. */
export function useUpdateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, body }) => updateTask(taskId, body),
    onSuccess: (_data, { projectId, taskId }) => {
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: projectTasksKey(projectId) })
        queryClient.invalidateQueries({ queryKey: projectKey(projectId) })
        queryClient.invalidateQueries({ queryKey: structureWarningsKey(projectId) })
        queryClient.invalidateQueries({ queryKey: projectWbsKey(projectId) })
      }
      if (taskId) queryClient.invalidateQueries({ queryKey: taskKey(taskId) })
    },
  })
}

/** DELETE /tasks/{taskId} (G-1). Same invalidation set as useUpdateTask, plus
 * the projects list (a deleted task moves the list card's own task/placed/
 * unplaced counts). Toasts on success/error like useDeleteProject — a delete
 * has no inline form of its own left open to show a failure in once the
 * confirm dialog closes. */
export function useDeleteTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId }) => deleteTask(taskId),
    onSuccess: (_data, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: projectTasksKey(projectId) })
      queryClient.invalidateQueries({ queryKey: projectKey(projectId) })
      queryClient.invalidateQueries({ queryKey: projectsKey() })
      queryClient.invalidateQueries({ queryKey: structureWarningsKey(projectId) })
      queryClient.invalidateQueries({ queryKey: projectWbsKey(projectId) })
      toast({ tone: 'success', message: '태스크를 삭제했습니다' })
    },
    onError: () => toast({ tone: 'error', message: systemMessages.error.writeTitle }),
  })
}

/** GET /projects/{id}/validation-issues — RB-PROJ-02 구조 경고 배너. */
export function useProjectStructureWarnings(projectId) {
  return useQuery({
    queryKey: structureWarningsKey(projectId),
    queryFn: () => getProjectStructureWarnings(projectId),
    enabled: Boolean(projectId),
    staleTime: 30 * 1000,
  })
}

/** POST /projects/{id}/task-structuring-drafts (RB-PROJ-01). NOT a useQuery —
 * this is a "generate a new draft" write, never cached, mirroring
 * useReplanOptions/usePlanValidation's own reasoning for staying a plain
 * mutation. */
export function useCreateStructuringDraft() {
  return useMutation({
    mutationFn: ({ projectId, body }) => createStructuringDraft(projectId, body),
  })
}

/** POST .../task-structuring-drafts/{draftId}/apply. Success replaces the
 * EmptyState with the real task list (PROJ-17 결과문 재사용 — "주간 계획 배치 대상"). */
export function useApplyStructuringDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, draftId, selectedTaskIds }) =>
      applyStructuringDraft(projectId, draftId, selectedTaskIds),
    onSuccess: (_data, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: projectTasksKey(projectId) })
      queryClient.invalidateQueries({ queryKey: projectKey(projectId) })
      queryClient.invalidateQueries({ queryKey: projectsKey() })
      queryClient.invalidateQueries({ queryKey: structureWarningsKey(projectId) })
    },
    onError: () => toast({ tone: 'error', message: systemMessages.error.writeTitle }),
  })
}

/** GET /projects/{id}/wbs — 계획 탭 (§PROJ.3). */
export function useProjectWbs(projectId) {
  return useQuery({
    queryKey: projectWbsKey(projectId),
    queryFn: () => getProjectWbs(projectId),
    enabled: Boolean(projectId),
    staleTime: 15 * 1000,
  })
}

/**
 * Returns `updateSchedule({ projectId, taskId, plannedStartDate, plannedEndDate })`
 * for an optimistic WBS bar drag commit (PROJ-14, AC-6 day-only snap). Mirrors
 * usePlanData.useResizeBlock's optimistic-write-then-PATCH-then-rollback shape.
 */
export function useUpdateTaskSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, plannedStartDate, plannedEndDate }) =>
      updateTaskSchedule(taskId, { plannedStartDate, plannedEndDate }),
    onMutate: async ({ projectId, taskId, plannedStartDate, plannedEndDate }) => {
      await queryClient.cancelQueries({ queryKey: projectWbsKey(projectId) })
      const prev = queryClient.getQueryData(projectWbsKey(projectId))
      queryClient.setQueryData(projectWbsKey(projectId), (nodes) =>
        (nodes ?? []).map((n) =>
          n.taskId === taskId ? { ...n, plannedStartDate, plannedEndDate } : n,
        ),
      )
      return { prev, projectId }
    },
    onError: (error, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(projectWbsKey(context.projectId), context.prev)
      const message =
        error?.code === 'E-WBS-001'
          ? '이 기간으로 조정할 수 없습니다. 다시 시도해 주세요'
          : systemMessages.error.writeTitle
      toast({ tone: 'error', message })
    },
    onSettled: (_data, _error, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: projectWbsKey(projectId) })
    },
  })
}
