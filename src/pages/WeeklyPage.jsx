import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { PlanHeader } from '../components/plan/PlanHeader'
import { WeekNav } from '../components/plan/WeekNav'
import { SummaryBar } from '../components/plan/SummaryBar'
import { CalendarGrid } from '../components/plan/CalendarGrid'
import { UndoRedo } from '../components/plan/UndoRedo'
import { PlanFab } from '../components/plan/PlanFab'
import { BlockActionMenu } from '../components/plan/BlockActionMenu'
import { ReviewPanel } from '../components/plan/ReviewPanel'
import { UnplacedPanel } from '../components/plan/UnplacedPanel'
import { AutoPlaceBar } from '../components/plan/AutoPlaceBar'
import { ScheduleForm } from '../components/plan/ScheduleForm'
import { ExecutionLogForm } from '../components/plan/ExecutionLogForm'
import { SaveConfirmDialog } from '../components/plan/SaveConfirmDialog'
import { ErrorState } from '../components/common/ErrorState'
import {
  useApplyAutoPlace,
  useAutoPlace,
  useAvailability,
  useCreateScheduleBlock,
  useLogExecution,
  useMoveBlock,
  usePlaceTask,
  usePlanValidation,
  useRemoveBlockWithUndo,
  useResizeBlock,
  useSaveAvailability,
  useSaveWeek,
  useSetBlockComplete,
  useUnplacedTasks,
  useUpdateSchedule,
  useWeekPlan,
} from '../features/plan/usePlanData'
import { severityLabels } from '../features/plan/violationMessages'
import {
  usePlanHistory,
  selectCanUndo,
  selectCanRedo,
} from '../features/plan/usePlanHistory'
import { usePlacementDrag } from '../features/plan/usePlacementDrag'
import { resolveGridSlot, visibleRange } from '../features/plan/planGeometry'
import { findFirstFreeSlot } from '../features/plan/planPlacement'
import { getPopoverAnchorStyle } from '../utils/popoverPosition'
import {
  addWeeksISO,
  composeTimestamp,
  currentWeekStartISO,
  dateOf,
  isPastWeek,
  MINUTES_PER_DAY,
  minutesOfDay,
  WEEKDAY_KEYS,
  weekDays as weekDaysOf,
} from '../features/plan/planTime'
import { useAppStore, selectCanWrite } from '../store/useAppStore'
import { toast } from '../hooks/useToasts'
import { systemMessages } from '../constants/systemMessages'

