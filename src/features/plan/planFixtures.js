/*
  DEV-ONLY in-memory mock backend for the weekly plan (ST-F1-02).

  Why this exists: the real contract is the backend Swagger (BE-1), not yet
  running. Rather than branch the OP functions, planApi.js calls the real
  endpoints and — only in DEV, only on a network error — delegates here, exactly
  like sessionGuardLoader already does for /auth/session. When a real or Swagger
  mock server is reachable, this file is never touched, so the production path is
  "diff = base URL only" (build-plan §3).

  State is module-level and mutable so an optimistic drag that commits a PATCH
  actually sticks for the session, and undo/redo replays against consistent data.
*/

import {
  addDaysISO,
  composeTimestamp,
  currentWeekStartISO,
  WEEKDAY_KEYS,
  weekDays,
} from './planTime'
import { byPriorityThenDue, findFirstFreeSlot } from './planPlacement'

// Simulated round-trip latency so the optimistic-then-commit flow is observable.
const MOCK_LATENCY_MS = 260
const delay = (ms = MOCK_LATENCY_MS) => new Promise((r) => setTimeout(r, ms))

let uid = 100
const nextId = (prefix) => `${prefix}-${(uid += 1)}`

// Seed availability: Mon–Fri 09:00–18:00 active, weekend off.
function seedAvailability() {
  return WEEKDAY_KEYS.map((weekday, i) => ({
    weekday,
    startMinutes: 9 * 60,
    endMinutes: 18 * 60,
    isActive: i < 5,
  }))
}

// Seed blocks for a week, positioned to mirror the reference design. `tone` is a
// placeholder for future project coloring (real palette lands with projects).
function seedBlocks(weekStartISO) {
  const day = (offset) => addDaysISO(weekStartISO, offset)
  const mk = (offset, startMin, endMin, title, blockType, tone) => {
    let scheduleId = null
    if (blockType === 'SCHEDULE') {
      scheduleId = nextId('sched')
      // Register the schedule so 일정 편집 (PLAN-17) can prefill its full fields.
      schedulesById.set(scheduleId, {
        scheduleId,
        title,
        estimatedMinutes: endMin - startMin,
        priority: 2,
        memo: '',
        status: 'ACTIVE',
      })
    }
    return {
      planBlockId: nextId('block'),
      blockType,
      title,
      tone,
      status: 'SCHEDULED',
      taskId: blockType === 'TASK' ? nextId('task') : null,
      scheduleId,
      startAt: composeTimestamp(day(offset), startMin),
      endAt: composeTimestamp(day(offset), endMin),
    }
  }
  return [
    mk(0, 9 * 60 + 5, 10 * 60 + 35, '면접 대비 예상 질문 리스트업', 'TASK', 'brand'),
    mk(1, 10 * 60 + 45, 12 * 60 + 40, '대시보드 개선', 'TASK', 'accent'),
    mk(2, 10 * 60 + 50, 12 * 60 + 10, '모의 면접 답변 1차 정리', 'TASK', 'brand'),
    mk(2, 14 * 60 + 15, 15 * 60 + 10, '자기소개 스크립트', 'TASK', 'brand'),
    mk(4, 15 * 60, 16 * 60, '병원 방문', 'SCHEDULE', null),
  ]
}

// Backlog of UNASSIGNED tasks the unplaced panel lists (ST-F1-03). Global (not
// per-week) — a task is a candidate for any week until it's placed as a block.
function seedUnplacedTasks() {
  const mk = (title, estimatedMinutes, priority, projectId, projectName, dueOffset) => ({
    taskId: nextId('task'),
    projectId,
    projectName,
    title,
    estimatedMinutes,
    priority,
    dueDate: dueOffset == null ? null : addDaysISO(currentWeekStartISO(), dueOffset),
    reason: null,
  })
  return [
    mk('채용 공고 리서치·정리', 90, 1, 'proj-1', '취업 준비', 3),
    mk('포트폴리오 프로젝트 회고 작성', 120, 2, 'proj-1', '취업 준비', 6),
    mk('알고리즘 문제 풀이 세트', 60, 2, 'proj-2', '코딩 테스트', null),
    mk('영어 인터뷰 표현 암기', 45, 3, 'proj-1', '취업 준비', 9),
    mk('이력서 최종 검토', 30, 1, 'proj-1', '취업 준비', 1),
  ]
}

