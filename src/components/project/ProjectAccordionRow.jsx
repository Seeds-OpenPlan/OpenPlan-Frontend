import { Badge } from '../common/Badge'
import { ProgressBar } from '../common/ProgressBar'
import { Skeleton } from '../common/Skeleton'
import { AccordionRow } from '../common/AccordionRow'
import { ChevronRightIcon } from '../plan/planIcons'
import { ProjectExpandedPanel } from './ProjectExpandedPanel'
import { useProjectTasks } from '../../features/project/useProjectData'
import { deriveProjectAggregates } from '../../features/project/projectApi'

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

  SHELL (li/toggle-button/panel-mount) now lives in components/common/
  AccordionRow.jsx — extracted for ST-F1-15's own 내 문의/공지 lists to reuse
  (owner feedback #10/11) rather than each screen re-deriving the same
  z-layering. This file keeps 100% of its OWN content (badges/actions/meta/
  progress bar, all project-specific) and only hands that content to the
  shared shell via `header`/`summary`/`panel`.
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
  // { data, isLoading } | undefined — ProjectsPage's own useProjectListAggregates
  // result for THIS project, keyed off the SAME queryKey the line below reads
  // (projectTasksKey) so the two never race each other into two requests. See
  // that hook's own header for why this exists (COLLAPSED-card "태스크
  // 0·완료 0" — the bug this row's own expand-time recompute below never
  // reached, since a collapsed row never ran it).
  listAggregate,
}) {
  const { projectId, name, dueDate } = project
  const panelId = `project-panel-${projectId}`

  // `project.taskCount`/etc. read a server rollup that real responses never
  // send today (projectApi.normalizeProject's own CONFIRMED note) — while
  // this row is the one open, its own task list is already being fetched
  // for the panel body below (same query key, deduped by TanStack Query, so
  // this is not a second request), so recompute the real numbers from that.
  const tasksQuery = useProjectTasks(expanded ? projectId : null)

  // Priority: this row's OWN expanded-panel fetch (freshest — reads straight
  // off what the panel body below is already showing) > the list-level
  // aggregate ProjectsPage fetched for every visible row, including this one
  // while collapsed (SAME cache entry once this row expands, so falling back
  // to it here just avoids a one-render flash back to a loading skeleton for
  // a row that was already resolved before the user opened it) > `project`'s
  // own server fields, which are only ever a last-resort default now (see
  // `countsLoading` below for why a plain missing-aggregate case renders a
  // placeholder instead of trusting that always-0 default outright).
  const derivedFromExpanded = tasksQuery.data ? deriveProjectAggregates(tasksQuery.data) : undefined
  const aggregateSource = derivedFromExpanded ?? listAggregate?.data
  // `listAggregate === undefined` means this project was never queried at all
  // (beyond useProjectListAggregates's own MAX_AGGREGATE_QUERIES cap, or a
  // caller that doesn't pass the prop) — that case falls straight through to
  // `project`'s own (always-0) fields below, same as before this hook
  // existed, NOT a loading state (nothing is in flight for it).
  const countsLoading =
    !aggregateSource && Boolean(listAggregate) && (expanded ? tasksQuery.isLoading : listAggregate.isLoading)
  const { taskCount, completedCount, unplacedCount, placedCount, dueSoonCount } = aggregateSource ?? project

  const meta = [`태스크 ${taskCount}`, `완료 ${completedCount}`, unplacedCount > 0 ? `미배치 ${unplacedCount}` : null]
    .filter(Boolean)
    .join(' · ')

  const ariaLabel = `${name}, 마감 ${dueDate ?? '없음'}, ${
    countsLoading ? '태스크 집계 불러오는 중' : `태스크 ${taskCount}개 중 완료 ${completedCount}`
  }, ${expanded ? '접기' : '펼치기'}`

  const header = (
    <>
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

      {/* Badges + actions share this line with the title (reference layout,
          unchanged from ProjectCard). Both sit ABOVE the shared shell's toggle
          button (z-10) so they stay independently clickable — same layering
          trick the old stretched-link version used, just with a real
          <button> underneath instead of a pseudo-element. */}
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
    </>
  )

  const summary = closed ? (
    <div className="mt-2">
      <Badge
        tone="neutral"
        label={project.closedAt ? '기간이 지나 자동 종료됨' : '중지되었던 프로젝트가 종료되었습니다'}
      />
    </div>
  ) : countsLoading ? (
    // First paint before this project's own aggregate query resolves — a
    // determinate "태스크 0 · 완료 0" here would be indistinguishable from a
    // genuinely empty project (the exact complaint this hook exists to fix),
    // so a shimmering placeholder stands in until the real numbers land
    // instead (SYS-03 CLS budget: sized to roughly the text/bar it replaces,
    // so swapping in the real content doesn't jump the row's height).
    <>
      <Skeleton width="9rem" height="0.75rem" className="mt-2" />
      <Skeleton width="100%" height="0.375rem" radius="var(--radius-full)" className="mt-3" />
    </>
  ) : (
    <>
      <p className="mt-2 text-caption text-text-muted">{meta}</p>
      <ProgressBar value={completedCount} max={taskCount} label={`완료 ${completedCount}/${taskCount}`} className="mt-3" />
    </>
  )

  return (
    <AccordionRow
      expanded={expanded}
      onToggle={onToggle}
      ariaLabel={ariaLabel}
      panelId={panelId}
      header={header}
      summary={summary}
      panel={<ProjectExpandedPanel project={project} panelMode={panelMode} onPanelModeChange={onPanelModeChange} />}
    />
  )
}

export default ProjectAccordionRow