// How long the PLAN-23 highlight stays on a block: two pulses of --duration-slow
// (320ms) plus a beat, so the ring is gone shortly after the animation ends
// instead of lingering as a permanent marker.
const FOCUS_HIGHLIGHT_MS = 900

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

  // ST-F1-03: unplaced panel + auto-place draft + empty-slot task picker.
  const [panelOpen, setPanelOpen] = useState(false)
  const [projectFilter, setProjectFilter] = useState(null)
  const [autoDraft, setAutoDraft] = useState(null) // { placements, unplaced } | null
  const [slotMenu, setSlotMenu] = useState(null) // { point, slot } | null

  // ST-F1-04 Phase 2: schedule form (create/edit) + execution log.
  const [scheduleForm, setScheduleForm] = useState(null) // { mode, block?, slot? } | null
  const [execLog, setExecLog] = useState(null) // { block } | null

  // ST-F1-05: the block PLAN-23 asked to focus, and the warnings-only save confirm.
  const [focusRequest, setFocusRequest] = useState(null) // { planBlockId, token } | null
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false)

  const gridBodyRef = useRef(null)
  const unplacedPanelRef = useRef(null)
  // Pending "take the highlight back down" timer (PLAN-23); see handleSelectIssue.
  const focusClearTimerRef = useRef(null)

  // Don't let that timer fire into an unmounted page.
  useEffect(() => () => clearTimeout(focusClearTimerRef.current), [])

  const planQuery = useWeekPlan(weekStartISO)
  const availQuery = useAvailability()
  const moveBlock = useMoveBlock()
  const saveAvailability = useSaveAvailability()
  // Fetch the FULL backlog (no server projectId filter); the panel filters by
  // project CLIENT-SIDE so every project chip stays visible even while one is
  // selected. (PROJ-15/19 entry just preselects projectFilter — same list.)
  const unplacedQuery = useUnplacedTasks()
  const placeTask = usePlaceTask()
  const autoPlace = useAutoPlace()
  const applyAutoPlace = useApplyAutoPlace()
  const setBlockComplete = useSetBlockComplete()
  const removeBlock = useRemoveBlockWithUndo()
  const resizeBlock = useResizeBlock()
  const logExecution = useLogExecution()
  const createSchedule = useCreateScheduleBlock()
  const updateSchedule = useUpdateSchedule()
  const saveWeekPlan = useSaveWeek()
  const navigate = useNavigate()

  const history = usePlanHistory()
  const canUndo = usePlanHistory(selectCanUndo)
  const canRedo = usePlanHistory(selectCanRedo)
  const canWrite = useAppStore(selectCanWrite)

  const plan = planQuery.data
  const availability = useMemo(() => availQuery.data ?? [], [availQuery.data])
  // Memoized because the validation loop debounces on this array's IDENTITY: an
  // inline `plan?.blocks ?? []` would be a new array every render and would keep
  // rescheduling the debounce forever (see usePlanValidation).
  const blocks = useMemo(() => plan?.blocks ?? [], [plan])
  const readOnly = isPastWeek(weekStartISO)
  // Badge count = the unplaced LIST length (single source), not the per-week
  // plan.unplacedCount (which is cached per week and can go stale — Thomas HIGH).
  const unplacedCount = unplacedQuery.data?.length ?? 0

  const days = useMemo(() => weekDaysOf(weekStartISO), [weekStartISO])
  const range = useMemo(() => visibleRange(mode, availability), [mode, availability])
  const availableMinutes = availableMinutesOf(availability)

  // --- validation (ST-F1-05: PLAN-21~28) ------------------------------------

  // A past week is read-only, so there is nothing to validate and nothing to save.
  const validation = usePlanValidation({
    weeklyPlanId: plan?.weeklyPlanId,
    blocks,
    enabled: !readOnly,
  })

  // Until the first dry-run answers, fall back to the counts the week payload
  // carries. Showing "0 위반" for the ~400ms before the first result would be a
  // brief lie in exactly the direction that matters (it implies "safe to save").
  const blockingCount = validation.hasResult
    ? validation.blockingCount
    : (plan?.validation?.blockCount ?? 0)
  const warningCount = validation.hasResult
    ? validation.warningCount
    : (plan?.validation?.warningCount ?? 0)

  /*
    Layer 1 input: the worst severity per block plus how many issues it carries.
    One block can appear in several issues (an overlap that is ALSO outside the
    availability window), and the block only has room for one chip — 차단 wins,
    and the count tells the user there is more to read in the panel.
  */
  const violationsByBlockId = useMemo(() => {
    const marks = {}
    for (const issue of validation.issues) {
      for (const blockId of issue.targetBlockIds) {
        const existing = marks[blockId]
        if (!existing) {
          marks[blockId] = {
            severity: issue.severity,
            label: severityLabels[issue.severity],
            count: 1,
          }
          continue
        }
        existing.count += 1
        if (issue.severity === 'blocking' && existing.severity !== 'blocking') {
          existing.severity = 'blocking'
          existing.label = severityLabels.blocking
        }
      }
    }
    return marks
  }, [validation.issues])

  const warningIssues = useMemo(
    () => validation.issues.filter((i) => i.severity !== 'blocking'),
    [validation.issues],
  )

  /*
    PLAN-23. The panel names a target; the block does the scrolling and focusing
    (only it knows its DOM node). The panel is CLOSED first on every breakpoint,
    not just mobile: both shells are focus-trapped modals, so leaving it open
    would either swallow the focus move or leave focus inside an overlay covering
    the block the user just asked to see.
  */
  const handleSelectIssue = (issue) => {
    const target = blocks.find((b) => issue.targetBlockIds.includes(b.planBlockId))
    setReviewOpen(false)
    if (!target) {
      toast({ tone: 'info', message: '이 항목의 대상 블록을 찾을 수 없습니다' })
      return
    }

    // A 가용 시간 밖 block (V5) is, by definition, often outside what focus mode
    // renders — scrolling to a block that isn't in the DOM looks like the panel
    // did nothing. Widen to 24h first so there is something to scroll to.
    const startMin = minutesOfDay(target.startAt)
    const endMin = minutesOfDay(target.endAt)
    if (startMin < range.startMinutes || endMin > range.endMinutes) setMode('24h')

    // A counter, not the id: re-selecting the SAME block must retrigger the
    // scroll/focus/pulse, which only a changed value can do.
    setFocusRequest((prev) => ({ planBlockId: target.planBlockId, token: (prev?.token ?? 0) + 1 }))

    // The highlight is an ANNOUNCEMENT, not a selection state, so it has to be
    // taken back down: the ring is rendered as long as focusRequest names this
    // block, and a CSS animation reverts to its base style when it ends rather
    // than staying at its final keyframe. Clearing here covers both the animated
    // and the reduced-motion (static ring) paths with one rule.
    clearTimeout(focusClearTimerRef.current)
    focusClearTimerRef.current = setTimeout(() => setFocusRequest(null), FOCUS_HIGHLIGHT_MS)
  }

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
      type: 'move',
      planBlockId: target.planBlockId,
      before: { startAt: block.startAt, endAt: block.endAt, week: weekStartISO },
      after: { startAt, endAt, week: targetWeek },
    })
  }

  // The stack now holds two entry shapes (a 'move' generalization — see
  // usePlanHistory's header): 'move' entries are replayed here through the same
  // optimistic PATCH a drag uses; 'remove' entries (unplace/delete) already carry
  // their own undo/redo closures from useRemoveBlockWithUndo, so we just call them.
  const handleUndo = () => {
    const entry = history.undo()
    if (!entry) return
    if (entry.type === 'remove') {
      entry.undo()
      return
    }
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
    if (entry.type === 'remove') {
      entry.redo()
      return
    }
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

  // --- task placement (ST-F1-03: PLAN-06 drag / PLAN-07 right-click / auto) --

  // Place one task into a resolved grid slot; span = the task's estimated
  // duration, clamped to the end of the day. Optimistic (usePlaceTask).
  const placeTaskAt = (task, slot) => {
    if (!plan || readOnly) return
    const duration = task.estimatedMinutes ?? 60
    let startMin = slot.startMin
    let endMin = startMin + duration
    if (endMin > MINUTES_PER_DAY) {
      endMin = MINUTES_PER_DAY
      startMin = endMin - duration
    }
    const dayISO = days[slot.dayIndex]
    placeTask({
      weeklyPlanId: plan.weeklyPlanId,
      weekStartISO,
      task,
      startAt: composeTimestamp(dayISO, startMin),
      endAt: composeTimestamp(dayISO, endMin),
    })
    // If an auto-place draft still proposes this task, drop it — applying the
    // draft later must not re-place a task the user just placed by hand.
    if (autoDraft) {
      setAutoDraft((d) =>
        d
          ? {
              placements: d.placements.filter((p) => p.taskId !== task.taskId),
              unplaced: d.unplaced.filter((t) => t.taskId !== task.taskId),
            }
          : d,
      )
    }
    setSlotMenu(null)
  }

  // Panel→grid drag: the hook hit-tests the live pointer via resolveSlot (in its
  // pointer handlers, where reading the grid ref is allowed) and hands the drop
  // slot to onDrop; an off-grid release (null) is ignored.
  const placementDrag = usePlacementDrag({
    resolveSlot: (point) => {
      const el = gridBodyRef.current
      return el ? resolveGridSlot(point, el.getBoundingClientRect(), range) : null
    },
    onDrop: (task, slot) => {
      if (slot) placeTaskAt(task, slot)
    },
  })

  // Keyboard "quick place": drop the task in the first free slot of the week.
  const quickPlace = (task) => {
    const slot = findFirstFreeSlot({
      days,
      availability,
      blocks,
      durationMin: task.estimatedMinutes ?? 60,
    })
    if (slot) placeTaskAt(task, slot)
    else toast({ tone: 'info', message: '이번 주에 배치할 빈 시간이 부족합니다' })
  }

  // Right-click an empty slot → open a small picker of unplaced tasks (PLAN-07).
  const handleEmptySlot = (point, slot) => {
    const tasks = unplacedQuery.data ?? []
    if (tasks.length === 0) {
      toast({ tone: 'info', message: '배치할 미배치 태스크가 없습니다' })
      return
    }
    setSlotMenu({ point, slot })
  }

  // Auto placement (RB-PLAN-01): announce progress, then hold the returned draft
  // as an overlay until the user applies or cancels it.
  const handleAutoPlace = () => {
    if (!plan) return
    toast({ tone: 'info', message: '우선순위·마감일 순으로 배치 중입니다…' })
    autoPlace.mutate(
      { weeklyPlanId: plan.weeklyPlanId, priorityType: 'DEADLINE_FIRST' },
      { onSuccess: (result) => setAutoDraft(result) },
    )
  }

  const applyDraft = () => {
    if (!plan || !autoDraft) return
    applyAutoPlace.mutate(
      { weeklyPlanId: plan.weeklyPlanId, weekStartISO, placements: autoDraft.placements },
      {
        onSuccess: () => {
          setAutoDraft(null)
          toast({ tone: 'success', message: '초안을 적용했습니다. 확정하려면 저장하세요' })
        },
      },
    )
  }

  const cancelDraft = () => setAutoDraft(null)

  // Changing week invalidates a week-specific draft / open slot picker.
  const goToWeek = (delta) => {
    setWeekStartISO((w) => addWeeksISO(w, delta))
    setAutoDraft(null)
    setSlotMenu(null)
  }

  const goToThisWeek = () => {
    setWeekStartISO(currentWeekStartISO())
    setAutoDraft(null)
    setSlotMenu(null)
  }

  // --- block resize (ST-F1-04 A2 + A4) --------------------------------------

  // A block's edge-drag lands here as a target slot; commit new start/end times.
  // Shrinking a TASK block frees remainder time back to the unplaced panel (A4).
  const handleResizeCommit = (block, { dayIndex, startMin, endMin }) => {
    if (readOnly) return
    const dayISO = days[dayIndex]
    resizeBlock({
      weekStartISO,
      planBlockId: block.planBlockId,
      blockType: block.blockType,
      startAt: composeTimestamp(dayISO, startMin),
      endAt: composeTimestamp(dayISO, endMin),
    })
  }

  // A3: dropping a TASK block over the (open) unplaced panel unplaces it instead
  // of moving. Returns true when consumed so usePlanDrag skips the move commit.
  const handleBlockDropOutside = (planBlockId, point) => {
    if (!panelOpen || !plan) return false
    const el = unplacedPanelRef.current
    if (!el) return false
    const r = el.getBoundingClientRect()
    const inPanel =
      point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom
    if (!inPanel) return false
    const block = blocks.find((b) => b.planBlockId === planBlockId)
    if (!block || block.blockType !== 'TASK') return false // schedules delete, not unplace
    handleRemoveBlock(block, 'unplace')
    return true
  }

  // --- block action menu (ST-F1-04: PLAN-13/14 · 16 · 18) -------------------

  // A user-initiated removal (unplace/delete): commit it via the shared removal
  // path AND push an undo entry, mirroring handleUserMove's move+record pairing.
  // `history.claim` is threaded into removeBlock so its "실행 취소" toast and this
  // entry's ↶/↷ can never both invert the same removal (see usePlanData's doc).
  const handleRemoveBlock = (block, mode) => {
    const entry = removeBlock({
      weekStartISO,
      weeklyPlanId: plan?.weeklyPlanId,
      block,
      mode,
      claim: history.claim,
    })
    history.record(entry)
  }

  // Open the edit form for a schedule block, prefilled from its (denormalized) data.
  const openScheduleEdit = (block) => {
    const startMin = minutesOfDay(block.startAt)
    const endMin = minutesOfDay(block.endAt)
    setScheduleForm({
      mode: 'edit',
      block,
      initial: {
        title: block.title,
        dayISO: dateOf(block.startAt),
        startMin,
        endMin,
        estimatedMinutes: block.estimatedMinutes ?? endMin - startMin,
        priority: block.priority ?? 2,
        memo: block.memo ?? '',
      },
    })
  }

  // Menu items per block type (AC-1). Delete/unplace are soft — a "실행 취소" toast
  // defers the server op (no confirm dialog). 태스크 편집/프로젝트에서 보기 navigate
  // to screens that land in ST-F1-09/08 (route seams).
  const menuItemsFor = (block) => {
    if (!block || readOnly) return []
    if (block.blockType === 'SCHEDULE') {
      return [
        { key: 'edit', label: '일정 편집', onSelect: () => openScheduleEdit(block) },
        {
          key: 'delete',
          label: '일정 삭제',
          tone: 'danger',
          onSelect: () => handleRemoveBlock(block, 'delete'),
        },
      ]
    }
    // TASK block
    const done = block.status === 'COMPLETED'
    const items = [
      {
        key: 'complete',
        label: done ? '미완료로 되돌리기' : '완료로 표시',
        onSelect: () =>
          setBlockComplete({ weekStartISO, taskId: block.taskId, complete: !done }),
      },
      { key: 'log', label: '실제 시간 기록', onSelect: () => setExecLog({ block }) },
      { key: 'edit', label: '태스크 편집', onSelect: () => navigate(`/tasks/${block.taskId}/edit`) },
    ]
    if (block.projectId) {
      items.push({
        key: 'project',
        label: '프로젝트에서 보기',
        onSelect: () => navigate(`/projects/${block.projectId}`),
      })
    }
    items.push({
      key: 'unplace',
      label: '배치 해제',
      onSelect: () => handleRemoveBlock(block, 'unplace'),
    })
    return items
  }

  // --- schedule create/edit + execution log (ST-F1-04 Phase 2) --------------

  // Right-clicked empty slot → open the create form seeded from that slot (PLAN-08).
  const openScheduleCreate = (slot) => {
    setSlotMenu(null)
    const startMin = slot.startMin
    setScheduleForm({
      mode: 'create',
      initial: {
        title: '',
        dayISO: days[slot.dayIndex],
        startMin,
        endMin: Math.min(startMin + 60, MINUTES_PER_DAY),
        estimatedMinutes: 60,
        priority: 2,
        memo: '',
      },
    })
  }

  const submitSchedule = (payload) => {
    if (!plan) return
    if (scheduleForm?.mode === 'create') {
      createSchedule.mutate(
        {
          weeklyPlanId: plan.weeklyPlanId,
          weekStartISO,
          body: { blockType: 'SCHEDULE', status: 'SCHEDULED', ...payload },
        },
        { onSuccess: () => setScheduleForm(null) },
      )
    } else if (scheduleForm?.block) {
      updateSchedule.mutate(
        { scheduleId: scheduleForm.block.scheduleId, weekStartISO, patch: payload },
        { onSuccess: () => setScheduleForm(null) },
      )
    }
  }

  const submitExecLog = ({ actualMinutes, memo }) => {
    if (!execLog) return
    const { block } = execLog
    const endedAt = new Date(
      new Date(block.startAt).getTime() + actualMinutes * 60000,
    ).toISOString()
    logExecution.mutate(
      { taskId: block.taskId, body: { startedAt: block.startAt, endedAt, actualMinutes, memo } },
      { onSuccess: () => setExecLog(null) },
    )
  }

  // --- save (PLAN-03 · PLAN-28: the validation-gated confirm) ----------------

  /*
    The gate has three outcomes, decided by the CURRENT dry-run result:
      차단 > 0   → the save button is disabled (PlanHeader owns that, with the
                   reason as adjacent text); this handler is unreachable.
      경고 only  → a confirm dialog, because the plan is savable but imperfect.
      깨끗함     → save immediately; asking would be a pointless click.
  */
  const handleSaveClick = () => {
    // `validation.stale` is not belt-and-braces: the button is disabled in the
    // same conditions, but this handler is also the one path a stray Enter or a
    // stale click can still reach, and confirming a plan nobody checked is the
    // exact failure this gate exists to prevent.
    if (!plan || !canWrite || blockingCount > 0 || validation.stale) return
    if (warningCount > 0) {
      setConfirmSaveOpen(true)
      return
    }
    commitSave()
  }

  /*
    PUT status:"CONFIRMED". Two things happen only on SUCCESS: the undo stack is
    cleared (PLAN-03 — a confirmed week is the new floor, nothing may be undone
    past it) and the week is refetched, since confirming can change server-side
    fields we don't model locally.
  */
  const commitSave = () => {
    if (!plan) return
    saveWeekPlan.mutate(
      {
        weeklyPlanId: plan.weeklyPlanId,
        weekStartISO,
        weekStartDate: plan.weekStartDate,
        weekEndDate: plan.weekEndDate,
        totalPlannedMinutes: plan.totalPlannedMinutes ?? 0,
      },
      {
        onSuccess: () => {
          setConfirmSaveOpen(false)
          history.clear()
        },
        onError: (error) => {
          setConfirmSaveOpen(false)
          handleSaveError(error)
        },
      },
    )
  }

  /*
    AC-4 — the confirm race. A 409 means someone (another tab/device) confirmed a
    newer version of this week first, so what we validated is no longer what the
    server holds. The panel is re-synced from the error's own `details.issues`
    when it carries them, and from a forced dry-run when it doesn't; the week is
    refetched either way, so the grid, the counts and the save gate all end up
    describing the CURRENT server state rather than the one we submitted.

    The save button goes back to DISABLED immediately and without a dedicated
    conflict flag: both branches below make `validation.stale` true — adopted
    server issues are stamped as not-ours, and the forced dry-run is in flight —
    so the gate is shut the moment the 409 lands, not a round trip later. It
    reopens only once a fresh dry-run vouches for the refreshed plan.

    The dry-run is forced in BOTH branches on purpose: TanStack's structural
    sharing can hand back the identical blocks array after the refetch, which
    would leave the debounce loop with nothing to react to and the gate shut
    forever.

    Nor is OVL-CONFLICT shown here — that overlay is not mounted by any screen yet
    (errorRouting.js only catalogs the routing), so an in-panel refresh plus one
    toast is the whole surface, with no duplicate conflict UI to collide with.
  */
  const handleSaveError = (error) => {
    // Match the CODE first and fall back to the status: `E-PLAN-004` is the
    // confirm race specifically, while a bare 409 on this endpoint could be any
    // optimistic-lock rejection — telling the user "다른 곳에서 먼저 저장되었습니다"
    // about an unrelated conflict would be a confident, wrong explanation.
    const isConfirmRace = error?.code === 'E-PLAN-004' || error?.status === 409
    if (isConfirmRace) {
      const serverIssues = error?.details?.issues
      if (Array.isArray(serverIssues)) validation.applyServerIssues(serverIssues)
      validation.revalidate(blocks)
      planQuery.refetch()
      toast({
        tone: 'error',
        message: '이 주간 계획이 다른 곳에서 먼저 저장되었습니다. 검토 항목을 다시 확인해 주세요',
      })
      return
    }
    toast({ tone: 'error', message: systemMessages.error.writeTitle })
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
        blockingCount={blockingCount}
        warningCount={warningCount}
        validationStale={validation.stale}
        validationDelayed={validation.delayed}
        onOpenReview={() => setReviewOpen(true)}
        onSave={handleSaveClick}
        saving={saveWeekPlan.isPending}
        canWrite={canWrite}
        offlineReason={systemMessages.offline.disabledReason}
        readOnly={readOnly}
      />

      <section className="relative flex flex-col gap-3 rounded-card border border-border bg-surface p-3 md:p-4">
        <WeekNav
          weekStartISO={weekStartISO}
          isCurrentWeek={weekStartISO === currentWeekStartISO()}
          onPrev={() => goToWeek(-1)}
          onNext={() => goToWeek(1)}
          onToday={goToThisWeek}
        />

        <SummaryBar
          usedMinutes={plan?.totalPlannedMinutes ?? 0}
          availableMinutes={availableMinutes}
          mode={mode}
          onModeChange={setMode}
        />

        {autoDraft && (
          <AutoPlaceBar
            placedCount={autoDraft.placements.length}
            unplacedCount={autoDraft.unplaced.length}
            applying={applyAutoPlace.isPending}
            onApply={applyDraft}
            onCancel={cancelDraft}
          />
        )}

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
            bodyRef={gridBodyRef}
            placement={placementDrag.drag}
            draftBlocks={autoDraft?.placements ?? null}
            onEmptySlot={handleEmptySlot}
            onResizeCommit={handleResizeCommit}
            onBlockDropOutside={handleBlockDropOutside}
            violationsByBlockId={violationsByBlockId}
            focusRequest={focusRequest}
            // Shrink the grid by ~the draft bar's height while it's shown, so the
            // bar never adds net page height (no new scroll).
            bodyMaxHeight={autoDraft ? 'calc(62vh - 5rem)' : '62vh'}
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
          {/* FAB hides while the panel is open; reappears on close. */}
          <div className="pointer-events-auto">
            {!panelOpen && (
              <PlanFab count={unplacedCount} onClick={() => setPanelOpen(true)} />
            )}
          </div>
        </div>
      </section>

      <BlockActionMenu
        open={menu.open}
        block={menu.block}
        position={menu.position}
        items={menuItemsFor(menu.block)}
        onClose={() => setMenu({ open: false, block: null, position: null })}
      />

      {/* Schedule create/edit (PLAN-08/17) — keyed so it mounts fresh per open. */}
      {scheduleForm && (
        <ScheduleForm
          key={scheduleForm.mode + (scheduleForm.block?.planBlockId ?? 'new')}
          mode={scheduleForm.mode}
          initial={scheduleForm.initial}
          onClose={() => setScheduleForm(null)}
          onSubmit={submitSchedule}
          submitting={createSchedule.isPending || updateSchedule.isPending}
        />
      )}

      {/* Actual-time log (PLAN-15). */}
      {execLog && (
        <ExecutionLogForm
          key={execLog.block.planBlockId}
          block={execLog.block}
          onClose={() => setExecLog(null)}
          onSubmit={submitExecLog}
          submitting={logExecution.isPending}
        />
      )}

      <ReviewPanel
        open={reviewOpen}
        blockingCount={blockingCount}
        warningCount={warningCount}
        issues={validation.issues}
        delayed={validation.delayed}
        onSelectIssue={handleSelectIssue}
        onClose={() => setReviewOpen(false)}
      />

      {/* Warnings-only save confirmation (PLAN-28). 차단 never gets here — the
          save button is disabled while any remains. */}
      <SaveConfirmDialog
        open={confirmSaveOpen}
        warningCount={warningCount}
        warnings={warningIssues}
        saving={saveWeekPlan.isPending}
        onConfirm={commitSave}
        onCancel={() => setConfirmSaveOpen(false)}
      />

      <UnplacedPanel
        open={panelOpen}
        panelRef={unplacedPanelRef}
        onClose={() => setPanelOpen(false)}
        count={unplacedCount}
        tasks={unplacedQuery.data ?? []}
        isLoading={unplacedQuery.isLoading}
        isError={unplacedQuery.isError}
        onRetry={() => unplacedQuery.refetch()}
        projectId={projectFilter}
        onProjectFilterChange={setProjectFilter}
        onAutoPlace={handleAutoPlace}
        autoPlacing={autoPlace.isPending}
        disabled={readOnly}
        onTaskPointerDown={placementDrag.begin}
        onQuickPlace={quickPlace}
      />

      {/* Empty-slot task picker (PLAN-07). Desktop right-click only; a backdrop
          closes it on outside click. */}
      {slotMenu &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onPointerDown={() => setSlotMenu(null)} aria-hidden="true" />
            <div
              role="menu"
              aria-label="여기에 배치할 태스크 선택"
              // Same cursor-flip anchoring as BlockActionMenu — a fixed clamp
              // assumed a max popover size and clipped once the task list grew.
              style={getPopoverAnchorStyle(slotMenu.point)}
              className="fixed z-50 max-h-64 w-60 overflow-y-auto rounded-card border border-border bg-surface py-1 shadow-popover"
            >
              <p className="px-3 py-2 text-caption font-medium text-text-muted">여기에 배치</p>
              <div className="h-px bg-border" />
              <button
                type="button"
                onClick={() => openScheduleCreate(slotMenu.slot)}
                className="flex w-full items-center px-3 py-2 text-left text-label font-medium text-brand-700 transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none"
              >
                + 새 일정 만들기
              </button>
              <div className="h-px bg-border" />
              <ul>
                {(unplacedQuery.data ?? []).map((task) => (
                  <li key={task.taskId}>
                    <button
                      type="button"
                      onClick={() => placeTaskAt(task, slotMenu.slot)}
                      className="flex w-full flex-col items-start px-3 py-2 text-left transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none"
                    >
                      <span className="text-label font-medium text-text line-clamp-1">{task.title}</span>
                      <span className="text-caption text-text-muted">
                        예상 {Math.round((task.estimatedMinutes ?? 60))}분
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>,
          document.body,
        )}

      {/* Floating ghost following the cursor while dragging a task from the panel. */}
      {placementDrag.drag &&
        createPortal(
          <div
            aria-hidden="true"
            style={{ left: placementDrag.drag.point.x + 12, top: placementDrag.drag.point.y + 12 }}
            className="pointer-events-none fixed z-[60] max-w-48 rounded-control border border-brand-400 bg-brand-50 px-2.5 py-1.5 text-caption font-medium text-brand-900 shadow-popover"
          >
            <span className="line-clamp-1">{placementDrag.drag.task.title}</span>
          </div>,
          document.body,
        )}
    </div>
  )
}

export default WeeklyPage
