import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../components/common/Button'
import { ErrorState } from '../components/common/ErrorState'
import { ConflictOverlay } from '../components/common/ConflictOverlay'
import { SkeletonListRow, SkeletonText } from '../components/common/Skeleton'
import { MinuteStepper } from '../components/plan/MinuteStepper'
import { ChevronLeftIcon } from '../components/plan/planIcons'
import { TaskEditPreview } from '../components/task/TaskEditPreview'
import NotFoundPage from './NotFoundPage'
import ForbiddenPage from './ForbiddenPage'
import {
  projectTasksKey,
  taskKey,
  useCategories,
  useTask,
  useUpdateTask,
} from '../features/project/useProjectData'
import { useCorrectionProposal } from '../features/stats/useStats'
import { useTaskEditPreview } from '../features/task/useTaskEditPreview'
import { priorityLabelKO } from '../features/plan/planPlacement'
import { formatDurationKO } from '../features/plan/planTime'
import { TASK_STATUS_OPTIONS } from '../features/project/projectLabels'
import { useAppStore } from '../store/useAppStore'
import { toast } from '../hooks/useToasts'

/*
  SCR-TASK-EDIT (ST-F1-09). Deep-linked by a bare taskId from two places:
  TaskRow.jsx's own 편집 action (a project's 태스크 탭 row) and WeeklyPage.jsx's
  "태스크 편집" context-menu item on a placed block. A full PAGE, not a modal
  — the AC-2 suggestion chip and the AC-3 mini-week preview both need room a
  Dialog/BottomSheet doesn't comfortably have, and neither entry point is
  itself a modal context to stack another one on top of.

  Split in two on purpose: TaskEditPage (below) owns ONLY data-loading/error
  routing so it can freely early-return before any form state exists;
  TaskEditForm owns every piece of local edit state and is mounted ONLY once
  `task` has actually loaded (same "guard first, then hand a ready value to a
  child that owns useState from it" split ProjectWorkspacePage uses for
  ProjectManageForm/TaskCreateForm) — React's rules-of-hooks forbid a
  conditional early return ABOVE a useState in the same component.
*/
const FIELD =
  'w-full rounded-control border border-border bg-surface px-3 py-2 text-label text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring'
const PRIORITIES = [1, 2, 3] // 높음·보통·낮음 (priorityLabelKO)

function TaskEditPage() {
  const { taskId } = useParams()
  const taskQuery = useTask(taskId)

  if (taskQuery.isError) {
    // Same "render the shared SCR-404/403 surface in place, don't redirect"
    // convention ProjectWorkspacePage.jsx already follows for the identical
    // reason: the URL stays the id the user actually requested.
    if (taskQuery.error?.status === 404) return <NotFoundPage />
    if (taskQuery.error?.status === 403) return <ForbiddenPage />
    return (
      <div className="mx-auto max-w-2xl">
        <ErrorState variant="section" onAction={() => taskQuery.refetch()} />
      </div>
    )
  }

  if (taskQuery.isLoading || !taskQuery.data) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <SkeletonText lines={2} />
        <SkeletonListRow count={5} />
      </div>
    )
  }

  // `key={task.taskId}`: forces a full remount (fresh useState initializers)
  // if the route ever navigates from one task's edit page directly to
  // another's (e.g. a future "다음 태스크" affordance, or the browser
  // history landing on a different :taskId without a full page reload).
  // Without it, TaskEditForm's useState(task.title) etc. would keep the
  // PREVIOUS task's field values on screen for one render, since a useState
  // initializer only runs once per mount — cheap, defensive (Thomas review).
  return <TaskEditForm key={taskQuery.data.taskId} task={taskQuery.data} />
}

