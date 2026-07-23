import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Badge } from '../components/common/Badge'
import { Button } from '../components/common/Button'
import { ErrorState } from '../components/common/ErrorState'
import { ChevronLeftIcon } from '../components/plan/planIcons'
import { SkeletonListRow, SkeletonText } from '../components/common/Skeleton'
import NotFoundPage from './NotFoundPage'
import ForbiddenPage from './ForbiddenPage'
import { TaskRow } from '../components/project/TaskRow'
import { TaskCreateForm } from '../components/project/TaskCreateForm'
import { DeleteTaskDialog } from '../components/project/DeleteTaskDialog'
import { TaskStructuringDraft } from '../components/project/TaskStructuringDraft'
import { StructureWarningBanner } from '../components/project/StructureWarningBanner'
import { WbsTimeline } from '../components/project/WbsTimeline'
import { ProjectManageForm } from '../components/project/ProjectManageForm'
import {
  useCreateTask,
  useDeleteTask,
  useProject,
  useProjectStructureWarnings,
  useProjectTasks,
  useProjectWbs,
  useUpdateProject,
  useUpdateProjectStatus,
  useUpdateTask,
  useUpdateTaskSchedule,
} from '../features/project/useProjectData'
import { useAppStore, selectCanWrite } from '../store/useAppStore'
import { systemMessages } from '../constants/systemMessages'
import { toast } from '../hooks/useToasts'
import { PROJECT_STATUS_BADGE_TONE, PROJECT_STATUS_LABELS } from '../features/project/projectLabels'

