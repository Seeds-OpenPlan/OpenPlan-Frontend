import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ProjectCard } from '../components/project/ProjectCard'
import { ProjectCreateForm } from '../components/project/ProjectCreateForm'
import { ProjectManageForm } from '../components/project/ProjectManageForm'
import { DeleteProjectDialog } from '../components/project/DeleteProjectDialog'
import { ProjectDuplicateModal } from '../components/project/ProjectDuplicateModal'
import { EmptyState } from '../components/common/EmptyState'
import { ErrorState } from '../components/common/ErrorState'
import { SkeletonCard } from '../components/common/Skeleton'
import { Button } from '../components/common/Button'
import {
  useCreateProject,
  useDeleteProject,
  useDuplicateProject,
  useProjects,
  useUpdateProject,
  useUpdateProjectStatus,
} from '../features/project/useProjectData'
import { PROJECT_STATUS_LABELS } from '../features/project/projectLabels'
import { useAppStore, selectCanWrite } from '../store/useAppStore'
import { systemMessages } from '../constants/systemMessages'
import { toast } from '../hooks/useToasts'

/*
  SCR-PROJ-LIST (ui-spec §PROJ.1). THREE client-side tabs over ONE
  `useProjects()` fetch (matching usePlanData.useUnplacedTasks's own "fetch
  once, filter client-side" choice for its project chips) — one tab per ERD
  status value (IN_PROGRESS/PAUSED/CLOSED) exactly, no grouping.

  REVISED (owner review 2026-07-23, A-2): the spec draft only names two tabs
  (진행중/종료) and an earlier version of this page folded PAUSED into the
  진행중 tab for lack of a third pill in the layout ASCII. The owner asked for
  보류 as its OWN tab instead — simpler than the grouping guess anyway, since
  it needs no judgment call about which non-CLOSED statuses count as
  "진행중".

  Four overlays are page-local state (not routes), mirroring WeeklyPage's own
  schedule-form/exec-log pattern: exactly one of `overlay`/`deleteTarget` is
  active at a time, each mounted CONDITIONALLY so it starts with fresh state
  per open.
*/
function ProjectsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [tab, setTab] = useState('IN_PROGRESS') // 'IN_PROGRESS' | 'PAUSED' | 'CLOSED'
  // `?create=1` seam (§PROJ.0.1) — the dashboard's empty-state onboarding link
  // opens OVL-PROJ-CREATE directly on landing; read ONCE as this state's own
  // lazy initializer (same "you might not need an Effect" shape WeeklyPage's
  // `?openReplan=1` already uses), then stripped from the URL below.
  const [overlay, setOverlay] = useState(() =>
    searchParams.get('create') === '1' ? { type: 'create' } : null,
  )
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [manageConflict, setManageConflict] = useState(null) // { latest } | null
  const [manageError, setManageError] = useState(false)
  const [createError, setCreateError] = useState(false)
  const [deleteError, setDeleteError] = useState(false)
  const [duplicateError, setDuplicateError] = useState(false)

  useEffect(() => {
    if (searchParams.get('create') !== '1') return
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('create')
        return next
      },
      { replace: true },
    )
  }, [searchParams, setSearchParams])

  const projectsQuery = useProjects()
  const createProject = useCreateProject()
  const updateProject = useUpdateProject()
  const updateProjectStatus = useUpdateProjectStatus()
  const deleteProject = useDeleteProject()
  const duplicateProject = useDuplicateProject()
  const canWrite = useAppStore(selectCanWrite)

  // Depend on `projectsQuery.data` itself (not a `?? []`-derived local, which
  // is a fresh array literal — and therefore a fresh useMemo dependency — on
  // every render while the query has no data yet); the `?? []` fallback moves
  // inside each memo body instead.
  const inProgress = useMemo(
    () => (projectsQuery.data ?? []).filter((p) => p.status === 'IN_PROGRESS'),
    [projectsQuery.data],
  )
  const paused = useMemo(
    () => (projectsQuery.data ?? []).filter((p) => p.status === 'PAUSED'),
    [projectsQuery.data],
  )
  const closed = useMemo(
    () => (projectsQuery.data ?? []).filter((p) => p.status === 'CLOSED'),
    [projectsQuery.data],
  )
  const visible = tab === 'IN_PROGRESS' ? inProgress : tab === 'PAUSED' ? paused : closed

  const offlineReason = systemMessages.offline.disabledReason

  const openManage = (project) => {
    setManageError(false)
    setManageConflict(null)
    setOverlay({ type: 'manage', project })
  }
  const openDuplicate = (project) => setOverlay({ type: 'duplicate', project })
  const closeOverlay = () => setOverlay(null)

  const handleCreateSubmit = (body) => {
    setCreateError(false)
    createProject.mutate(body, {
      onSuccess: ({ projectId }) => {
        setOverlay(null)
        navigate(`/projects/${projectId}`)
      },
      onError: () => setCreateError(true),
    })
  }

  const handleManageSubmit = (body) => {
    setManageError(false)
    setManageConflict(null)
    const { project } = overlay
    // 정보 변경 → 상태 변경 순차 (§PROJ.5 [추론]). Only PATCH the status
    // endpoint when it actually changed — the info PATCH's own `status` field
    // is accepted by the 07 spec's body sample too, but §PROJ.5 explicitly
    // routes a status-only change through the DEDICATED endpoint.
    const infoChanged =
      body.name !== project.name || body.description !== project.description || body.dueDate !== project.dueDate
    const statusChanged = body.status !== project.status

    const afterInfo = infoChanged
      ? updateProject.mutateAsync({
          projectId: project.projectId,
          body: { name: body.name, description: body.description, dueDate: body.dueDate },
        })
      : Promise.resolve()

    afterInfo
      .then(() => (statusChanged ? updateProjectStatus.mutateAsync({ projectId: project.projectId, status: body.status }) : null))
      .then(() => {
        setOverlay(null)
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

  const handleDeleteConfirm = () => {
    setDeleteError(false)
    deleteProject.mutate(deleteTarget.projectId, {
      onSuccess: () => setDeleteTarget(null),
      onError: () => setDeleteError(true),
    })
  }

  const handleDuplicate = (payload) => {
    setDuplicateError(false)
    duplicateProject.mutate(payload, {
      onSuccess: ({ projectId }) => {
        setOverlay(null)
        navigate(`/projects/${projectId}`)
      },
      onError: () => setDuplicateError(true),
    })
  }

  if (projectsQuery.isError) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader onCreate={() => setOverlay({ type: 'create' })} canWrite={canWrite} offlineReason={offlineReason} />
        <ErrorState variant="section" onAction={() => projectsQuery.refetch()} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 pb-16 md:pb-0">
      <PageHeader onCreate={() => setOverlay({ type: 'create' })} canWrite={canWrite} offlineReason={offlineReason} />

      <div className="flex gap-2">
        <FilterPill
          active={tab === 'IN_PROGRESS'}
          label={`${PROJECT_STATUS_LABELS.IN_PROGRESS} ${inProgress.length}`}
          onClick={() => setTab('IN_PROGRESS')}
        />
        <FilterPill
          active={tab === 'PAUSED'}
          label={`${PROJECT_STATUS_LABELS.PAUSED} ${paused.length}`}
          onClick={() => setTab('PAUSED')}
        />
        <FilterPill
          active={tab === 'CLOSED'}
          label={`${PROJECT_STATUS_LABELS.CLOSED} ${closed.length}`}
          onClick={() => setTab('CLOSED')}
        />
      </div>

      {projectsQuery.isLoading ? (
        <div className="flex flex-col gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : visible.length === 0 ? (
        tab === 'IN_PROGRESS' ? (
          <EmptyState
            title="아직 프로젝트가 없습니다"
            description="첫 프로젝트를 만들어 시작하세요"
            actionLabel="새 프로젝트"
            onAction={() => setOverlay({ type: 'create' })}
            disabled={!canWrite}
            disabledReason={offlineReason}
          />
        ) : (
          <p className="text-label text-text-muted">
            {tab === 'PAUSED' ? '보류된 프로젝트가 없습니다.' : '종료된 프로젝트가 없습니다.'}
          </p>
        )
      ) : (
        <ul className="flex flex-col gap-4">
          {visible.map((project) => (
            <ProjectCard
              key={project.projectId}
              project={project}
              closed={tab === 'CLOSED'}
              onEdit={openManage}
              onDelete={setDeleteTarget}
              onDuplicate={openDuplicate}
            />
          ))}
        </ul>
      )}

      {/* Mobile floating create button — fixed above BottomTabBar, same
          bottom-18/md:absolute split WeeklyPage's own floating controls use
          (see that file's comment for the exact 72px-clearance math). */}
      <div className="pointer-events-none fixed inset-x-4 bottom-18 z-30 flex justify-end md:hidden">
        <div className="pointer-events-auto">
          {/* Same de-duplication as the desktop header button above — this
              was a second hand-rolled copy of Button's primary/lg styling.
              No `disabledReason` here: OfflineBanner (mounted once, globally)
              already states the "why"; repeating it under a FAB this close to
              the viewport edge risks the caption clipping under BottomTabBar. */}
          <Button variant="primary" size="lg" onClick={() => setOverlay({ type: 'create' })} disabled={!canWrite} className="shadow-popover">
            + 새 프로젝트
          </Button>
        </div>
      </div>

      {overlay?.type === 'create' && (
        <ProjectCreateForm
          onClose={closeOverlay}
          onSubmit={handleCreateSubmit}
          submitting={createProject.isPending}
          submitError={createError}
          onRetry={() => setCreateError(false)}
        />
      )}

      {overlay?.type === 'manage' && (
        <ProjectManageForm
          project={overlay.project}
          onClose={closeOverlay}
          onSubmit={handleManageSubmit}
          submitting={updateProject.isPending || updateProjectStatus.isPending}
          submitError={manageError}
          onRetry={() => setManageError(false)}
          conflict={manageConflict}
          onConflictAccept={() => {
            setManageConflict(null)
            setOverlay(null)
          }}
          onConflictRetry={() => setManageConflict(null)}
        />
      )}

      {overlay?.type === 'duplicate' && (
        <ProjectDuplicateModal
          project={overlay.project}
          onClose={closeOverlay}
          onDuplicate={handleDuplicate}
          submitting={duplicateProject.isPending}
          submitError={duplicateError}
        />
      )}

      <DeleteProjectDialog
        project={deleteTarget}
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        submitting={deleteProject.isPending}
        submitError={deleteError}
      />
    </div>
  )
}

/*
  A-1 (owner review 2026-07-23): the title used to sit in a `flex items-center
  justify-between` row alongside the create button. `items-center` centers the
  title WITHIN that row, but the ROW's own height still grows to fit the
  taller sibling (the button, plus its offline caption) — so the title's
  actual on-screen position drifts down from where a bare `<h1>` sits on every
  other page (WeeklyPage's title has no button sharing its line at all;
  PlanHeader already solved the version of this problem where one DOES).
  Same fix as PlanHeader.jsx: the title stays in normal flow (so the row's
  height is exactly the title's own line-height, matching every other page
  pixel-for-pixel), and the button is pulled OUT of flow via absolute
  positioning, vertically centered on the title's line instead of pushing it.
*/
function PageHeader({ onCreate, canWrite, offlineReason }) {
  return (
    <div className="relative">
      <h1 className="text-2xl font-bold text-text">프로젝트</h1>
      {/* A hand-rolled <button> used to live here duplicating Button's own
          primary/md styling — switched to the shared component (it's already
          `rounded-full`, so nothing about the pill shape is lost) so this
          page's offline-disabled state goes through the one place that
          behavior is implemented, not a second copy of it.

          F-1 (owner review 2026-07-23): `md` (40px) read as oversized next to
          a plain `<h1>` with no other chrome in the row — this is the ONLY
          desktop header on this page competing with the title for visual
          weight, unlike WeeklyPage's own header row (PlanHeader.jsx) whose
          "저장" button is `sm`. Sized down to match THAT one button — not a
          project-wide size pass, which the owner explicitly deferred. */}
      <div className="absolute right-0 top-1/2 hidden -translate-y-1/2 md:block">
        <Button
          variant="primary"
          size="sm"
          onClick={onCreate}
          disabled={!canWrite}
          disabledReason={!canWrite ? offlineReason : undefined}
        >
          + 새 프로젝트
        </Button>
      </div>
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

export default ProjectsPage
