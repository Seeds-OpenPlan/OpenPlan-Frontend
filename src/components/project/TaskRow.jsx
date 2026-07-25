import { Link } from 'react-router-dom'
import { Badge } from '../common/Badge'
import { formatDurationKO } from '../../features/plan/planTime'
import { priorityLabelKO } from '../../features/plan/planPlacement'
import { TASK_STATUS_BADGE_TONE, TASK_STATUS_LABELS } from '../../features/project/projectLabels'

/*
  One row in the 태스크 탭 (ui-spec §PROJ.2.1). Status→badge mapping follows
  the ERD's task.status enum directly: UNASSIGNED = "미배치" (danger — nothing
  placed yet), IN_PROGRESS = "배치됨" (brand — usePlanData.useSetBlockComplete
  already sets this exact status the moment a task is placed as a block),
  COMPLETED = "완료" (success). Labels/tones come from projectLabels.js
  (TASK_STATUS_*), not spelled out locally — see that file's own comment.

  G-1 (owner review 2026-07-24, superseded twice by ST-F1-09): 편집/삭제 are
  BACK — the lead's original instruction (#3, true when it was written) was
  that a rendered "편집" link would point at SCR-TASK-EDIT, a route
  ST-F1-09 hadn't built yet, so no link was better than a dead one. The owner
  then asked for edit/delete explicitly, routed through THIS screen instead
  (편집 opened `TaskCreateForm` in place as an edit-mode overlay). ST-F1-09
  then built a route (`tasks/:taskId/edit`, TaskEditPage) and 편집 briefly
  navigated there — but a SECOND owner review (dev-server walkthrough)
  decided against a separate page entirely: SCR-TASK-EDIT now opens as
  `TaskEditModal` (Dialog/BottomSheet, ui-spec PROJ-18's "별도 편집 페이지"
  deliberately overridden). 편집 is back to a plain button that opens it —
  no navigation, no route, page-local state owned by ProjectWorkspacePage
  (mirrors "삭제"'s own `DeleteTaskDialog`, which never changed). Neither is
  gated on `task.status` (G-3 — a completed task stays editable; ProjectCard's
  own edit/delete don't gate on the project's status either, so this isn't a
  new exception).

  H-4 (owner review 2026-07-24): action order is 배치 → 편집 → 삭제 (changed
  from an earlier 편집 → 배치 → 삭제 — the owner wants 배치, the row's most
  common action for an UNASSIGNED task, leading). 배치 is brand-blue
  (`PLACE_ACTION_CLASS`) — its own label text already says "배치" so the
  color reinforces rather than replaces that (NFR-017), same principle
  삭제's danger-red already leans on. 편집 stays the neutral/muted styling;
  삭제 stays last and danger-red (the odd one out, and furthest from an
  overshot tap — same reasoning ProjectCard's own comment gives for its
  삭제 placement).
*/

const ACTION_CLASS =
  'inline-flex min-h-11 items-center rounded-control px-2 text-label font-medium text-text-muted transition-colors hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring'
const PLACE_ACTION_CLASS =
  'inline-flex min-h-11 items-center rounded-control px-2 text-label font-medium text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring'
const DELETE_ACTION_CLASS =
  'inline-flex min-h-11 items-center rounded-control px-2 text-label font-medium text-danger-600 transition-colors hover:bg-danger-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring'

export function TaskRow({ task, projectId, onEdit, onDelete, actionsHidden = false }) {
  const badge = {
    tone: TASK_STATUS_BADGE_TONE[task.status] ?? TASK_STATUS_BADGE_TONE.UNASSIGNED,
    label: TASK_STATUS_LABELS[task.status] ?? TASK_STATUS_LABELS.UNASSIGNED,
  }
  const meta = [
    `예상 ${formatDurationKO(task.estimatedMinutes)}`,
    `우선순위 ${priorityLabelKO(task.priority)}`,
    task.dueDate ? `마감 ${task.dueDate}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-1 py-3 last:border-b-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {/* F-2 (owner review 2026-07-23): strikethrough is a visual-only cue
              (NFR-017 forbids color/strikethrough alone) — the "완료" Badge
              right beside it already carries the same meaning in text, so the
              line-through here is a redundant reinforcement, never the sole
              signal. */}
          <p
            className={[
              'text-label font-medium text-text',
              task.status === 'COMPLETED' ? 'line-through text-text-muted' : '',
            ].join(' ')}
          >
            {task.title}
          </p>
          <Badge tone={badge.tone} label={badge.label} />
          {task.dueSoon && task.status !== 'COMPLETED' && <Badge tone="danger" label="마감 임박" />}
        </div>
        <p className="mt-1 text-caption text-text-muted">{meta}</p>
      </div>
      {/* `actionsHidden` (accordion restructure, PROJ 계획 드로어): the host
          panel sets this while its own [기간 설정] WBS drawer is open — the
          owner's own instruction is "배치/편집/삭제 버튼 숨김" for every row,
          not a per-button opt-out, so this hides the whole trailing group as
          one unit rather than three separate conditionals. The row's info
          block above stays visible either way; only the actions disappear. */}
      {!actionsHidden && (
      <div className="flex shrink-0 items-center gap-1">
        {task.status === 'UNASSIGNED' && (
          <Link to={`/weekly?project=${projectId}&openUnplaced=1`} className={PLACE_ACTION_CLASS}>
            배치
          </Link>
        )}
        {/* ui-spec-proj.md:153 — 편집 opens SCR-TASK-EDIT as a MODAL
            (TaskEditModal, owner override of PROJ-18's page — see this
            file's own G-1 comment), not a navigation. */}
        <button type="button" onClick={() => onEdit?.(task.taskId)} className={ACTION_CLASS}>
          편집
        </button>
        {/*
          G-2 (owner review 2026-07-24): NO "배치 해제" button here for an
          IN_PROGRESS (배치됨) row — deliberately, not an oversight. §CONTRACT
          GAP for BE-1: `getProjectTasks` (this row's own data source) never
          returns WHERE a placed task is scheduled — no `weekStartISO`, no
          `planBlockId`. Unplacing (PLAN-16) goes through
          usePlanData.useRemoveBlockWithUndo(), which needs BOTH of those
          (it optimistically patches that week's OWN query cache via
          `weekPlanKey(weekStartISO)` and needs the full block object for its
          undo/redo replay) — this screen has no way to even ask "which
          week is this task's block in", since it never loads any week data
          at all. A lower-level `deleteBlock(planBlockId)` call would hit
          the exact same wall (no id to pass it either way).
          Once the WBS/task-list response carries that placement reference,
          this becomes a normal reuse of useRemoveBlockWithUndo — until
          then, the existing "배치" link above (→ WeeklyPage's own unplaced
          panel) is the one path back to unplacing, same as it already was
          before this feedback round. A button that can't actually work is
          worse than no button (same principle this file's own G-1 comment
          already states for a route that doesn't exist yet).
        */}
        <button type="button" onClick={() => onDelete?.(task)} className={DELETE_ACTION_CLASS}>
          삭제
        </button>
      </div>
      )}
    </li>
  )
}

export default TaskRow