function TaskEditForm({ task }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const headingRef = useRef(null)

  const [title, setTitle] = useState(task.title)
  const [estimatedMinutes, setEstimatedMinutes] = useState(task.estimatedMinutes)
  const [priority, setPriority] = useState(task.priority)
  const [dueDate, setDueDate] = useState(task.dueDate ?? '')
  const [status, setStatus] = useState(task.status)
  const [category, setCategory] = useState(task.category ?? '')
  const [memo, setMemo] = useState(task.memo ?? '')
  const [submitError, setSubmitError] = useState(false)
  const [conflict, setConflict] = useState(null) // { latest } | null
  // AC-4 "② 내 변경 재시도": adopts the CONFLICT'S OWN latest.version so the
  // resubmit can actually succeed instead of 409ing again on the same stale
  // number. The two existing OVL-CONFLICT callers in this codebase
  // (ProjectManageForm/ProjectWorkspacePage) don't do this — their retry just
  // clears the overlay and resubmits the SAME stale version, which would
  // 409-loop forever if the user actually pressed retry twice. Fixed here
  // rather than repeating that gap a third time.
  const [versionOverride, setVersionOverride] = useState(null)

  const categoriesQuery = useCategories()
  const proposalQuery = useCorrectionProposal(category || null)
  const updateTask = useUpdateTask()

  const trimmedTitle = title.trim()

  // SYS-04 (PTN-UNSAVED): the FIRST screen to actually wire the store's dirty
  // flag (useAppStore.markDirty/markClean) — every screen before this one
  // keeps its edits inside a MODAL that the page underneath survives
  // untouched, so none of them has needed the app-wide "unsaved changes"
  // guard yet. A full-PAGE edit form is exactly the case UnsavedGuard exists
  // for: leaving via the back link, the bottom tab bar, or the browser's own
  // back button should all be caught the same way a route change already is.
  const markDirty = useAppStore((s) => s.markDirty)
  const markClean = useAppStore((s) => s.markClean)
  const isDirty =
    trimmedTitle !== task.title ||
    estimatedMinutes !== task.estimatedMinutes ||
    priority !== task.priority ||
    (dueDate || null) !== task.dueDate ||
    status !== task.status ||
    (category || null) !== (task.category ?? null) ||
    memo.trim() !== (task.memo ?? '')

  useEffect(() => {
    if (isDirty) markDirty()
    else markClean()
  }, [isDirty, markDirty, markClean])
  // Cleanup on unmount: leaving this page (however it happens) must never
  // leave a stale dirty flag behind for whatever page loads next.
  useEffect(() => () => markClean(), [markClean])

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  // AC-3 미리보기 — recomputes (debounced) whenever the fields that affect
  // placement/duration change. `title` feeds the virtual block's own label so
  // a violation message naming it stays accurate; priority/status/category/
  // memo don't affect any validation rule (see violationMessages.js's own
  // catalog) and are intentionally NOT passed in.
  const preview = useTaskEditPreview({ taskId: task.taskId, title: trimmedTitle, estimatedMinutes })

  const goBack = () => navigate(`/projects/${task.projectId}`)

  const submit = (e) => {
    e.preventDefault()
    if (!trimmedTitle || updateTask.isPending) return
    setSubmitError(false)
    updateTask.mutate(
      {
        projectId: task.projectId,
        taskId: task.taskId,
        body: {
          title: trimmedTitle,
          estimatedMinutes,
          priority,
          dueDate: dueDate || null,
          status,
          category: category || null,
          memo: memo.trim(),
          // AC-4: the optimistic-lock token every write here now carries.
          version: versionOverride ?? task.version,
        },
      },
      {
        onSuccess: () => {
          // SYS-04 race fix (Thomas code review, MAJOR): markClean() is a
          // Zustand `set()`. Under React 18/19 automatic batching, calling it
          // and then navigate() in the SAME tick can let react-router
          // evaluate UnsavedGuard's blocker BEFORE that store update has
          // propagated to it — react-router re-registers its blocker
          // function during RENDER (not inside an effect), so if that render
          // hasn't happened yet, the blocker still sees the STALE dirty:true
          // and pops a spurious "저장하지 않은 변경..." confirm right after a
          // successful save. flushSync forces the Zustand update and every
          // subscriber's re-render (including UnsavedGuard's) to commit
          // synchronously before navigate() runs, so the blocker navigate()
          // triggers already sees dirty:false. This is the FIRST full-page
          // save-then-navigate flow in the app to exercise this path, so it
          // is not left to chance.
          flushSync(() => markClean())
          toast({ tone: 'success', message: '저장했습니다' })
          navigate(`/projects/${task.projectId}`)
        },
        onError: (error) => {
          if (error?.code === 'E-COM-006') {
            setConflict({ latest: error.details?.latest })
            return
          }
          setSubmitError(true)
        },
      },
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-center gap-2">
        <Link
          to={`/projects/${task.projectId}`}
          aria-label="프로젝트로 돌아가기"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-text-muted transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <ChevronLeftIcon className="text-xl" />
        </Link>
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-text outline-none">
          태스크 편집
        </h1>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-5 rounded-card border border-border bg-surface p-5">
        <label className="flex flex-col gap-1">
          <span className="text-caption font-medium text-text-muted">제목 *</span>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={FIELD} />
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-caption font-medium text-text-muted">예상시간 *</span>
          <MinuteStepper value={estimatedMinutes} onChange={setEstimatedMinutes} label="예상시간" />
          {/* AC-2 제안 칩 — only when a proposal exists for the SELECTED
              category, and NEVER applied until this button is actually
              clicked (no auto-apply on category change / proposal arrival). */}
          {category && proposalQuery.data && (
            <button
              type="button"
              onClick={() => setEstimatedMinutes(proposalQuery.data.suggestedMinutes)}
              className="inline-flex w-fit items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-caption font-medium text-brand-700 transition-colors hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              최근 {category} 편차 반영: {formatDurationKO(proposalQuery.data.suggestedMinutes)} — 적용하려면 선택
            </button>
          )}
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-caption font-medium text-text-muted">우선순위</legend>
          <div className="flex flex-wrap gap-4">
            {PRIORITIES.map((p) => (
              <label key={p} className="flex items-center gap-2 text-label text-text">
                <input type="radio" name="task-priority" checked={priority === p} onChange={() => setPriority(p)} />
                {priorityLabelKO(p)}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1">
          <span className="text-caption font-medium text-text-muted">마감일</span>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={FIELD} />
        </label>

        {/* [가정—신규] (ST-F1-09 AC-1): a direct field edit via PATCH
            /tasks/{id} — a SEPARATE write path from the plan feature's own
            PATCH /tasks/{id}/status toggle (완료로 표시/미완료로 되돌리기,
            WeeklyPage.jsx's context menu). Both exist in this codebase,
            targeting disjoint mock task stores; see projectApi.getTask's own
            cross-store-gap comment. */}
        <fieldset className="flex flex-col gap-2">
          <legend className="text-caption font-medium text-text-muted">상태</legend>
          <div className="flex flex-wrap gap-4">
            {TASK_STATUS_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 text-label text-text">
                <input
                  type="radio"
                  name="task-status"
                  value={opt.value}
                  checked={status === opt.value}
                  onChange={() => setStatus(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1">
          <span className="text-caption font-medium text-text-muted">카테고리</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={FIELD}>
            <option value="">없음</option>
            {(categoriesQuery.data ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-caption font-medium text-text-muted">메모</span>
          <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} className={`${FIELD} resize-none`} />
        </label>

        {submitError && <ErrorState variant="inline" onAction={() => setSubmitError(false)} />}

        <div className="mt-1 flex items-center justify-between gap-2">
          <span role="alert" className="text-caption text-danger-700">
            {!trimmedTitle && '제목을 입력해 주세요'}
          </span>
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="secondary" size="md" onClick={goBack}>
              취소
            </Button>
            <Button type="submit" variant="primary" size="md" loading={updateTask.isPending} disabled={!trimmedTitle}>
              저장
            </Button>
          </div>
        </div>
      </form>

      <TaskEditPreview {...preview} />

      <ConflictOverlay
        open={Boolean(conflict)}
        latest={conflict?.latest}
        current={{ title: trimmedTitle, estimatedMinutes, priority, dueDate: dueDate || null, status, category: category || null, memo: memo.trim() }}
        returnFocusRef={headingRef}
        onAccept={() => {
          // "① 최신 데이터 수용" — drop my draft. Invalidates the caches a
          // fresh visit anywhere (this page again, the project's task list)
          // would read, then leaves the page — there is no "my draft" left
          // to keep showing once it has been explicitly discarded.
          // flushSync: same SYS-04 race as the save onSuccess above — this
          // path ALSO calls markClean() immediately before a navigate
          // (goBack), so it needs the identical fix.
          setConflict(null)
          flushSync(() => markClean())
          queryClient.invalidateQueries({ queryKey: taskKey(task.taskId) })
          queryClient.invalidateQueries({ queryKey: projectTasksKey(task.projectId) })
          goBack()
        }}
        onRetry={() => {
          // "② 내 변경 재시도" — keep my draft on screen, adopt the latest
          // version so the NEXT 저장 press can actually succeed.
          setVersionOverride(conflict?.latest?.version ?? null)
          setConflict(null)
        }}
      />
    </div>
  )
}

export default TaskEditPage
