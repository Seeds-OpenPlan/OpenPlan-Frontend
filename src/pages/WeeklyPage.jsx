import { useMemo, useState } from 'react'
import { PlanHeader } from '../components/plan/PlanHeader'
import { WeekNav } from '../components/plan/WeekNav'
import { SummaryBar } from '../components/plan/SummaryBar'
import { CalendarGrid } from '../components/plan/CalendarGrid'
import { UndoRedo } from '../components/plan/UndoRedo'
import { PlanFab } from '../components/plan/PlanFab'
import { BlockActionMenu } from '../components/plan/BlockActionMenu'
import { ReviewPanel } from '../components/plan/ReviewPanel'
import { ErrorState } from '../components/common/ErrorState'
import {
  useAvailability,
  useMoveBlock,
  useSaveAvailability,
  useWeekPlan,
} from '../features/plan/usePlanData'
import {
  usePlanHistory,
  selectCanUndo,
  selectCanRedo,
} from '../features/plan/usePlanHistory'
import { visibleRange } from '../features/plan/planGeometry'
import {
  addWeeksISO,
  composeTimestamp,
  currentWeekStartISO,
  isPastWeek,
  WEEKDAY_KEYS,
  weekDays as weekDaysOf,
} from '../features/plan/planTime'
import { useAppStore, selectCanWrite } from '../store/useAppStore'
import { toast } from '../hooks/useToasts'
import { systemMessages } from '../constants/systemMessages'

// Sum of active availability windows across the week = the "available" total the
// summary bar compares planned time against (PLAN-01).
function availableMinutesOf(availability) {
  return (availability ?? [])
    .filter((a) => a.isActive)
    .reduce((sum, a) => sum + (a.endMinutes - a.startMinutes), 0)
}