/*
  SCR-PROJ-WS (ui-spec §PROJ.2). Tab state lives in `?tab=plan` (default =
  태스크 탭) so a refresh/share keeps the tab, exactly like WeeklyPage's own
  `?openReplan=1` seam reads a query param as this page's OWN initial state.

  PROJ-16 필터 그룹 [가정]: the spec's 3-pill example ("전체 4·진행중 2·완료 2")
  only adds up if 진행중 groups every NON-완료 task together (UNASSIGNED +
  IN_PROGRESS) rather than IN_PROGRESS alone — there is no separate "미배치"
  pill anywhere in §PROJ.2.1's layout. Followed here; flagged for review.
*/
function ProjectWorkspacePage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const tab = searchParams.get('tab') === 'plan' ? 'plan' : 'task'
  const [taskFilter, setTaskFilter] = useState('ALL') // 'ALL' | 'ACTIVE' | 'DONE'
  // G-1 (owner review 2026-07-24): ONE overlay slot for both create AND
  // edit — `'create'` or a task object — same "single discriminated slot"
  // shape ProjectsPage's own `overlay` state already uses for ITS four
  // overlays, rather than a second boolean+error pair duplicating
  // taskCreateOpen/createTaskError for edit. TaskCreateForm itself reads
  // `task` (undefined in create mode) to switch its own copy/prefill.
  const [taskFormTarget, setTaskFormTarget] = useState(null) // null | 'create' | task
  const [taskFormError, setTaskFormError] = useState(false)
  const [deleteTaskTarget, setDeleteTaskTarget] = useState(null) // task | null
  const [deleteTaskError, setDeleteTaskError] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [manageError, setManageError] = useState(false)
  const [manageConflict, setManageConflict] = useState(null)

  const projectQuery = useProject(projectId)
  const tasksQuery = useProjectTasks(projectId)
  const warningsQuery = useProjectStructureWarnings(projectId)
  const wbsQuery = useProjectWbs(projectId)
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const updateProject = useUpdateProject()
  const updateProjectStatus = useUpdateProjectStatus()
  const updateTaskSchedule = useUpdateTaskSchedule()
  const canWrite = useAppStore(selectCanWrite)

  const setTab = (next) =>
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev)
      if (next === 'task') params.delete('tab')
      else params.set('tab', next)
      return params
    })

  if (projectQuery.isError) {
    // A missing/forbidden id reuses the shared SCR-404/403 surfaces in place
    // (§PROJ.0.1, error.code branch) — rendered directly rather than a
    // navigate('/403'): there is no standalone '/404' route to redirect to
    // (NotFoundPage is normally reached only via the router's own `*`
    // catch-all), and rendering in place keeps the URL as the id the user
    // actually requested instead of bouncing the address bar away from it.
    if (projectQuery.error?.status === 404) return <NotFoundPage />
    if (projectQuery.error?.status === 403) return <ForbiddenPage />
    return <ErrorState variant="section" onAction={() => projectQuery.refetch()} />
  }

  if (projectQuery.isLoading || !projectQuery.data) {
    return (
      <div className="flex flex-col gap-4">
        <SkeletonText lines={2} />
        <SkeletonListRow count={3} />
      </div>
    )
  }

  const project = projectQuery.data
  const statusTone = PROJECT_STATUS_BADGE_TONE[project.status] ?? PROJECT_STATUS_BADGE_TONE.IN_PROGRESS
  const statusLabel = PROJECT_STATUS_LABELS[project.status] ?? PROJECT_STATUS_LABELS.IN_PROGRESS
  const writeDisabled = project.status !== 'IN_PROGRESS' || !canWrite
  const writeDisabledReason =
    project.status !== 'IN_PROGRESS'
      ? '종료된 프로젝트입니다 — 재개 후 편집할 수 있습니다'
      : systemMessages.offline.disabledReason

  const tasks = tasksQuery.data ?? []
  const visibleTasks = tasks.filter((t) => {
    if (taskFilter === 'DONE') return t.status === 'COMPLETED'
    if (taskFilter === 'ACTIVE') return t.status !== 'COMPLETED'
    return true
  })
  const activeCount = tasks.filter((t) => t.status !== 'COMPLETED').length
  const doneCount = tasks.filter((t) => t.status === 'COMPLETED').length

  // F-4 (owner review 2026-07-23): the WBS node itself carries no completion
  // state — `useProjectWbs`'s `[가정]` OP-PROJ-WBS contract only has
  // schedule fields (§PROJ.3). Rather than inventing a new field on that
  // response, each node is matched to the task list ALREADY loaded for the
  // 태스크 탭 (same projectId, same page) by taskId, and that task's own
  // `status` is attached at render time — no new query, no new endpoint
  // assumption.
  const taskStatusById = new Map(tasks.map((t) => [t.taskId, t.status]))
  const wbsNodes = (wbsQuery.data ?? []).map((n) => ({
    ...n,
    status: taskStatusById.get(n.taskId),
  }))

  // G-1: `taskFormTarget` doubles as create/edit — 'create' calls the
  // original POST, anything else (a task object) is the row being edited
  // and calls PATCH instead. Both close the SAME overlay slot on success.
  const handleTaskFormSubmit = (body) => {
    setTaskFormError(false)
    if (taskFormTarget === 'create') {
      createTask.mutate(
        { projectId, body },
        {
          onSuccess: () => setTaskFormTarget(null),
          onError: () => setTaskFormError(true),
        },
      )
      return
    }
    updateTask.mutate(
      { projectId, taskId: taskFormTarget.taskId, body },
      {
        onSuccess: () => setTaskFormTarget(null),
        onError: () => setTaskFormError(true),
      },
    )
  }

  const handleDeleteTask = () => {
    setDeleteTaskError(false)
    deleteTask.mutate(
      { projectId, taskId: deleteTaskTarget.taskId },
      {
        onSuccess: () => setDeleteTaskTarget(null),
        onError: () => setDeleteTaskError(true),
      },
    )
  }

  const handleManageSubmit = (body) => {
    setManageError(false)
    setManageConflict(null)
    const infoChanged =
      body.name !== project.name || body.description !== project.description || body.dueDate !== project.dueDate
    const statusChanged = body.status !== project.status
    const afterInfo = infoChanged
      ? updateProject.mutateAsync({
          projectId,
          body: { name: body.name, description: body.description, dueDate: body.dueDate },
        })
      : Promise.resolve()
    afterInfo
      .then(() => (statusChanged ? updateProjectStatus.mutateAsync({ projectId, status: body.status }) : null))
      .then(() => {
        setManageOpen(false)
        toast({ tone: 'success', message: '저장했습니다' })
      })
      .catch((error) => {
        if (error?.code === 'E-COM-006') {
          setManageConflict({ latest: error.details?.latest })
          return
        }
        setManageError(true)
      })
  }

  return (
    <div className="flex flex-col gap-4">
      {/*
        D-2 (owner review 2026-07-23): the back link used to be its own block
        ABOVE the title row, and the title row's action buttons pushed the
        title down exactly like A-1's PageHeader bug (a taller sibling in a
        plain `items-start` flex row). Same fix here: back-icon + title +
        status badge sit together in ONE normal-flow line, and the desktop
        action buttons are pulled out via absolute positioning, vertically
        centered on that same line, so nothing about the button's own height
        can push the title anywhere. Mobile keeps the spec's own 2-line shape
        (§PROJ.2 "1줄 = ← + 제목 + 상태 배지 / 2줄 = 액션 버튼 2개") — the
        buttons render a SECOND time, full-width, below the relative block,
        hidden on desktop where the absolute pair already covers them.

        Back icon: a raw "←" character used to sit here — replaced with
        ChevronLeftIcon (this codebase's own icon system, shared from the
        plan feature's planIcons.jsx rather than a bare glyph with no
        currentColor/aria-hidden contract behind it).
      */}
      <div className="relative">
        <div className="flex items-center gap-2">
          <Link
            to="/projects"
            aria-label="프로젝트 목록으로"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-text-muted transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <ChevronLeftIcon className="text-xl" />
          </Link>
          <h1 className="min-w-0 truncate text-2xl font-bold text-text">{project.name}</h1>
          <Badge tone={statusTone} label={statusLabel} />
        </div>
        <p className="mt-1 text-label text-text-muted">
          마감 {project.dueDate ?? '없음'} · 태스크 {project.taskCount}
        </p>

        <div className="absolute right-0 top-1/2 hidden -translate-y-1/2 gap-2 md:flex">
          <Button variant="secondary" size="md" onClick={() => setManageOpen(true)}>
            프로젝트 관리
          </Button>
          <Button
            variant="primary"
            size="md"
            disabled={writeDisabled}
            disabledReason={writeDisabled ? writeDisabledReason : undefined}
            onClick={() => navigate(`/weekly?project=${projectId}&openUnplaced=1`)}
          >
            이 프로젝트로 주간 계획
          </Button>
        </div>
      </div>

      {/* Mobile-only 2nd header line — each button 48px tall (size="lg") per
          §PROJ.2's own mobile spec. */}
      <div className="flex gap-2 md:hidden">
        <Button variant="secondary" size="lg" className="flex-1" onClick={() => setManageOpen(true)}>
          프로젝트 관리
        </Button>
        <Button
          variant="primary"
          size="lg"
          className="flex-1"
          disabled={writeDisabled}
          disabledReason={writeDisabled ? writeDisabledReason : undefined}
          onClick={() => navigate(`/weekly?project=${projectId}&openUnplaced=1`)}
        >
          이 프로젝트로 주간 계획
        </Button>
      </div>

      {(project.placedCount > 0 || project.unplacedCount > 0 || project.dueSoonCount > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {project.placedCount > 0 && <Badge tone="brand" label={`배치됨 ${project.placedCount}`} />}
          {project.unplacedCount > 0 && <Badge tone="danger" label={`미배치 ${project.unplacedCount}`} />}
          {project.dueSoonCount > 0 && <Badge tone="danger" label={`마감임박 ${project.dueSoonCount}`} />}
        </div>
      )}

      {warningsQuery.data && (
        <StructureWarningBanner
          issues={warningsQuery.data}
          onAddTask={() => setTaskFormTarget('create')}
          onOpenPlanTab={() => setTab('plan')}
        />
      )}

      <div className="flex gap-2 border-b border-border">
        <TabButton active={tab === 'task'} label="태스크" onClick={() => setTab('task')} />
        <TabButton active={tab === 'plan'} label="계획" onClick={() => setTab('plan')} />
      </div>

      {tab === 'task' ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <FilterPill active={taskFilter === 'ALL'} label={`전체 ${tasks.length}`} onClick={() => setTaskFilter('ALL')} />
              <FilterPill active={taskFilter === 'ACTIVE'} label={`진행중 ${activeCount}`} onClick={() => setTaskFilter('ACTIVE')} />
              <FilterPill active={taskFilter === 'DONE'} label={`완료 ${doneCount}`} onClick={() => setTaskFilter('DONE')} />
            </div>
            {tasks.length > 0 && (
              <Button
                variant="secondary"
                size="md"
                disabled={writeDisabled}
                disabledReason={writeDisabled ? writeDisabledReason : undefined}
                onClick={() => setTaskFormTarget('create')}
              >
                + 태스크 추가
              </Button>
            )}
          </div>

          {tasksQuery.isLoading ? (
            <SkeletonListRow count={4} />
          ) : tasksQuery.isError ? (
            <ErrorState variant="section" onAction={() => tasksQuery.refetch()} />
          ) : tasks.length === 0 ? (
            <TaskStructuringDraft
              projectId={projectId}
              project={project}
              onCreateTaskDirect={() => setTaskFormTarget('create')}
              disabled={writeDisabled}
              disabledReason={writeDisabledReason}
            />
          ) : visibleTasks.length === 0 ? (
            <p className="text-label text-text-muted">이 상태의 태스크가 없습니다.</p>
          ) : (
            <ul className="rounded-card border border-border bg-surface px-3">
              {visibleTasks.map((task) => (
                <TaskRow
                  key={task.taskId}
                  task={task}
                  projectId={projectId}
                  onEdit={setTaskFormTarget}
                  onDelete={setDeleteTaskTarget}
                />
              ))}
            </ul>
          )}
        </div>
      ) : (
        <WbsTimeline
          project={project}
          nodes={wbsNodes}
          isLoading={wbsQuery.isLoading}
          isError={wbsQuery.isError}
          onRetry={() => wbsQuery.refetch()}
          disabled={writeDisabled}
          disabledReason={writeDisabledReason}
          onOpenTaskTab={() => setTab('task')}
          onCommitRange={(taskId, patch) =>
            updateTaskSchedule.mutate({ projectId, taskId, ...patch })
          }
          // F-6 (owner review 2026-07-24): the deadline line drags the
          // PROJECT's own dueDate, not a task's — confirmed with the lead
          // after §PROJ.3's "프로젝트 마감일" wording and the fact that WBS
          // has no per-task deadline concept anywhere else. Reuses the SAME
          // `updateProject` mutation §PROJ.5's own "프로젝트 관리" form calls
          // (no new mutation) — a plain PATCH with only `dueDate` in the
          // body; `mockBackend.updateProject` (and, per that endpoint's own
          // PATCH-not-PUT contract, the real one) merges it against whatever
          // else is already saved, so name/description/status are untouched.
          // Returns the mutation's own promise so WbsTimeline's local drag
          // preview can catch a failure and revert the line itself — see
          // that component's own comment for why the rollback has to be
          // visual, not just a toast.
          onCommitDeadline={(dueDate) => updateProject.mutateAsync({ projectId, body: { dueDate } })}
        />
      )}

      {taskFormTarget && (
        <TaskCreateForm
          task={taskFormTarget === 'create' ? undefined : taskFormTarget}
          onClose={() => setTaskFormTarget(null)}
          onSubmit={handleTaskFormSubmit}
          submitting={taskFormTarget === 'create' ? createTask.isPending : updateTask.isPending}
          submitError={taskFormError}
          onRetry={() => setTaskFormError(false)}
        />
      )}

      <DeleteTaskDialog
        task={deleteTaskTarget}
        open={Boolean(deleteTaskTarget)}
        onClose={() => setDeleteTaskTarget(null)}
        onConfirm={handleDeleteTask}
        submitting={deleteTask.isPending}
        submitError={deleteTaskError}
      />

      {manageOpen && (
        <ProjectManageForm
          project={project}
          onClose={() => setManageOpen(false)}
          onSubmit={handleManageSubmit}
          submitting={updateProject.isPending || updateProjectStatus.isPending}
          submitError={manageError}
          onRetry={() => setManageError(false)}
          conflict={manageConflict}
          onConflictAccept={() => {
            setManageConflict(null)
            setManageOpen(false)
          }}
          onConflictRetry={() => setManageConflict(null)}
        />
      )}
    </div>
  )
}

function TabButton({ active, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'min-h-11 border-b-2 px-3 py-2 text-label font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
        active ? 'border-brand-600 text-text' : 'border-transparent text-text-muted hover:text-text',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

function FilterPill({ active, label, onClick }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={[
        'rounded-full px-3 py-1.5 text-label font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
        active ? 'bg-brand-600 text-white font-semibold' : 'border border-border bg-surface text-text-muted',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

export default ProjectWorkspacePage
