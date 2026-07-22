import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { BottomSheet } from '../common/BottomSheet'
import { Button } from '../common/Button'
import { ErrorState } from '../common/ErrorState'
import { Skeleton } from '../common/Skeleton'
import { UnplacedTaskCard } from './UnplacedTaskCard'
import { useIsDesktop } from '../../hooks/useMediaQuery'

/*
  Unplaced-task panel (ST-F1-03 PLAN-05). Same content in two shells (§R):
  - mobile  : a modal BottomSheet.
  - desktop : a NON-modal right drawer with no blocking scrim, so the grid stays
    visible and interactive — you drag a task straight out of the panel onto a
    slot (PLAN-06). A modal scrim would make drag-to-grid impossible, so the
    drawer closes only via its ✕ / Esc, never an outside-click backdrop.

  Project filter (AC-4 / PROJ-15/19): the panel accepts a projectId to open
  pre-filtered. The chips are derived from the loaded tasks — the authoritative
  project list arrives with the projects surface (ST-F1-08); entry FROM a project
  screen is that story's seam.
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
  onTaskPointerDown,
  onQuickPlace,
}) {
  const projects = useMemo(() => {
    const seen = new Map()
    for (const t of tasks ?? []) {
      if (t.projectId && !seen.has(t.projectId)) seen.set(t.projectId, t.projectName ?? t.projectId)
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }))
  }, [tasks])

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Project filter — 전체 + one chip per known project. */}
      {(projects.length > 0 || projectId) && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="프로젝트 필터">
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
        disabledReason={disabled ? '지난 주는 편집할 수 없습니다' : undefined}
        className="w-full"
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
        ) : (tasks?.length ?? 0) === 0 ? (
          <p className="rounded-card border border-dashed border-border px-4 py-8 text-center text-label text-text-muted">
            미배치 태스크가 없습니다
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tasks.map((task) => (
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
        'rounded-chip px-2.5 py-1 text-caption font-medium transition-colors',
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

export function UnplacedPanel({ open, onClose, count = 0, ...bodyProps }) {
  const isDesktop = useIsDesktop()

  // Esc closes the (non-modal) desktop drawer too. The BottomSheet handles its
  // own Esc, so only wire this for the desktop shell.
  useEffect(() => {
    if (!open || !isDesktop) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, isDesktop, onClose])

  if (!open) return null

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
    return (
      <BottomSheet open={open} onClose={onClose} labelledById={PANEL_TITLE_ID}>
        <div className="flex max-h-[70vh] flex-col gap-4">
          {header}
          <PanelBody {...bodyProps} />
        </div>
      </BottomSheet>
    )
  }

  return createPortal(
    <aside
      aria-labelledby={PANEL_TITLE_ID}
      className="fixed inset-y-0 right-0 z-40 flex w-96 max-w-[90vw] flex-col gap-4 border-l border-border bg-surface p-5 shadow-modal"
    >
      {header}
      <PanelBody {...bodyProps} />
    </aside>,
    document.body,
  )
}

export default UnplacedPanel