// Per-week plan store, created lazily on first access to a week.
const weeks = new Map()
let availability = seedAvailability()
let unplacedTasks = seedUnplacedTasks()
// Full data of tasks that have been placed as blocks, kept so "배치 해제" (PLAN-16)
// can restore the original task to the unplaced backlog (and later A4 remainder).
const placedTaskData = new Map()
// SCHEDULE records (ST-F1-04 PLAN-08/17). A schedule owns the fields the plan_block
// doesn't (memo·estimatedMinutes·priority); the block mirrors its title/time.
const schedulesById = new Map()
// Execution records (PLAN-15 실제 시간 기록) — write-only for this cycle.
const executionRecords = []

// Remember a task's full record when it leaves the backlog (placed as a block).
function rememberPlaced(taskId) {
  const src = unplacedTasks.find((t) => t.taskId === taskId)
  if (src) placedTaskData.set(taskId, { ...src, reason: null })
}

function findWeekByPlanId(weeklyPlanId) {
  for (const week of weeks.values()) {
    if (week.weeklyPlanId === weeklyPlanId) return week
  }
  return null
}

// Build a TASK block from a placement (task + target span).
function blockFromPlacement({ taskId, title, startAt, endAt }) {
  return {
    planBlockId: nextId('block'),
    blockType: 'TASK',
    title,
    tone: 'brand',
    status: 'SCHEDULED',
    taskId,
    scheduleId: null,
    startAt,
    endAt,
  }
}

function ensureWeek(weekStartISO) {
  if (!weeks.has(weekStartISO)) {
    // The current week is richly seeded; other weeks start empty (still valid).
    const blocks = weekStartISO === currentWeekStartISO() ? seedBlocks(weekStartISO) : []
    weeks.set(weekStartISO, {
      weeklyPlanId: nextId('wp'),
      weekStartDate: weekStartISO,
      weekEndDate: addDaysISO(weekStartISO, 6),
      status: 'DRAFT',
      version: 1,
      blocks,
    })
  }
  return weeks.get(weekStartISO)
}

function computeDerived(week) {
  const totalPlannedMinutes = week.blocks.reduce((sum, b) => {
    const mins = (new Date(b.endAt).getTime() - new Date(b.startAt).getTime()) / 60000
    return sum + mins
  }, 0)
  // Denormalize a SCHEDULE block's owning-schedule fields (memo·estimatedMinutes·
  // priority) onto the block so 일정 편집 (PLAN-17) can prefill without a GET.
  const blocks = week.blocks.map((b) => {
    if (b.blockType === 'SCHEDULE' && b.scheduleId && schedulesById.has(b.scheduleId)) {
      const s = schedulesById.get(b.scheduleId)
      return { ...b, memo: s.memo, estimatedMinutes: s.estimatedMinutes, priority: s.priority }
    }
    // Attach the project link for a placed task (PLAN-12); seeded tasks have none.
    if (b.blockType === 'TASK' && b.taskId && placedTaskData.has(b.taskId)) {
      const t = placedTaskData.get(b.taskId)
      return { ...b, projectId: t.projectId ?? null, projectName: t.projectName ?? null }
    }
    return b
  })
  return {
    ...week,
    blocks,
    totalPlannedMinutes,
    // Unplaced count = the global UNASSIGNED backlog length (ST-F1-03); validation
    // still a placeholder until POST validations lands (ST-F1-05).
    unplacedCount: unplacedTasks.length,
    validation: { blockCount: 0, warningCount: 2 },
  }
}

