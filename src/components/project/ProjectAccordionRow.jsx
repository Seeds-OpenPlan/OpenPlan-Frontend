import { Badge } from '../common/Badge'
import { ProgressBar } from '../common/ProgressBar'
import { ChevronRightIcon } from '../plan/planIcons'
import { ProjectExpandedPanel } from './ProjectExpandedPanel'

/*
  One project row on the accordion SCR-PROJ-LIST (project-accordion
  restructure, owner-approved design — supersedes the ST-F1-08 "whole card is
  a link to a separate workspace page" shape). SINGLE-OPEN accordion: the
  parent (ProjectsPage) owns `expanded` as ONE value (not a per-row boolean
  set), so expanding a second row can only ever mean the first one collapsed —
  there is no local "am I open" state here at all, only what the parent hands
  down.

  HEADER LAYOUT is otherwise the same content the old ProjectCard rendered
  (title/due date/badges/meta/progress bar, and the same 편집→복제→삭제 action
  order — see those comments below, carried over verbatim) — only the
  INTERACTION changed: the "stretched link to a separate page" trick is now a
  "stretched button that toggles this row's own panel", and a leading chevron
  (rotates 90° when open) replaces the old plain-link affordance. The invisible
  full-cover `<button>` carries the row's real accessible name (project +
  state); the visible title text beside it is now plain, non-interactive text
  — there is nowhere left for it to navigate ON ITS OWN, the toggle already
  covers the whole header.
*/

const ACTION_CLASS =
  'inline-flex min-h-11 items-center rounded-control px-2 text-label font-medium text-text-muted transition-colors hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring'
const DELETE_ACTION_CLASS =
  'inline-flex min-h-11 items-center rounded-control px-2 text-label font-medium text-danger-600 transition-colors hover:bg-danger-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring'

export function ProjectAccordionRow({
  project,
  closed = false,
  expanded,
  onToggle,
  panelMode,
  onPanelModeChange,
  onEdit,
  onDelete,
  onDuplicate,
}) {
  const { projectId, name, dueDate, taskCount, completedCount, unplacedCount, placedCount, dueSoonCount } =
    project
  const panelId = `project-panel-${projectId}`

  const meta = [`태스크 ${taskCount}`, `완료 ${completedCount}`, unplacedCount > 0 ? `미배치 ${unplacedCount}` : null]
    .filter(Boolean)
    .join(' · ')

  const ariaLabel = `${name}, 마감 ${dueDate ?? '없음'}, 태스크 ${taskCount}개 중 완료 ${completedCount}, ${
    expanded ? '접기' : '펼치기'
  }`

  return (
    <li className="rounded-card border border-border bg-surface shadow-card">
      <div className="relative p-4">
        {/* The toggle — see this file's own header for why this replaced the
            old stretched <Link>. `aria-controls` names the panel below only
            while it actually exists in the DOM (conditionally rendered,
            same as every other overlay in this codebase); pointing it at an
            id that doesn't exist while collapsed would be wrong every time
            this row is CLOSED, which is the default state. */}
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={expanded ? panelId : undefined}
          aria-label={ariaLabel}
          onClick={onToggle}
          className="absolute inset-0 z-0 rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <ChevronRightIcon
              className={[
                'shrink-0 text-text-muted motion-safe:transition-transform motion-safe:duration-fast',
                expanded ? 'rotate-90' : '',
              ].join(' ')}
            />
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="static shrink-0 text-body font-semibold text-text">{name}</span>
              <span className="shrink-0 text-caption text-text-muted">마감 {dueDate ?? '없음'}</span>
            </div>
          </div>

          {/* Badges + actions share this line with the title (reference
              layout, unchanged from ProjectCard). Both sit ABOVE the toggle
              button (z-10) so they stay independently clickable — same
              layering trick the old stretched-link version used, just with a
              real <button> underneath instead of a pseudo-element. */}
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

        {/* Non-positioned flow content, safe to sit UNDER the toggle button's
            z-0 layer (same reasoning ProjectCard's own comment gave for the
            old stretched-link version) — clicking anywhere in this region
            still hits the toggle and expands/collapses the row. */}
        {closed ? (
          <div className="relative mt-2">
            <Badge
              tone="neutral"
              label={project.closedAt ? '기간이 지나 자동 종료됨' : '중지되었던 프로젝트가 종료되었습니다'}
            />
          </div>
        ) : (
          <div className="relative">
            <p className="mt-2 text-caption text-text-muted">{meta}</p>
            <ProgressBar
              value={completedCount}
              max={taskCount}
              label={`완료 ${completedCount}/${taskCount}`}
              className="mt-3"
            />
          </div>
        )}
      </div>

      {expanded && (
        <div id={panelId} className="border-t border-border p-4 pt-3">
          <ProjectExpandedPanel project={project} panelMode={panelMode} onPanelModeChange={onPanelModeChange} />
        </div>
      )}
    </li>
  )
}

export default ProjectAccordionRow
