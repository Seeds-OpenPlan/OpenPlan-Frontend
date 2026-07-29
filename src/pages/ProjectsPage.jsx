import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ProjectAccordionRow } from '../components/project/ProjectAccordionRow'
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
  SCR-PROJ-LIST (ui-spec §PROJ.1), restructured as a single-open ACCORDION
  (owner-approved design, supersedes ST-F1-08's "card links to a separate
  /projects/:id workspace page"). THREE client-side tabs over ONE
  `useProjects()` fetch — unchanged from before, see the original A-2 note
  this comment used to carry (진행중/보류/종료, one tab per ERD status value
  exactly, no grouping).

  THE ACCORDION SEAM lives entirely in the URL, mirroring the pattern the old
  ProjectWorkspacePage already used for its own `?tab=plan` toggle:
  - `?expanded={projectId}` — which row (if any) is open. At most ONE, by
    construction (a single string, not a Set) — expanding a different row can
    only ever mean the previous one collapsed, there is no separate "close the
    old one" step anywhere in this file.
  - `?tab=plan` — REUSES the exact query-param name ProjectWorkspacePage's own
    task/plan toggle used, deliberately: the old `/projects/:id` route (kept
    below as a redirect-only loader, see router.js) forwards its OWN `?tab=`
    straight through, so every existing `?tab=plan` deep link (dashboard's
    actionRouting.js, StructureWarningBanner's "계획 탭 열기") lands on the
    accordion's plan drawer with ZERO translation needed at the redirect site.

  `/projects/:projectId` (old workspace URLs) 302s here via router.js's own
  loader — this page never reads a route param for it at all, only `expanded`.
*/
function ProjectsPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [tab, setTab] = useState('IN_PROGRESS') // 'IN_PROGRESS' | 'PAUSED' | 'CLOSED'
  // `?create=1` seam (§PROJ.0.1) — unchanged from before this restructure.
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

  const expandedId = searchParams.get('expanded')
  const panelMode = searchParams.get('tab') === 'plan' ? 'plan' : 'tasks'

  /*
    DEEP-LINK TAB RESOLUTION. `?expanded=` may name a project on a DIFFERENT
    tab than this page's own default (`tab` starts at 'IN_PROGRESS' always —
    same default the old page had). Every INTERNAL link that sets `expanded`
    (this file's own toggleExpand/expandInProgress below) already keeps `tab`
    in sync itself, so this only ever matters for an EXTERNAL entry: the
    redirect-only `/projects/:id` route, or a hand-typed/bookmarked URL.

    Resolved DURING RENDER, not inside a useEffect — this is React's own
    "adjusting state when a prop changes" pattern (a piece of state,
    `tabResolvedForId`, remembers which `expandedId` has already been
    checked; a mismatch means THIS render needs to adjust `tab` before
    paint). A `useEffect` calling `setTab` here would fire on a render AFTER
    paint — a visible flash of the wrong tab, then a jump — and this
    codebase's own lint config (react-hooks/set-state-in-effect) flags a
    plain setState-in-effect like that outright, precisely because the
    render-time adjustment below is the preferred fix. `projectsQuery.data`
    loads async, so `tabResolvedForId` starts `undefined` (distinct from
    `null` — no `?expanded=` present) and this block simply does nothing
    until data actually arrives.
  */
  const [tabResolvedForId, setTabResolvedForId] = useState(undefined)
  if (projectsQuery.data && tabResolvedForId !== expandedId) {
    setTabResolvedForId(expandedId)
    if (expandedId) {
      const target = projectsQuery.data.find((p) => p.projectId === expandedId)
      if (target) setTab(target.status)
    }
  }

  /*
    A STALE `?expanded=` id (the project was deleted, or the link was simply
    wrong) is swept out of the URL — with no matching row to render, a
    permanently "stuck" `?expanded=` would silently do nothing on every
    future bare-/projects navigation, which is worse than clearing it once.
    This one DOES stay a real effect (unlike the tab resolution above):
    `setSearchParams` is a router navigation, not this component's own local
    state, so there is no render-time equivalent to adjust it to — and it
    isn't the setState-in-effect shape the lint rule flags in the first
    place (same as the pre-existing `?create=1` cleanup effect above, which
    calls `setSearchParams` inside an effect too). Guarded by a ref (not
    state — a ref write here is bookkeeping for THIS effect only, never
    something the render needs to read) so it fires at most once per stale id.
  */
  const staleExpandedRef = useRef(null)
  useEffect(() => {
    if (!projectsQuery.data || !expandedId) return
    if (staleExpandedRef.current === expandedId) return
    const found = projectsQuery.data.some((p) => p.projectId === expandedId)
    if (found) return
    staleExpandedRef.current = expandedId
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('expanded')
        next.delete('tab')
        return next
      },
      { replace: true },
    )
  }, [projectsQuery.data, expandedId, setSearchParams])

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

  // Single seam every "this project should now be the open accordion row"
  // caller below shares — always resets `tab` to the task list (a freshly
  // opened row never starts on the plan drawer) and always lands on the
  // IN_PROGRESS tab (every project this fires for — newly created,
  // duplicated — starts IN_PROGRESS, per createProject/duplicateProject's
  // own defaults).
  const expandInProgress = (projectId) => {
    setTab('IN_PROGRESS')
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('expanded', projectId)
      next.delete('tab')
      return next
    })
  }

  const toggleExpand = (projectId) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (next.get('expanded') === projectId) {
        next.delete('expanded')
        next.delete('tab')
      } else {
        next.set('expanded', projectId)
        next.delete('tab') // switching rows always returns to the task list
      }
      return next
    })
  }

  const setPanelMode = (mode) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (mode === 'plan') next.set('tab', 'plan')
      else next.delete('tab')
      return next
    })
  }

  const handleCreateSubmit = (body) => {
    setCreateError(false)
    createProject.mutate(body, {
      onSuccess: ({ projectId }) => {
        setOverlay(null)
        expandInProgress(projectId)
      },
      onError: () => setCreateError(true),
    })
  }

  const handleManageSubmit = (body) => {
    setManageError(false)
    setManageConflict(null)
    const { project } = overlay
    // 정보 변경 → 상태 변경 순차 (§PROJ.5 [추론]). Only PATCH the status
    // endpoint when it actually changed — the info PUT's own `status` field
    // is accepted by the 07 spec's body sample too, but §PROJ.5 explicitly
    // routes a status-only change through the DEDICATED endpoint.
    const infoChanged =
      body.name !== project.name || body.description !== project.description || body.dueDate !== project.dueDate
    const statusChanged = body.status !== project.status

    // W2 live-connect correction (2026-07-26): the real endpoint is PUT — a
    // full-field replace, not a partial PATCH merge (confirmed live; see
    // updateProject's own comment in projectApi.js). This form never lets the
    // user touch `priority`, so it has to be re-sent as-is here or a real PUT
    // would silently null it out; `version` is the PUT's required
    // optimistic-lock input (400 without it, confirmed live) AND the
    // E-COM-006 check's input — it used to be omitted entirely, which is the
    // OTHER half of the retry-loop bug below: even after "adopting" a newer
    // version there was nowhere for it to go on the next submit.
    const afterInfo = infoChanged
      ? updateProject.mutateAsync({
          projectId: project.projectId,
          body: {
            name: body.name,
            description: body.description,
            dueDate: body.dueDate,
            priority: project.priority,
            version: project.version,
          },
        })
      : Promise.resolve(null)

    afterInfo
      .then((updated) =>
        statusChanged
          ? updateProjectStatus.mutateAsync({
              projectId: project.projectId,
              status: body.status,
              // Use the version the PUT above just returned (bumped
              // server-side by that same write) when an info PUT ran first
              // in this submit — sending the stale pre-edit `project.version`
              // here would 409 the real backend's optimistic lock even
              // though THIS submit is the one that moved it. Falls back to
              // the pre-edit version when no PUT ran (status-only edits).
              version: updated?.version ?? project.version,
            })
          : null,
      )
      .then(() => {
        setOverlay(null)
        toast({ tone: 'success', message: '저장했습니다' })
        // MEDIUM bug fix (Thomas code review): editing a project's status
        // AWAY from the tab it's currently expanded under (e.g. 진행중 →
        // 보류, while the 진행중 tab is still the one on screen) used to
        // leave `?expanded=` pointing at an id that no longer appears in
        // ANY row on the visible tab — the row just silently vanished with
        // no explanation, since nothing else ever re-checked "is the
        // expanded project still on the tab I'm looking at". Collapsing it
        // here (same `toggleExpand` idiom handleDeleteConfirm's own
        // "can't stay expanded" case already uses) makes the disappearance
        // an intentional, visible state change instead of a silent one —
        // the row folds up before it drops off the current tab.
        // `statusChanged` alone is sufficient here (if this project is
        // BOTH currently expanded AND its status just changed, its new
        // status can never equal the CURRENT `tab` — it was only visible
        // on `tab` because its OLD status matched it); `body.status !== tab`
        // is kept anyway as an explicit, defensive restatement of that same
        // invariant rather than relying on it silently.
        if (statusChanged && expandedId === project.projectId && body.status !== tab) {
          toggleExpand(project.projectId)
        }
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
      onSuccess: () => {
        // A deleted project can't stay the expanded row.
        if (expandedId === deleteTarget.projectId) toggleExpand(deleteTarget.projectId)
        setDeleteTarget(null)
      },
      onError: () => setDeleteError(true),
    })
  }

  const handleDuplicate = (payload) => {
    setDuplicateError(false)
    duplicateProject.mutate(payload, {
      onSuccess: ({ projectId }) => {
        setOverlay(null)
        expandInProgress(projectId)
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
            <ProjectAccordionRow
              key={project.projectId}
              project={project}
              closed={tab === 'CLOSED'}
              expanded={expandedId === project.projectId}
              onToggle={() => toggleExpand(project.projectId)}
              panelMode={panelMode}
              onPanelModeChange={setPanelMode}
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
          onConflictRetry={() => {
            // Same fix as SettingsFixedSchedulesPage's own onConflictRetry
            // (identical bug, see that file's comment for the full
            // reasoning): "재시도" must ADOPT the latest version, or the next
            // submit resends the version this conflict was already raised
            // against and 409s again immediately. Only `version` moves from
            // `latest` onto `overlay.project` — name/description/dueDate/status
            // stay whatever the user already typed in the still-open form.
            if (manageConflict?.latest?.version != null) {
              setOverlay({
                ...overlay,
                project: { ...overlay.project, version: manageConflict.latest.version },
              })
            }
            setManageConflict(null)
          }}
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
          // ST-F1-13 TUT-03 coachmark anchor — a plain data attribute, zero
          // behavior change; TutorialOverlay finds it via querySelector rather
          // than this file importing anything tutorial-specific (keeps the
          // import direction one-way, §2.7).
          data-tut-id="tut-create-project"
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
