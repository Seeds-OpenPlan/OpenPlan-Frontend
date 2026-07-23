import { Link } from 'react-router-dom'
import { Badge } from '../common/Badge'
import { ProgressBar } from '../common/ProgressBar'

/*
  One project in SCR-PROJ-LIST (ui-spec §PROJ.1). The whole card is a link to
  the workspace via a "stretched link" pattern — the title is a real <a> that
  visually fills the card (absolute inset-0, z-0), and the top row (due date,
  badges, actions) sits ABOVE it (relative z-10) so it stays independently
  clickable.

  LAYOUT (owner review 2026-07-23, A-6 — restored to match Desktop.Project.png
  and the spec's own ASCII exactly): title + due date share the TOP line, and
  the status badges sit on that SAME line too, immediately left of the
  actions. An earlier version pushed both the due date and the badges down
  onto their own line below the meta row — matching neither the reference nor
  the spec, and making every card a full line taller than it needed to be.
  Only the meta line ("태스크 n · 완료 n · 미배치 n") and the progress bar stay
  on their own row below, exactly as both the reference and the spec show.

  Two intentional DELTAS from the reference PNG (not redesign drift — both are
  spelled out in ui-spec §PROJ.1 itself):
  - "완료 {n}" in the meta line: the reference has no such text, but the spec
    adds it so the progress bar's meaning is never color/width-only (NFR-017).
  - The "복제" action: absent from the reference entirely; the spec adds it as
    PROJ-10's only list-level entry point (there is no other way to start a
    duplication from this screen).

  Action order is 편집 → 복제 → 삭제 (A-7): 삭제 goes LAST, both because it's
  the odd one out (destructive vs the other two, which just open more
  editing) and because putting the most consequential action furthest from
  the row's leading edge lowers the chance of hitting it by an overshot tap.
  Its danger-red text reinforces that hierarchy visually — NOT the sole
  carrier of meaning (NFR-017): the label itself already says "삭제".
*/

const ACTION_CLASS =
  'inline-flex min-h-11 items-center rounded-control px-2 text-label font-medium text-text-muted transition-colors hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring'
const DELETE_ACTION_CLASS =
  'inline-flex min-h-11 items-center rounded-control px-2 text-label font-medium text-danger-600 transition-colors hover:bg-danger-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring'

export function ProjectCard({ project, closed = false, onEdit, onDelete, onDuplicate }) {
  const { projectId, name, dueDate, taskCount, completedCount, unplacedCount, placedCount, dueSoonCount } =
    project

  const meta = [`태스크 ${taskCount}`, `완료 ${completedCount}`, unplacedCount > 0 ? `미배치 ${unplacedCount}` : null]
    .filter(Boolean)
    .join(' · ')

  const ariaLabel = `${name}, 마감 ${dueDate ?? '없음'}, 태스크 ${taskCount}개 중 완료 ${completedCount}`

  return (
    <li className="relative rounded-card border border-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <Link
            to={`/projects/${projectId}`}
            aria-label={ariaLabel}
            className="static shrink-0 text-body font-semibold text-text before:absolute before:inset-0 before:z-0 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            {name}
          </Link>
          <span className="shrink-0 text-caption text-text-muted">마감 {dueDate ?? '없음'}</span>
        </div>

        {/* Badges + actions share this line with the title (reference layout).
            Both sit ABOVE the stretched-link pseudo-element (z-10) — the
            badges have no click handler of their own, but they occupy real
            space in this narrow top-right strip, and NOT lifting them above
            the overlay would make that strip randomly half-dead/half-clickable
            depending on exactly where a badge happens to render. */}
        <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-2">
          {!closed && (placedCount > 0 || unplacedCount > 0 || dueSoonCount > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {placedCount > 0 && <Badge tone="brand" label={`배치됨 ${placedCount}`} />}
              {unplacedCount > 0 && <Badge tone="danger" label={`미배치 ${unplacedCount}`} />}
              {dueSoonCount > 0 && <Badge tone="danger" label="마감 임박" />}
            </div>
          )}
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => onEdit?.(project)} className={ACTION_CLASS}>
              편집
            </button>
            <button type="button" onClick={() => onDuplicate?.(project)} className={ACTION_CLASS}>
              복제
            </button>
            <button type="button" onClick={() => onDelete?.(project)} className={DELETE_ACTION_CLASS}>
              삭제
            </button>
          </div>
        </div>
      </div>

      {/* Below here is plain, non-positioned flow content on purpose: the
          stretched-link pseudo-element (an absolutely positioned, z-0 box)
          paints ABOVE ordinary static content in CSS stacking order, so a
          click anywhere in this region still hits the link and navigates.
          Only the row above needs its own `relative z-10` to win against
          that overlay — giving these non-interactive nodes the same
          treatment would make them swallow clicks that should have
          navigated, silently shrinking the card's clickable area down to
          just the title text. */}
      {closed ? (
        // A-5 (owner review): a status CAPTION, not body copy that reads like
        // a description — reusing Badge (already the codebase's "this is a
        // status, not prose" pattern) rather than a paragraph, which is
        // exactly what got misread as the project's description earlier.
        <div className="mt-2">
          <Badge
            tone="neutral"
            label={project.closedAt ? '기간이 지나 자동 종료됨' : '중지되었던 프로젝트가 종료되었습니다'}
          />
        </div>
      ) : (
        <>
          <p className="mt-2 text-caption text-text-muted">{meta}</p>
          <ProgressBar
            value={completedCount}
            max={taskCount}
            label={`완료 ${completedCount}/${taskCount}`}
            className="mt-3"
          />
        </>
      )}
    </li>
  )
}

export default ProjectCard