export const mockBackend = {
  async getWeek(weekStartISO) {
    await delay(120)
    return computeDerived(ensureWeek(weekStartISO))
  },

  async getAvailability() {
    await delay(80)
    return availability
  },

  async patchBlock(planBlockId, patch) {
    await delay()
    for (const week of weeks.values()) {
      const block = week.blocks.find((b) => b.planBlockId === planBlockId)
      if (block) {
        Object.assign(block, patch)
        // A block whose new start lands in a different week migrates stores
        // (PLAN-20 week-boundary move). The caller passes the target week key.
        if (patch.__targetWeek && patch.__targetWeek !== week.weekStartDate) {
          week.blocks = week.blocks.filter((b) => b.planBlockId !== planBlockId)
          const target = ensureWeek(patch.__targetWeek)
          delete block.__targetWeek
          target.blocks.push(block)
        } else {
          delete block.__targetWeek
        }
        return { planBlockId, ...patch }
      }
    }
    throw new Error(`mock: block ${planBlockId} not found`)
  },

  async putAvailabilities(patterns) {
    await delay()
    availability = patterns
    return patterns
  },

  // GET /tasks?status=UNASSIGNED — the unplaced backlog, optionally filtered to a
  // project (PROJ-15/19 entry). Returns the `{ tasks }` envelope body shape.
  async getUnplacedTasks(projectId) {
    await delay(100)
    const tasks = projectId
      ? unplacedTasks.filter((t) => t.projectId === projectId)
      : unplacedTasks
    return { tasks: tasks.map((t) => ({ ...t })) }
  },

  // POST /weekly-plans/{id}/blocks (blockType=TASK) — place one task. Adds the
  // block to its week and drops the task from the backlog.
  async createBlock(weeklyPlanId, body) {
    await delay()
    const week = findWeekByPlanId(weeklyPlanId)
    if (!week) throw new Error(`mock: plan ${weeklyPlanId} not found`)
    const block = blockFromPlacement({
      taskId: body.taskId,
      title: body.title,
      startAt: body.startAt,
      endAt: body.endAt,
    })
    week.blocks.push(block)
    rememberPlaced(body.taskId)
    unplacedTasks = unplacedTasks.filter((t) => t.taskId !== body.taskId)
    return { planBlockId: block.planBlockId }
  },

  // POST /weekly-plans/{id}/auto-placements — DRAFT only. Greedily lays the
  // backlog into free slots (우선순위·마감일 순) without mutating any store; the
  // client holds the result as a draft overlay until [적용] commits it.
  async autoPlace(weeklyPlanId) {
    await delay(700) // a visible "배치 중…" beat
    const week = findWeekByPlanId(weeklyPlanId)
    if (!week) throw new Error(`mock: plan ${weeklyPlanId} not found`)
    const days = weekDays(week.weekStartDate)
    // occupied grows as we draft, so drafts don't overlap each other or real blocks.
    const occupied = week.blocks.map((b) => ({ startAt: b.startAt, endAt: b.endAt }))
    const placements = []
    const unplaced = []
    for (const task of [...unplacedTasks].sort(byPriorityThenDue)) {
      const duration = task.estimatedMinutes ?? 60
      const slot = findFirstFreeSlot({ days, availability, blocks: occupied, durationMin: duration })
      if (!slot) {
        unplaced.push({ ...task, reason: '이번 주 남은 가용 시간에 맞는 빈 구간이 없습니다' })
        continue
      }
      const startAt = composeTimestamp(days[slot.dayIndex], slot.startMin)
      const endAt = composeTimestamp(days[slot.dayIndex], slot.startMin + duration)
      placements.push({ taskId: task.taskId, title: task.title, startAt, endAt })
      occupied.push({ startAt, endAt })
    }
    return { placements, unplaced }
  },

  // POST /weekly-plans/{id}/block-batches — commit an applied auto-place draft.
  async commitBatch(weeklyPlanId, placements) {
    await delay()
    const week = findWeekByPlanId(weeklyPlanId)
    if (!week) throw new Error(`mock: plan ${weeklyPlanId} not found`)
    const placedIds = new Set()
    for (const p of placements ?? []) {
      week.blocks.push(blockFromPlacement(p))
      rememberPlaced(p.taskId)
      placedIds.add(p.taskId)
    }
    unplacedTasks = unplacedTasks.filter((t) => !placedIds.has(t.taskId))
    return { placedCount: placedIds.size }
  },

  // PATCH /tasks/{taskId}/status — PLAN-13/14 완료/미완료. Mirrors onto every
  // block of the task so the grid reflects completion (block.status).
  async setTaskStatus(taskId, status) {
    await delay(150)
    for (const week of weeks.values()) {
      for (const block of week.blocks) {
        if (block.taskId === taskId) block.status = status
      }
    }
    return { message: 'STATUS_UPDATED' }
  },

  // DELETE /plan-blocks/{planBlockId}. A SCHEDULE block is simply removed
  // (PLAN-18 삭제); a TASK block is removed AND its task returns to the unplaced
  // backlog (PLAN-16 배치 해제) — same endpoint, behavior keyed by block type.
  async deleteBlock(planBlockId) {
    await delay()
    for (const week of weeks.values()) {
      const block = week.blocks.find((b) => b.planBlockId === planBlockId)
      if (!block) continue
      week.blocks = week.blocks.filter((b) => b.planBlockId !== planBlockId)
      if (block.blockType === 'TASK' && block.taskId) {
        const restored = placedTaskData.get(block.taskId) ?? {
          taskId: block.taskId,
          title: block.title,
          estimatedMinutes: 60,
          priority: 2,
          projectId: null,
          projectName: null,
          dueDate: null,
          reason: null,
        }
        if (!unplacedTasks.some((t) => t.taskId === block.taskId)) {
          unplacedTasks = [...unplacedTasks, restored]
        }
        placedTaskData.delete(block.taskId)
        return { message: 'UNASSIGNED' }
      }
      return { message: 'DELETED' }
    }
    throw new Error(`mock: block ${planBlockId} not found`)
  },

  // POST /weekly-plans/{id}/blocks (blockType=SCHEDULE) — PLAN-08 일정 배치. Creates
  // a schedule record and its mirroring SCHEDULE block.
  async createScheduleBlock(weeklyPlanId, body) {
    await delay()
    const week = findWeekByPlanId(weeklyPlanId)
    if (!week) throw new Error(`mock: plan ${weeklyPlanId} not found`)
    const scheduleId = nextId('sched')
    schedulesById.set(scheduleId, {
      scheduleId,
      title: body.title,
      estimatedMinutes: body.estimatedMinutes ?? null,
      priority: body.priority ?? 2,
      memo: body.memo ?? '',
      status: 'ACTIVE',
    })
    const block = {
      planBlockId: nextId('block'),
      blockType: 'SCHEDULE',
      title: body.title,
      tone: null,
      status: 'SCHEDULED',
      taskId: null,
      scheduleId,
      startAt: body.startAt,
      endAt: body.endAt,
    }
    week.blocks.push(block)
    return { planBlockId: block.planBlockId, scheduleId }
  },

  // PATCH /schedules/{scheduleId} — PLAN-17 일정 편집. Updates the schedule record
  // AND its block's mirrored title/time.
  async updateSchedule(scheduleId, patch) {
    await delay()
    const current = schedulesById.get(scheduleId) ?? { scheduleId }
    const next = { ...current, ...patch }
    schedulesById.set(scheduleId, next)
    for (const week of weeks.values()) {
      for (const block of week.blocks) {
        if (block.scheduleId === scheduleId) {
          if (patch.title != null) block.title = patch.title
          if (patch.startAt != null) block.startAt = patch.startAt
          if (patch.endAt != null) block.endAt = patch.endAt
        }
      }
    }
    return { message: 'UPDATED' }
  },

  // POST /tasks/{taskId}/execution-records — PLAN-15 실제 시간 기록 (write-only).
  async logExecution(taskId, body) {
    await delay(150)
    const executionRecordId = nextId('exec')
    executionRecords.push({ executionRecordId, taskId, ...body })
    return { executionRecordId }
  },
}

export default mockBackend
