import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { BottomSheet } from '../common/BottomSheet'
import { Button } from '../common/Button'
import { ErrorState } from '../common/ErrorState'
import { Skeleton } from '../common/Skeleton'
import { UnplacedTaskCard } from './UnplacedTaskCard'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import { useReducedMotion } from '../../hooks/useReducedMotion'

/*
  Unplaced-task panel (ST-F1-03 PLAN-05). Same content in two shells (§R):
  - mobile  : a modal BottomSheet.
  - desktop : a NON-modal right drawer with no blocking scrim, so the grid stays
    visible and interactive — you drag a task straight out of the panel onto a
    slot (PLAN-06). A modal scrim would make drag-to-grid impossible, so the
    drawer closes only via its ✕ / Esc, never an outside-click backdrop.

  Project filter (AC-4 / PROJ-15/19): the panel accepts a projectId to open
  pre-filtered. The chips are derived from the loaded tasks — the authoritative
  project list arrives with the projects surface (ST-F1-08). Entry FROM a
  project screen (or the dashboard) is wired in WeeklyPage via the
  `?project={id}` / `?openUnplaced=1` URL seams (plan-polish), which seed
  `projectId`/`open` here and then strip themselves from the URL.
*/

const PANEL_TITLE_ID = 'unplaced-panel-title'