/*
  ST-F1-02 orchestrator. Wires the read view (week query + prefetch, summary,
  mode toggle) to the write interactions (drag/keyboard move, undo/redo,
  availability edit) via the feature hooks. Cross-cutting concerns each stay in
  their own module: server state in TanStack Query, undo stack in usePlanHistory,
  drag geometry in usePlanDrag/CalendarGrid.
*/
function WeeklyPage() {
  const [weekStartISO, setWeekStartISO] = useState(() => currentWeekStartISO())
  const [mode, setMode] = useState('focus')
  const [menu, setMenu] = useState({ open: false, block: null, position: null })
  const [reviewOpen, setReviewOpen] = useState(false)

  const planQuery = useWeekPlan(weekStartISO)
  const availQuery = useAvailability()
  const moveBlock = useMoveBlock()
  const saveAvailability = useSaveAvailability()

  const history = usePlanHistory()
  const canUndo = usePlanHistory(selectCanUndo)
  const canRedo = usePlanHistory(selectCanRedo)
  const canWrite = useAppStore(selectCanWrite)

  const plan = planQuery.data
  const availability = useMemo(() => availQuery.data ?? [], [availQuery.data])
  const blocks = plan?.blocks ?? []
  const readOnly = isPastWeek(weekStartISO)

  const days = useMemo(() => weekDaysOf(weekStartISO), [weekStartISO])
  const range = useMemo(() => visibleRange(mode, availability), [mode, availability])
  const availableMinutes = availableMinutesOf(availability)

  // --- move (drag/keyboard) → optimistic PATCH + history --------------------

  // Turn a grid target into absolute timestamps + a target week key.
  const resolveTarget = ({ boundary, dayIndex, startMin, endMin }) => {
    const targetWeek =
      boundary === 'prev'
        ? addWeeksISO(weekStartISO, -1)
        : boundary === 'next'
          ? addWeeksISO(weekStartISO, 1)
          : weekStartISO
    const dayISO = weekDaysOf(targetWeek)[dayIndex]
    return {
      targetWeek,
      startAt: composeTimestamp(dayISO, startMin),
      endAt: composeTimestamp(dayISO, endMin),
    }
  }

  const applyMove = ({ planBlockId, startAt, endAt, sourceWeek, targetWeek }) => {
    moveBlock({ planBlockId, startAt, endAt, sourceWeek, targetWeek })
  }

  // A user-initiated move: commit it AND push an undo entry.
  const handleUserMove = (target) => {
    const block = blocks.find((b) => b.planBlockId === target.planBlockId)
    if (!block) return
    const { targetWeek, startAt, endAt } = resolveTarget(target)
    applyMove({ planBlockId: target.planBlockId, startAt, endAt, sourceWeek: weekStartISO, targetWeek })
    history.record({
      planBlockId: target.planBlockId,
      before: { startAt: block.startAt, endAt: block.endAt, week: weekStartISO },
      after: { startAt, endAt, week: targetWeek },
    })
  }

  const handleUndo = () => {
    const entry = history.undo()
    if (!entry) return
    applyMove({
      planBlockId: entry.planBlockId,
      startAt: entry.before.startAt,
      endAt: entry.before.endAt,
      sourceWeek: entry.after.week,
      targetWeek: entry.before.week,
    })
  }

  const handleRedo = () => {
    const entry = history.redo()
    if (!entry) return
    applyMove({
      planBlockId: entry.planBlockId,
      startAt: entry.after.startAt,
      endAt: entry.after.endAt,
      sourceWeek: entry.before.week,
      targetWeek: entry.after.week,
    })
  }

  // --- availability edge drag (PLAN-32) -------------------------------------

  const handleAvailabilityCommit = (columnIndex, edge, minutes) => {
    const key = WEEKDAY_KEYS[columnIndex]
    const next = availability.map((a) => {
      if (a.weekday !== key) return a
      // Keep start < end with a 5-minute floor between them.
      if (edge === 'start') return { ...a, startMinutes: Math.min(minutes, a.endMinutes - 5) }
      return { ...a, endMinutes: Math.max(minutes, a.startMinutes + 5) }
    })
    saveAvailability.mutate(next)
  }

  // --- save (PLAN-03: this story owns the undo-stack reset) -----------------

  const handleSave = () => {
    // Validation-gated confirm (POST .../confirmation) is ST-F1-05; here the
    // save's ST-F1-02 responsibility is to clear the client undo stack so the
    // plan can no longer be reverted past this point (AC-4).
    history.clear()
    toast({ tone: 'success', message: '주간 계획을 저장했습니다' })
  }

  // --- render ---------------------------------------------------------------

  if (planQuery.isError) {
    return (
      <div className="mx-auto max-w-2xl">
        <ErrorState variant="section" onAction={() => planQuery.refetch()} />
      </div>
    )
  }

  const showColumnSkeleton = planQuery.isLoading || (planQuery.isPlaceholderData && planQuery.isFetching)

  return (
    <div className="flex flex-col gap-4">
      <PlanHeader
        reviewCount={plan?.validation?.warningCount ?? 0}
        onOpenReview={() => setReviewOpen(true)}
        onSave={handleSave}
        saveDisabled={!canWrite}
        saveDisabledReason={systemMessages.offline.disabledReason}
        readOnly={readOnly}
      />

      <section className="relative flex flex-col gap-3 rounded-card border border-border bg-surface p-3 md:p-4">
        <WeekNav
          weekStartISO={weekStartISO}
          onPrev={() => setWeekStartISO((w) => addWeeksISO(w, -1))}
          onNext={() => setWeekStartISO((w) => addWeeksISO(w, 1))}
        />

        <SummaryBar
          usedMinutes={plan?.totalPlannedMinutes ?? 0}
          availableMinutes={availableMinutes}
          mode={mode}
          onModeChange={setMode}
        />

        <div className="relative">
          {showColumnSkeleton && (
            <div
              className="pointer-events-none absolute inset-0 z-40 animate-pulse rounded-card bg-surface/40"
              aria-hidden="true"
            />
          )}
          <CalendarGrid
            weekDays={days}
            range={range}
            mode={mode}
            blocks={blocks}
            availability={availability}
            readOnly={readOnly}
            onMoveCommit={handleUserMove}
            onOpenMenu={(block, position) => setMenu({ open: true, block, position })}
            onAvailabilityCommit={handleAvailabilityCommit}
          />
        </div>

        {/* Floating controls pinned to the card's bottom corners, overlaying the
            grid (design): undo/redo bottom-left, unplaced FAB bottom-right. They
            stay put while the grid scrolls internally. */}
        <div className="pointer-events-none absolute inset-x-4 bottom-4 z-30 flex items-center justify-between md:inset-x-6 md:bottom-6">
          <div className="pointer-events-auto">
            <UndoRedo
              canUndo={canUndo && !readOnly}
              canRedo={canRedo && !readOnly}
              onUndo={handleUndo}
              onRedo={handleRedo}
            />
          </div>
          <div className="pointer-events-auto">
            <PlanFab
              count={plan?.unplacedCount ?? 0}
              onClick={() => {
                /* Unplaced panel (PNL) opens in ST-F1-03. */
              }}
            />
          </div>
        </div>
      </section>

      <BlockActionMenu
        open={menu.open}
        block={menu.block}
        position={menu.position}
        items={[]}
        onClose={() => setMenu({ open: false, block: null, position: null })}
      />

      <ReviewPanel
        open={reviewOpen}
        blockCount={plan?.validation?.blockCount ?? 0}
        warningCount={plan?.validation?.warningCount ?? 0}
        issues={[]}
        onClose={() => setReviewOpen(false)}
      />
    </div>
  )
}

export default WeeklyPage
