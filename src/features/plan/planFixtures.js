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
} from './planTime'

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
  const mk = (offset, startMin, endMin, title, blockType, tone) => ({
    planBlockId: nextId('block'),
    blockType,
    title,
    tone,
    status: 'SCHEDULED',
    taskId: blockType === 'TASK' ? nextId('task') : null,
    scheduleId: blockType === 'SCHEDULE' ? nextId('sched') : null,
    startAt: composeTimestamp(day(offset), startMin),
    endAt: composeTimestamp(day(offset), endMin),
  })
  return [
    mk(0, 9 * 60 + 5, 10 * 60 + 35, '면접 대비 예상 질문 리스트업', 'TASK', 'brand'),
    mk(1, 10 * 60 + 45, 12 * 60 + 40, '대시보드 개선', 'TASK', 'accent'),
    mk(2, 10 * 60 + 50, 12 * 60 + 10, '모의 면접 답변 1차 정리', 'TASK', 'brand'),
    mk(2, 14 * 60 + 15, 15 * 60 + 10, '자기소개 스크립트', 'TASK', 'brand'),
    mk(4, 15 * 60, 16 * 60, '병원 방문', 'SCHEDULE', null),
  ]
}

// Per-week plan store, created lazily on first access to a week.
const weeks = new Map()
let availability = seedAvailability()

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
  return {
    ...week,
    totalPlannedMinutes,
    // Placeholder counts; real unplaced comes from GET /tasks?status=UNASSIGNED
    // (ST-F1-03) and validation from POST validations (ST-F1-05).
    unplacedCount: 3,
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
}

export default mockBackend