function PanelBody({
  tasks,
  isLoading,
  isError,
  onRetry,
  projectId,
  onProjectFilterChange,
  onAutoPlace,
  autoPlacing,
  disabled,
  // plan-polish fix G: `disabled` now covers TWO different reasons (a past
  // week, or an auto-place draft under review), each with its OWN wording —
  // the caller (WeeklyPage, the only place that knows WHICH one applies)
  // passes the right string through here instead of this component guessing.
  disabledReason,
  onTaskPointerDown,
  onQuickPlace,
}) {
  // Chips derive from the FULL list so selecting one project never hides the
  // others; the displayed cards are filtered client-side.
  const projects = useMemo(() => {
    const seen = new Map()
    for (const t of tasks ?? []) {
      if (t.projectId && !seen.has(t.projectId)) seen.set(t.projectId, t.projectName ?? t.projectId)
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }))
  }, [tasks])

  const visibleTasks = useMemo(
    () => (projectId ? (tasks ?? []).filter((t) => t.projectId === projectId) : tasks ?? []),
    [tasks, projectId],
  )

  return (
    // min-h-0 + flex-1 so this fills the panel and the LIST (not the panel)
    // scrolls when the backlog is long — otherwise cards overflow the card edge.
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Project filter — 전체 + one chip per known project. */}
      {(projects.length > 0 || projectId) && (
        <div className="flex shrink-0 flex-wrap gap-1.5" role="group" aria-label="프로젝트 필터">
          <FilterChip active={!projectId} onClick={() => onProjectFilterChange(null)}>
            전체
          </FilterChip>
          {projects.map((p) => (
            <FilterChip
              key={p.id}
              active={projectId === p.id}
              onClick={() => onProjectFilterChange(p.id)}
            >
              {p.name}
            </FilterChip>
          ))}
        </div>
      )}

      <Button
        variant="secondary"
        size="md"
        onClick={onAutoPlace}
        loading={autoPlacing}
        loadingLabel="배치 중"
        disabled={disabled || (tasks?.length ?? 0) === 0}
        disabledReason={disabled ? disabledReason : undefined}
        className="w-full shrink-0"
      >
        자동 배치
      </Button>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isError ? (
          <ErrorState
            variant="section"
            title="미배치 목록을 불러오지 못했습니다"
            onAction={onRetry}
          />
        ) : isLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height="5rem" radius="var(--radius-card)" />
            ))}
          </div>
        ) : visibleTasks.length === 0 ? (
          <p className="rounded-card border border-dashed border-border px-4 py-8 text-center text-label text-text-muted">
            {projectId ? '이 프로젝트의 미배치 태스크가 없습니다' : '미배치 태스크가 없습니다'}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visibleTasks.map((task) => (
              <li key={task.taskId}>
                <UnplacedTaskCard
                  task={task}
                  disabled={disabled}
                  onPointerDown={onTaskPointerDown}
                  onQuickPlace={onQuickPlace}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function FilterChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        // fix J-2: fully rounded (owner decision), not the chip radius token —
        // vertical padding is untouched, only the corner radius changed.
        'rounded-full px-2.5 py-1 text-caption font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
        active
          ? 'bg-brand-600 text-white'
          : 'border border-border bg-surface text-text hover:bg-surface-sunken',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

const PANEL_WIDTH = 344 // px (w ~21.5rem)
// Rightmost edge the drag clamp below allows (its own lower bound on `right`,
// the offset FROM the right edge — smaller means further right). The default
// position lands exactly there so a freshly opened panel never has to be
// dragged out of the way first (plan-polish: it used to sit 24px in, right
// over the auto-place bar's [적용] button).
const RIGHTMOST = 8
// Used only until the FIRST layout measurement lands (WeeklyPage's
// useLayoutEffect fires before paint, so this is normally invisible) — a
// reasonable top absent any measurement at all.
const FALLBACK_TOP = 96

export function UnplacedPanel({
  open,
  onClose,
  count = 0,
  panelRef,
  // plan-polish: viewport-Y landmarks from WeeklyPage — topBound is the grid
  // wrapper's top (right below the auto-place bar when a draft is open, or
  // right below the summary bar otherwise) and heightBound is the distance
  // from there down to the unplaced FAB's bottom. Together they replace the
  // old fixed `top: 96` + `max-h-[72vh]` so the panel's resting position and
  // cap never straddle the FAB or the auto-place bar's own controls.
  topBound,
  heightBound,
  ...bodyProps
}) {
  const isDesktop = useIsDesktop()
  const reducedMotion = useReducedMotion()

  // Desktop panel is a movable floating card (so it never permanently covers the
  // Sunday column). Position is stored as an offset from the top-RIGHT corner so
  // it keeps its distance from the right edge on window resize (never sliding off
  // screen). Remembered across opens; null = default (rightmost, right below the
  // auto-place bar/summary bar) — see RIGHTMOST/topBound above.
  const [pos, setPos] = useState(null)
  const defaultPos = { right: RIGHTMOST, top: topBound ?? FALLBACK_TOP }

  const startPanelDrag = (e) => {
    // Don't start a move when the pointer is on an interactive control (e.g. ✕).
    if (e.target.closest('button')) return
    e.preventDefault()
    const start = { x: e.clientX, y: e.clientY }
    const base = pos ?? defaultPos
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v))
    const move = (ev) => {
      setPos({
        // Dragging right REDUCES the right-offset; clamp so it stays on screen.
        right: clamp(base.right - (ev.clientX - start.x), 8, window.innerWidth - PANEL_WIDTH - 8),
        top: clamp(base.top + (ev.clientY - start.y), 8, window.innerHeight - 80),
      })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // Esc closes the (non-modal) desktop panel too. The BottomSheet handles its
  // own Esc, so only wire this for the desktop shell.
  useEffect(() => {
    if (!open || !isDesktop) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, isDesktop, onClose])

  const header = (
    <div className="flex items-center justify-between">
      <h2 id={PANEL_TITLE_ID} className="text-title font-semibold text-text">
        미배치 태스크 <span className="text-text-muted">{count}</span>
      </h2>
      <button
        type="button"
        onClick={onClose}
        aria-label="미배치 패널 닫기"
        className="flex h-10 w-10 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <span aria-hidden="true" className="text-lg">✕</span>
      </button>
    </div>
  )

  if (!isDesktop) {
    if (!open) return null
    return (
      <BottomSheet open={open} onClose={onClose} labelledById={PANEL_TITLE_ID}>
        {/* Compact on mobile so it doesn't swallow the screen — the list scrolls. */}
        <div className="flex max-h-[55vh] flex-col gap-3">
          {header}
          <PanelBody {...bodyProps} />
        </div>
      </BottomSheet>
    )
  }

  // Desktop panel is ALWAYS mounted so open/close can animate. It stays at its
  // resting position (right/top offset) and animates IN PLACE — a fade + subtle
  // scale from the top-right corner — rather than sliding across the screen (which
  // read as a wrong position + a close flicker). When closed it's transparent,
  // non-interactive, and inert (unfocusable).
  const p = pos ?? defaultPos
  const panelStyle = {
    width: PANEL_WIDTH,
    // Inline color-mix guarantees a visible translucency regardless of how the
    // Tailwind opacity modifier resolves the surface CSS variable.
    backgroundColor: 'color-mix(in srgb, var(--color-surface) 78%, transparent)',
    // Anchored by right/top offset so resizing the window keeps the panel the
    // same distance from the right edge (it never slides off screen).
    right: p.right,
    top: p.top,
    // A real pixel cap between the two layout landmarks (see the topBound/
    // heightBound doc above) instead of a vh-relative guess, so the panel can
    // never grow past the unplaced FAB. Falls back to the old vh figure only
    // for the instant before WeeklyPage's first measurement lands.
    maxHeight: heightBound ?? '72vh',
    transformOrigin: 'top right',
    transform: open ? 'scale(1)' : 'scale(0.97)',
    opacity: open ? 1 : 0,
    pointerEvents: open ? undefined : 'none',
    // Transition ONLY opacity/transform — never right/top — so dragging the panel
    // stays instant (a transition on position would lag the drag).
    transition: reducedMotion ? 'none' : 'opacity 180ms ease-out, transform 180ms ease-out',
  }
  return createPortal(
    <aside
      ref={panelRef}
      aria-labelledby={PANEL_TITLE_ID}
      aria-hidden={!open}
      // inert (React 19) blocks focus/interaction while closed.
      {...(open ? {} : { inert: '' })}
      style={panelStyle}
      className="fixed z-40 flex flex-col gap-3 rounded-card border border-border p-4 shadow-modal backdrop-blur-md"
    >
      {/* Header doubles as the drag handle (cursor-move); the ✕ button opts out of
          the move via the closest('button') guard in startPanelDrag. */}
      <div
        onPointerDown={startPanelDrag}
        className="flex shrink-0 touch-none cursor-move items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-text-muted">⠿</span>
          <h2 id={PANEL_TITLE_ID} className="text-title font-semibold text-text">
            미배치 태스크 <span className="text-text-muted">{count}</span>
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="미배치 패널 닫기"
          className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <span aria-hidden="true" className="text-lg">✕</span>
        </button>
      </div>
      <PanelBody {...bodyProps} />
    </aside>,
    document.body,
  )
}

export default UnplacedPanel
