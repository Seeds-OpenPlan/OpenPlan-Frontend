import { useEffect, useId, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Dialog } from '../common/Dialog'
import { BottomSheet } from '../common/BottomSheet'
import { Button } from '../common/Button'
import { ErrorState } from '../common/ErrorState'
import { ConflictOverlay } from '../common/ConflictOverlay'
import { SkeletonListRow, SkeletonText } from '../common/Skeleton'
import { AlertTriangleIcon } from '../common/statusIcons'
import { MinuteStepper } from '../plan/MinuteStepper'
import { ChevronRightIcon } from '../plan/planIcons'
import { TaskEditPreview } from './TaskEditPreview'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import { useAppStore } from '../../store/useAppStore'
import { toast } from '../../hooks/useToasts'
import { systemMessages } from '../../constants/systemMessages'
import {
  projectTasksKey,
  taskKey,
  useCategories,
  useTask,
  useUpdateTask,
} from '../../features/project/useProjectData'
import { useCorrectionProposal } from '../../features/stats/useStats'
import { useTaskEditPreview } from '../../features/task/useTaskEditPreview'
import { priorityLabelKO } from '../../features/plan/planPlacement'
import { formatDurationKO } from '../../features/plan/planTime'
import { TASK_STATUS_OPTIONS } from '../../features/project/projectLabels'

/*
  SCR-TASK-EDIT, as a MODAL (owner decision, post-review — supersedes the
  original separate-page approach; a deliberate deviation from spec PROJ-18's
  "별도 편집 페이지", owner-confirmed). Opened by a bare taskId from two
  places: TaskRow.jsx's own 편집 button (a project's 태스크 탭 row) and
  WeeklyPage.jsx's "태스크 편집" context-menu item on a placed block. Each
  host screen owns ONE piece of local state (the open taskId) and renders
  this component conditionally — same "mount only while open" shape
  TaskCreateForm/ProjectManageForm already use.

  SELF-CONTAINED BY DESIGN: this component takes only `{ taskId, onClose }` —
  no page context, no route params, no assumption about where it is mounted.
  It fetches its own data (useTask) and owns its own shell (Dialog/BottomSheet
  via useIsDesktop, `size="xl"` on desktop — see Dialog.jsx's own comment on
  why). This is deliberate: the owner has already flagged a FUTURE story that
  reuses this exact component inside an accordion project card, which will
  mount it from yet another host with no page of its own at all.

  GRACEFUL NOT-FOUND, NOT A CRASH: the WeeklyPage entry point passes a PLAN
  block's taskId (`plan-task-*`). projectApi.getTask NOW routes that prefix
  to planFixtures.js's own task bridge (owner follow-up, dev-server
  walkthrough — a plan block IS a real, editable task in production, so
  useTask resolves and populates the form same as a project-store task; see
  projectApi.getTask's own namespace-routing comment for the full contract).
  `TaskEditModalError` below is therefore no longer the ROUTINE outcome of
  that entry point — it stays reachable for a genuinely unknown id (a stale
  reference, a deleted task) either origin can still produce, rendered as an
  in-place message with a close action, never a blank body or a thrown error
  reaching the router's ErrorBoundary.

  UNSAVED CHANGES: closing a MODAL is not a route change, so the page-level
  fix (this story's own prior review round: flushSync(markClean) before
  navigate(), to beat the router blocker's re-registration race) no longer
  applies — there is no navigate() call left in this file at all, so that
  workaround is genuinely dead here and is not carried over. What DOES still
  apply: the global dirty flag (useAppStore.markDirty/markClean) stays wired
  exactly as before, now following THIS component's own mount/unmount
  lifecycle instead of a page's — open the modal → dirty tracking starts;
  close it (however) → the cleanup effect clears it. That keeps the CROSS-
  SCREEN case covered (the user clicks a totally unrelated nav link while this
  modal sits open and dirty — a REAL route change — UnsavedGuard's own
  route-level blocker still catches that). A NEW, local mechanism —
  `dirty`/`discardConfirmOpen` state right here — covers the same-screen case
  a route blocker can't: Esc / backdrop click / the modal's own "취소" button.
  All three funnel through `requestClose`, which prompts (reusing
  systemMessages.unsaved's own copy, the same catalog UnsavedGuard.jsx reads)
  only when there is something to lose.
*/

