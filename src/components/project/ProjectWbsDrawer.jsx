import { useEffect, useId, useRef } from 'react'
import { BottomSheet } from '../common/BottomSheet'
import { ChevronLeftIcon } from '../plan/planIcons'
import { WbsTimeline } from './WbsTimeline'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { isTopmostOverlay, popOverlay, pushOverlay } from '../../utils/overlayStack'
import { useProjectWbs, useUpdateProject, useUpdateTaskSchedule } from '../../features/project/useProjectData'

/*
  계획(WBS) 뷰, as a DRAWER over the task list (owner spec: "[기간 설정] 누르면
  → 태스크별 배치/편집/삭제 버튼 숨김 + 오른쪽 드로어에 계획 뷰 열림. ← 버튼으로
  닫으면 태스크 리스트 복귀"). Mounted CONDITIONALLY by ProjectExpandedPanel
  while `panelMode === 'plan'` — its own useProjectWbs query (and every
  mutation below) simply does not exist until the user opens this, and tears
  down completely on close (any in-flight write is abandoned; React 18+
  treats a late resolve on an unmounted component as a safe no-op — same
  reasoning TaskEditModal's own preview overlay documents).

  DESKTOP vs MOBILE SHELL (owner's own "판단" call, left to this story):
  - Mobile reuses `BottomSheet` as-is — a real portaled overlay with its own
    full accessibility contract (focus trap, Esc, backdrop, overlayStack) for
    free, exactly the "모바일 = 바텀시트" instruction.
  - Desktop is a CUSTOM slide-in panel, not Dialog (a centered, backdrop-
    dimmed modal reads wrong for something that's meant to sit docked beside
    the task list it just replaced) and not a 50/50 in-card split either: an
    accordion row's own width is capped by the page's max-w-page container
    (72rem/1152px total, minus this list's own p-4), so a permanent half-width
    WBS pane would only have ~500px to show a multi-week gantt in — cramped
    enough to defeat G-8's own "show every day, no thinning" fix. An overlay
    that takes the FULL panel width when open (sliding in from the right,
    covering the task list rather than squeezing beside it) keeps the
    timeline genuinely usable; closing it (← button or Esc) returns to the
    task list exactly where it was. No backdrop/outside-click dismissal on
    desktop — unlike Dialog, this doesn't cover the full viewport (other
    accordion rows and this row's own header stay visibly outside it), so
    there is no "outside" region to catch a click on in the first place.
    Flagged for owner review alongside the rest of this story's judgment
    calls.

  ACCESSIBILITY: registers on the SAME shared `utils/overlayStack.js` stack
  Dialog/BottomSheet use (see that module's own header for the bug this
  prevents) so Esc is scoped correctly even if a project-level overlay
  (ProjectManageForm, DeleteProjectDialog…) happens to be open at the same
  time — without this, a single Esc press could close BOTH at once. Focus is
  trapped via the same `useFocusTrap` hook Dialog/BottomSheet share; unlike
  those, this does NOT lock body scroll — it covers only this one row's own
  panel, not the full viewport, and every OTHER accordion row (and the page
  around it) must stay scrollable while it's open.
*/
export function ProjectWbsDrawer({ project, tasks, onClose, disabled, disabledReason }) {
  const isDesktop = useIsDesktop()
  const titleId = useId()
  const closeRef = useRef(null)
  const containerRef = useRef(null)
  const overlayId = useId()

  const wbsQuery = useProjectWbs(project.projectId)
  const updateTaskSchedule = useUpdateTaskSchedule()
  const updateProject = useUpdateProject()

  // F-4 (carried over from ProjectWorkspacePage's own comment): the WBS node
  // itself carries no completion state — it's joined here against the SAME
  // task list the panel already loaded, by taskId, exactly as before.
  const taskStatusById = new Map(tasks.map((t) => [t.taskId, t.status]))
  const wbsNodes = (wbsQuery.data ?? []).map((n) => ({
    ...n,
    status: taskStatusById.get(n.taskId),
  }))

  const timeline = (
    <WbsTimeline
      project={project}
      nodes={wbsNodes}
      isLoading={wbsQuery.isLoading}
      isError={wbsQuery.isError}
      onRetry={() => wbsQuery.refetch()}
      disabled={disabled}
      disabledReason={disabledReason}
      onOpenTaskTab={onClose}
      onCommitRange={(taskId, patch) => updateTaskSchedule.mutate({ projectId: project.projectId, taskId, ...patch })}
      onCommitDeadline={(dueDate) => updateProject.mutateAsync({ projectId: project.projectId, body: { dueDate } })}
    />
  )

  if (!isDesktop) {
    // No `initialFocusRef` here — unlike the desktop shell below, this branch
    // has no bespoke close button of its own to point one at (BottomSheet
    // already renders its own 48px drag-handle close button); its focus
    // trap's own fallback (first focusable descendant) lands inside the
    // timeline instead, which is a reasonable default with nothing better to
    // name explicitly.
    return (
      <BottomSheet open onClose={onClose} labelledById={titleId}>
        <div className="flex flex-col gap-4">
          <h2 id={titleId} className="text-title font-semibold text-text">
            계획 (WBS)
          </h2>
          {timeline}
        </div>
      </BottomSheet>
    )
  }

  return (
    <DesktopDrawer
      titleId={titleId}
      closeRef={closeRef}
      containerRef={containerRef}
      overlayId={overlayId}
      onClose={onClose}
    >
      {timeline}
    </DesktopDrawer>
  )
}

function DesktopDrawer({ titleId, closeRef, containerRef, overlayId, onClose, children }) {
  useFocusTrap(containerRef, { open: true, initialFocusRef: closeRef })

  // Same registration shape as Dialog.jsx's own effect (see that file's
  // header for the full reasoning) — push on mount, pop on unmount, respond
  // to Esc only while topmost. `onClose` is read via a ref (not closed over
  // directly) so this registration effect's own deps stay down to just
  // `[overlayId]`, exactly like Dialog's: without the indirection, a
  // re-render for any unrelated reason while open would pop-then-repush this
  // instance, silently moving it to the top of the shared stack.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    pushOverlay(overlayId)
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return
      if (!isTopmostOverlay(overlayId)) return
      onCloseRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      popOverlay(overlayId)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [overlayId])

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={[
        // `min-h`: the underlying panel's OWN height (what `inset-0` would
        // otherwise cover exactly) is whatever the task list beneath happens
        // to need — a project with only 1-2 tasks would hand the WBS gantt a
        // cramped box otherwise. A floor gives the timeline room regardless
        // of how short the panel underneath is; `inset-0` still wins (grows
        // past this floor) for any panel taller than it.
        'absolute inset-0 z-10 flex min-h-[28rem] flex-col overflow-hidden rounded-card border border-border bg-surface shadow-modal',
        'motion-safe:animate-[slide-in-right_var(--duration-slow)_var(--ease-emphasized)]',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 border-b border-border p-3">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="계획 뷰 닫기, 태스크 목록으로"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-text-muted transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <ChevronLeftIcon className="text-xl" />
        </button>
        <h2 id={titleId} className="text-title font-semibold text-text">
          계획 (WBS)
        </h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
    </div>
  )
}

export default ProjectWbsDrawer
