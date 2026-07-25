import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../common/Button'
import { ErrorState } from '../common/ErrorState'
import { SkeletonListRow } from '../common/Skeleton'
import { TaskRow } from './TaskRow'
import { TaskCreateForm } from './TaskCreateForm'
import { TaskEditModal } from '../task/TaskEditModal'
import { DeleteTaskDialog } from './DeleteTaskDialog'
import { TaskStructuringDraft } from './TaskStructuringDraft'
import { StructureWarningBanner } from './StructureWarningBanner'
import { ProjectWbsDrawer } from './ProjectWbsDrawer'
import {
  useCreateTask,
  useDeleteTask,
  useProjectStructureWarnings,
  useProjectTasks,
} from '../../features/project/useProjectData'
import { useAppStore, selectCanWrite } from '../../store/useAppStore'
import { systemMessages } from '../../constants/systemMessages'

/*
  An accordion row's expanded body — everything the old SCR-PROJ-WS 태스크 탭
  used to own (ui-spec §PROJ.2.1), now scoped to ONE project's panel rather
  than a whole page. `project` is the SAME normalized object ProjectsPage's
  own `useProjects()` list already loaded (projectApi.normalizeProject is
  shared by both getProjects/getProject — see that function's own comment),
  so this deliberately does NOT re-fetch project detail via useProject: every
  field TaskStructuringDraft/badges need (description, dueDate, taskCount…)
  is already sitting in the list item that's rendering this panel, and a
  second GET for data already in hand would be pure waste.

  Read-only reasoning (`writeDisabled`) is carried over unchanged from
  ProjectWorkspacePage: a non-IN_PROGRESS project (재개 필요) or offline both
  disable every write action here, with the SAME caption either explains why.

  DEFAULT PANEL = 태스크 목록 (owner spec). The WBS view is no longer a
  persistent tab — it only exists as `ProjectWbsDrawer`, mounted CONDITIONALLY
  while `panelMode === 'plan'` (URL-backed, see ProjectsPage's own
  `?tab=plan` seam), so its own queries/mutations don't run at all until the
  user actually opens it.
*/
export function ProjectExpandedPanel({ project, panelMode, onPanelModeChange }) {
  const navigate = useNavigate()
  const { projectId } = project

  const [taskFilter, setTaskFilter] = useState('ALL') // 'ALL' | 'ACTIVE' | 'DONE'
  const [taskFormTarget, setTaskFormTarget] = useState(null) // null | 'create'
  const [taskFormError, setTaskFormError] = useState(false)
  const [taskEditTaskId, setTaskEditTaskId] = useState(null)
  const [deleteTaskTarget, setDeleteTaskTarget] = useState(null) // task | null
  const [deleteTaskError, setDeleteTaskError] = useState(false)

  const tasksQuery = useProjectTasks(projectId)
  const warningsQuery = useProjectStructureWarnings(projectId)
  const createTask = useCreateTask()
  const deleteTask = useDeleteTask()
  const canWrite = useAppStore(selectCanWrite)

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

  // While the WBS drawer is open, every TaskRow hides its own 배치/편집/삭제
  // actions (owner spec) — the drawer's own [기간 해제]/[기간 설정] controls
  // are the only per-task write surface visible at that point.
  const drawerOpen = panelMode === 'plan'

  const handleTaskFormSubmit = (body) => {
    setTaskFormError(false)
    createTask.mutate(
      { projectId, body },
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

  return (
    // `relative`: the ONLY thing ProjectWbsDrawer's own desktop shell (an
    // `absolute inset-0` overlay) needs from this ancestor — see that
    // component's own header for why it covers this whole panel (toolbar +
    // banner + task list), not just the list, when open.
    <div className="relative flex flex-col gap-3">
      {warningsQuery.data && (
        <StructureWarningBanner
          issues={warningsQuery.data}
          onAddTask={() => setTaskFormTarget('create')}
          onOpenPlanTab={() => onPanelModeChange('plan')}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <FilterPill active={taskFilter === 'ALL'} label={`전체 ${tasks.length}`} onClick={() => setTaskFilter('ALL')} />
          <FilterPill active={taskFilter === 'ACTIVE'} label={`진행중 ${activeCount}`} onClick={() => setTaskFilter('ACTIVE')} />
          <FilterPill active={taskFilter === 'DONE'} label={`완료 ${doneCount}`} onClick={() => setTaskFilter('DONE')} />
        </div>
        {tasks.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="md"
              disabled={writeDisabled}
              disabledReason={writeDisabled ? writeDisabledReason : undefined}
              onClick={() => setTaskFormTarget('create')}
              data-tut-id="tut-add-task" // ST-F1-13 TUT-04 coachmark anchor
            >
              + 태스크 추가
            </Button>
            {/* [기간 설정] (owner spec) — opens ProjectWbsDrawer via the
                panel-mode URL seam. Gated on `tasks.length > 0` same as
                "+ 태스크 추가"'s own guard above: with zero tasks the panel
                renders TaskStructuringDraft instead of a list at all (below),
                so there is nothing yet to schedule a period for. */}
            <Button variant="secondary" size="md" onClick={() => onPanelModeChange('plan')}>
              기간 설정
            </Button>
            <Button
              variant="secondary"
              size="md"
              disabled={writeDisabled}
              disabledReason={writeDisabled ? writeDisabledReason : undefined}
              onClick={() => navigate(`/weekly?project=${projectId}&openUnplaced=1`)}
              data-tut-id="tut-goto-weekly" // ST-F1-13 TUT-05 coachmark anchor
            >
              이 프로젝트로 주간 계획
            </Button>
          </div>
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
              onEdit={setTaskEditTaskId}
              onDelete={setDeleteTaskTarget}
              actionsHidden={drawerOpen}
            />
          ))}
        </ul>
      )}

      {taskFormTarget === 'create' && (
        <TaskCreateForm
          onClose={() => setTaskFormTarget(null)}
          onSubmit={handleTaskFormSubmit}
          submitting={createTask.isPending}
          submitError={taskFormError}
          onRetry={() => setTaskFormError(false)}
        />
      )}

      {taskEditTaskId && <TaskEditModal taskId={taskEditTaskId} onClose={() => setTaskEditTaskId(null)} />}

      <DeleteTaskDialog
        task={deleteTaskTarget}
        open={Boolean(deleteTaskTarget)}
        onClose={() => setDeleteTaskTarget(null)}
        onConfirm={handleDeleteTask}
        submitting={deleteTask.isPending}
        submitError={deleteTaskError}
      />

      {drawerOpen && (
        <ProjectWbsDrawer
          project={project}
          tasks={tasks}
          onClose={() => onPanelModeChange('tasks')}
          disabled={writeDisabled}
          disabledReason={writeDisabledReason}
        />
      )}
    </div>
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

export default ProjectExpandedPanel