const FIELD =
  'w-full rounded-control border border-border bg-surface px-3 py-2 text-label text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring'
const PRIORITIES = [1, 2, 3] // 높음·보통·낮음 (priorityLabelKO)
const TITLE_ID = 'task-edit-modal-title'

export function TaskEditModal({ taskId, onClose }) {
  const isDesktop = useIsDesktop()
  const taskQuery = useTask(taskId)
  const titleFieldRef = useRef(null)
  const [dirty, setDirty] = useState(false)
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false)

  // Every dismissal path (Esc, backdrop, 취소) funnels through here — nothing
  // closes the shell directly. Loading/error states never set `dirty` (there
  // is nothing editable in either), so this is a no-op prompt-skip for them.
  const requestClose = () => {
    if (dirty) {
      setDiscardConfirmOpen(true)
      return
    }
    onClose()
  }

  let content
  if (taskQuery.isError) {
    content = (
      <TaskEditModalError
        notFound={taskQuery.error?.status === 404}
        onRetry={() => taskQuery.refetch()}
        onClose={onClose}
      />
    )
  } else if (taskQuery.isLoading || !taskQuery.data) {
    content = (
      <div className="flex flex-col gap-4 py-1">
        <SkeletonText lines={2} />
        <SkeletonListRow count={4} />
      </div>
    )
  } else {
    content = (
      // `key`: forces a clean remount (fresh useState initializers) if this
      // modal is ever re-opened for a DIFFERENT task without fully
      // unmounting first — same defensive reasoning the page version's own
      // `key` had (Thomas code review).
      <TaskEditForm
        key={taskQuery.data.taskId}
        task={taskQuery.data}
        titleFieldRef={titleFieldRef}
        onDirtyChange={setDirty}
        onRequestClose={requestClose}
        onDone={onClose}
      />
    )
  }

  const body = (
    <div className="flex flex-col gap-5">
      <h2 id={TITLE_ID} className="text-title font-semibold text-text">
        태스크 편집
      </h2>
      {content}
    </div>
  )

  return (
    <>
      {isDesktop ? (
        <Dialog open onClose={requestClose} labelledById={TITLE_ID} initialFocusRef={titleFieldRef} size="xl">
          {body}
        </Dialog>
      ) : (
        <BottomSheet open onClose={requestClose} labelledById={TITLE_ID} initialFocusRef={titleFieldRef}>
          {body}
        </BottomSheet>
      )}
      {discardConfirmOpen && (
        <DiscardConfirmDialog
          onKeepEditing={() => setDiscardConfirmOpen(false)}
          onDiscard={() => {
            setDiscardConfirmOpen(false)
            onClose()
          }}
        />
      )}
    </>
  )
}

/*
  Graceful in-modal failure (see this file's own header for the WHY — a
  plan-store taskId is an EXPECTED 404 here, not a broken link). `role="alert"`
  mirrors ErrorState's own section/inline variants so this reads consistently
  with every other failure surface in the app. Reuses systemMessages.error's
  catalog for the generic branch (P4); the not-found copy is authored inline
  (no existing catalog entry fits "이 특정 항목을 찾을 수 없다" at modal scale
  — SCR-404's own copy is a full-PAGE surface, not this).
*/
function TaskEditModalError({ notFound, onRetry, onClose }) {
  const closeRef = useRef(null)
  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  return (
    <div role="alert" className="flex flex-col items-center gap-3 py-6 text-center">
      <AlertTriangleIcon className={notFound ? 'text-text-muted' : 'text-warning-600'} size={40} />
      <div>
        <h3 className="text-title font-semibold text-text">
          {notFound ? '태스크를 찾을 수 없습니다' : systemMessages.error.getTitle}
        </h3>
        <p className="mt-1 max-w-[36ch] text-body text-text-muted">
          {notFound
            ? '이 항목은 삭제되었거나 더 이상 존재하지 않습니다.'
            : systemMessages.error.sectionBody}
        </p>
      </div>
      <div className="mt-1 flex gap-2">
        {!notFound && (
          <Button variant="secondary" size="md" onClick={onRetry}>
            {systemMessages.error.retry}
          </Button>
        )}
        <Button ref={closeRef} variant="primary" size="md" onClick={onClose}>
          닫기
        </Button>
      </div>
    </div>
  )
}

/*
  Minimal local "discard changes?" confirm — reuses the SAME copy catalog
  UnsavedGuard.jsx reads (systemMessages.unsaved) and the SAME button
  shape/order (계속 편집 = primary, gets initial focus; 나가기 = danger),
  triggered locally by `requestClose` rather than react-router's
  `useBlocker` (a modal close is not a route change, so that mechanism does
  not apply here — see this file's own header). Always a centered Dialog,
  never a BottomSheet, matching UnsavedGuard's own "kept centered on mobile
  too" rule (ui-spec §0.3) — a second confirm stacked on the edit modal
  doesn't need to rise from the bottom to read as a modal.
*/
function DiscardConfirmDialog({ onKeepEditing, onDiscard }) {
  const titleId = useId()
  const stayRef = useRef(null)
  const m = systemMessages.unsaved

  return (
    <Dialog open onClose={onKeepEditing} labelledById={titleId} initialFocusRef={stayRef} size="sm">
      <h2 id={titleId} className="text-title font-bold text-text">
        {m.title}
      </h2>
      <p className="mt-2 text-body text-text-muted">{m.body}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="danger" size="md" onClick={onDiscard}>
          {m.leave}
        </Button>
        <Button ref={stayRef} variant="primary" size="md" onClick={onKeepEditing}>
          {m.stay}
        </Button>
      </div>
    </Dialog>
  )
}

/*
  AC-3 미리보기 disclosure (owner review, dev-server walkthrough — DEFAULT
  COLLAPSED). A real <button> with aria-expanded/aria-controls, not a styled
  <div>, so it is keyboard-operable (Enter/Space) and announced correctly by
  screen readers without any extra ARIA role.

  WHY CONDITIONAL MOUNT, not a `hidden`/CSS-collapsed panel with the hook left
  running: useTaskEditPreview owns useWeekPlan + useAvailability + the debounced
  usePlanValidation dry-run (GET the active week, POST validation-issues on
  every estimatedMinutes/title keystroke). Firing that on every keystroke
  while the user can't even SEE the result would be pure waste — network
  calls with no payoff. Mounting `TaskEditPreviewBody` (the component that
  actually calls the hook) ONLY when `open` means the hook simply does not
  exist while collapsed: no request, no debounce timer, nothing to
  separately "pause" via an enabled flag. Collapsing again UNMOUNTS it
  outright, which tears the whole dry-run down — any request already in
  flight is abandoned; React 18+ treats a late resolve on an unmounted
  component as a safe no-op (no leak, no warning). Expanding again mounts a
  FRESH instance that starts a fresh dry-run from the CURRENT field values —
  never stale data from before the collapse.
*/
function TaskEditPreviewDisclosure({ taskId, title, estimatedMinutes }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  // ONE bordered card: the button is its header, and expanding reveals the body
  // INSIDE the same card (a `border-t` when open separates header from body).
  // Previously the button and the preview were two separate bordered cards, so
  // expanding looked like a second "미리보기" panel appearing below the toggle
  // (owner review) — merged here so it reads as one panel opening.
  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={[
          'flex w-full items-center justify-between gap-2 px-4 py-3 text-label font-semibold text-text transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
          open ? 'border-b border-border' : '',
        ].join(' ')}
      >
        <span>미리보기</span>
        {/* ChevronRightIcon rotated to point down when open — reuses the
            existing chevron rather than adding a new icon component. */}
        <ChevronRightIcon
          className={[
            'text-lg text-text-muted motion-safe:transition-transform motion-safe:duration-fast motion-safe:ease-standard',
            open ? 'rotate-90' : '',
          ].join(' ')}
        />
      </button>
      {open && (
        <div id={panelId} className="px-4 pb-4 pt-3">
          <TaskEditPreviewBody taskId={taskId} title={title} estimatedMinutes={estimatedMinutes} />
        </div>
      )}
    </div>
  )
}

// Split out so useTaskEditPreview — and everything it fetches/validates —
// only exists for as long as the disclosure above is expanded.
function TaskEditPreviewBody({ taskId, title, estimatedMinutes }) {
  // `title` feeds the virtual block's own label so a violation message
  // naming it stays accurate; priority/status/category/memo don't affect any
  // validation rule (see violationMessages.js's own catalog) and are
  // intentionally NOT passed in.
  const preview = useTaskEditPreview({ taskId, title, estimatedMinutes })
  return <TaskEditPreview {...preview} />
}

function TaskEditForm({ task, titleFieldRef, onDirtyChange, onRequestClose, onDone }) {
  const queryClient = useQueryClient()

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

  // SYS-04 (PTN-UNSAVED): the global dirty flag, now following THIS
  // component's mount/unmount (the modal's own lifecycle) instead of a
  // page's — see this file's own header for why both this AND the local
  // `discardConfirmOpen` gate above are needed (they cover different
  // triggers: a route change vs. a modal-close gesture).
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
  // Cleanup on unmount: closing this modal (however) must never leave a
  // stale dirty flag behind for whatever screen is underneath it.
  useEffect(() => () => markClean(), [markClean])
  // Lifts the SAME isDirty to the modal shell so Esc/backdrop/취소 can gate
  // on it too (requestClose, in the parent).
  useEffect(() => {
    onDirtyChange(isDirty)
  }, [isDirty, onDirtyChange])

  // Move focus into the title field once THIS form actually mounts. The
  // outer Dialog/BottomSheet's own focus-trap ran its one-time "focus the
  // initialFocusRef" effect already, while the modal was still showing the
  // loading skeleton and `titleFieldRef.current` was still null (useFocusTrap
  // falls back to the container in that case) — that effect does not re-run
  // once this field actually exists, so this mount-time focus is what
  // actually lands it here.
  useEffect(() => {
    titleFieldRef.current?.focus()
  }, [titleFieldRef])

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
          markClean()
          toast({ tone: 'success', message: '저장했습니다' })
          onDone()
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
    <>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <label className="flex flex-col gap-1">
          <span className="text-caption font-medium text-text-muted">제목 *</span>
          <input
            ref={titleFieldRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={FIELD}
          />
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
            <Button type="button" variant="secondary" size="md" onClick={onRequestClose}>
              취소
            </Button>
            <Button type="submit" variant="primary" size="md" loading={updateTask.isPending} disabled={!trimmedTitle}>
              저장
            </Button>
          </div>
        </div>
      </form>

      {/* AC-3 미리보기 — collapsed by default (owner review); see
          TaskEditPreviewDisclosure's own header for why the dry-run itself
          (not just the visual panel) is gated on `open`, not merely hidden. */}
      <TaskEditPreviewDisclosure taskId={task.taskId} title={trimmedTitle} estimatedMinutes={estimatedMinutes} />

      <ConflictOverlay
        open={Boolean(conflict)}
        latest={conflict?.latest}
        current={{
          title: trimmedTitle,
          estimatedMinutes,
          priority,
          dueDate: dueDate || null,
          status,
          category: category || null,
          memo: memo.trim(),
        }}
        returnFocusRef={titleFieldRef}
        onAccept={() => {
          // "① 최신 데이터 수용" — drop my draft. Invalidates the caches a
          // fresh open (this modal again, the project's task list) would
          // read, then closes — there is no "my draft" left to keep showing
          // once it has been explicitly discarded. No flushSync/navigate race
          // to guard against here (see this file's own header) — `onDone`
          // just flips a plain boolean/id in the host screen's own state.
          setConflict(null)
          markClean()
          queryClient.invalidateQueries({ queryKey: taskKey(task.taskId) })
          // Guarded: a plan-origin task (see this file's own header) may
          // have no real projectId — same reasoning useUpdateTask's own
          // onSuccess guard documents (harmless either way, this is for
          // clarity/avoiding a pointless call, not an unguarded throw risk).
          if (task.projectId) {
            queryClient.invalidateQueries({ queryKey: projectTasksKey(task.projectId) })
          }
          onDone()
        }}
        onRetry={() => {
          // "② 내 변경 재시도" — keep my draft on screen, adopt the latest
          // version so the NEXT 저장 press can actually succeed.
          setVersionOverride(conflict?.latest?.version ?? null)
          setConflict(null)
        }}
      />
    </>
  )
}

export default TaskEditModal
