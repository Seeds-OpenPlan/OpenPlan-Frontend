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
  addWeeksISO,
  composeTimestamp,
  currentWeekStartISO,
  dateOf,
  formatMinutesLabel,
  minutesOfDay,
  WEEKDAY_KEYS,
  WEEKDAY_LABELS_KO,
  weekDays,
} from './planTime'
import { byDueThenPriority, byPriorityThenDue, findFirstFreeSlot } from './planPlacement'
import { availabilityForColumn } from './planGeometry'

// Simulated round-trip latency so the optimistic-then-commit flow stays
// observable (never 0 — that's the whole reason this DEV mock exists: seeing
// the optimistic write land instantly, then the background write/refetch settle
// a beat later). Kept deliberately short so the app doesn't feel laggy; each
// GET below still gets its OWN (smaller) explicit delay on top of whatever it
// does, so multi-request chains (e.g. delete → week refetch → unplaced
// refetch) don't stack up into a visibly slow interaction.
const MOCK_LATENCY_MS = 70
const delay = (ms = MOCK_LATENCY_MS) => new Promise((r) => setTimeout(r, ms))

let uid = 100
const nextId = (prefix) => `${prefix}-${(uid += 1)}`

// FIX (ST-F1-09 code review, Thomas — BLOCKER): every TASK id THIS mock mints
// uses the `plan-task` prefix, deliberately DIFFERENT from
// projectFixtures.js's own `task` prefix. Both modules start their own local
// `uid` counter at 100, so with a shared prefix they would mint COLLIDING ids
// (both produce `task-101`, `task-102`, …) — projectApi.getTask (ST-F1-09,
// GET /tasks/{taskId}) searches ONLY the project store, so a colliding id
// reached via WeeklyPage.jsx's "태스크 편집" context menu (which passes a
// PLAN block's taskId, minted here) would silently resolve to an unrelated
// PROJECT task and let the edit page save over it — no error, wrong data.
// A distinct prefix makes the two stores' id spaces disjoint BY CONSTRUCTION
// (no counter-coordination needed), so a plan-only id can never accidentally
// match a project task; projectApi.getTask now 404s for it instead — see
// that function's own header comment for why that is the correct behavior,
// not a workaround. No plan-feature code parses/matches taskId by string
// shape (grepped before this change), so the prefix itself is free to change.

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
    let taskId = null
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
    } else {
      taskId = nextId('plan-task')
      // Register the task with its estimate = initial duration, so A4 remainder
      // works when a SEEDED task block is shrunk (est − placed > 0).
      placedTaskData.set(taskId, {
        taskId,
        title,
        estimatedMinutes: endMin - startMin,
        priority: 2,
        projectId: null,
        projectName: null,
        dueDate: null,
        reason: null,
      })
    }
    return {
      planBlockId: nextId('block'),
      blockType,
      title,
      tone,
      status: 'SCHEDULED',
      taskId,
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

// DEV-ONLY seed for the PREVIOUS week (ST-F1-02 AC-5 demo). Without this, a
// past week's grid is empty in the mock — ensureWeek only ever creates a week
// the first time something asks for it, and nothing asks for a past one until
// the user navigates ‹ into it, so there was no way to see (or verify) the
// AC-5 carve-out (완료 전환/실제 시간 기록 stay usable on a read-only past week,
// everything else stays blocked) without hand-building a past plan first. Mix
// of TASK (one COMPLETED, one not — both toggle directions are reachable) and
// SCHEDULE (menuItemsFor returns [] for a past-week SCHEDULE; a TASK block
// returns [complete, log] — see WeeklyPage.jsx) so a 우클릭 on each contrasts
// directly against the other. Deliberately much smaller than seedBlocks (this
// week) and produces no validation issues of its own — it exists to exercise
// AC-5, not to re-demo ST-F1-05's blocking-violation case a second time.
function seedPastWeekBlocks(weekStartISO) {
  const day = (offset) => addDaysISO(weekStartISO, offset)
  const mk = (offset, startMin, endMin, title, blockType, status) => {
    let scheduleId = null
    let taskId = null
    if (blockType === 'SCHEDULE') {
      scheduleId = nextId('sched')
      schedulesById.set(scheduleId, {
        scheduleId,
        title,
        estimatedMinutes: endMin - startMin,
        priority: 2,
        memo: '',
        status: 'ACTIVE',
      })
    } else {
      taskId = nextId('plan-task')
      placedTaskData.set(taskId, {
        taskId,
        title,
        estimatedMinutes: endMin - startMin,
        priority: 2,
        projectId: null,
        projectName: null,
        dueDate: null,
        reason: null,
      })
    }
    return {
      planBlockId: nextId('block'),
      blockType,
      title,
      tone: blockType === 'TASK' ? 'brand' : null,
      status,
      taskId,
      scheduleId,
      startAt: composeTimestamp(day(offset), startMin),
      endAt: composeTimestamp(day(offset), endMin),
    }
  }
  return [
    // TASK, already completed — "완료로 표시" should offer "미완료로 되돌리기".
    // MON 10:30 (not 09:00): this week's fixed schedule "아침 스터디" runs
    // MON 09:00-10:00 (seedFixedSchedules) — starting after it avoids a V2
    // 고정 일정 충돌 this seed isn't meant to demonstrate (that's ST-F1-05's
    // OWN seed, on the CURRENT week, above).
    mk(0, 10 * 60 + 30, 12 * 60, '지난주 발표 자료 준비', 'TASK', 'COMPLETED'),
    // TASK, still open — "완료로 표시" should offer the forward direction.
    mk(1, 10 * 60, 11 * 60, '주간 회고 정리', 'TASK', 'SCHEDULED'),
    // SCHEDULE — its menu should be EMPTY on a past week (no 완료/기록 concept).
    mk(2, 14 * 60, 15 * 60, '치과 예약', 'SCHEDULE', 'SCHEDULED'),
    // A second completed TASK, on a different day (THU — clear of THU's own
    // fixed "주간 팀 회의" 11:00-12:00), so 실제 시간 기록 has more than one
    // candidate block to try it on.
    mk(3, 9 * 60 + 30, 10 * 60 + 30, '코드 리뷰', 'TASK', 'COMPLETED'),
  ]
}

// Backlog of UNASSIGNED tasks the unplaced panel lists (ST-F1-03). Global (not
// per-week) — a task is a candidate for any week until it's placed as a block.
function seedUnplacedTasks() {
  const mk = (title, estimatedMinutes, priority, projectId, projectName, dueOffset) => ({
    taskId: nextId('plan-task'),
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

/*
  Fixed schedules (recurring, immovable). The real surface for these is ST-F1-06;
  they exist here NOW because the V2 (고정 일정 충돌) rule is unverifiable without
  them — the seeded 월 09:05 task block deliberately overlaps 아침 스터디 so the
  blocking violation, the disabled save button and the review panel are all
  visible on first load rather than only after the user constructs a conflict.
  They are not returned as plan blocks, so the grid is unchanged.
*/
function seedFixedSchedules() {
  return [
    {
      fixedScheduleId: nextId('fixed'),
      title: '아침 스터디',
      weekday: 'MON',
      startMinutes: 9 * 60,
      endMinutes: 10 * 60,
    },
    {
      fixedScheduleId: nextId('fixed'),
      title: '주간 팀 회의',
      weekday: 'THU',
      startMinutes: 11 * 60,
      endMinutes: 12 * 60,
    },
  ]
}

// Per-week plan store, created lazily on first access to a week.
const weeks = new Map()
let availability = seedAvailability()
const fixedSchedules = seedFixedSchedules()
// ST-F1-06 week exceptions: fixedScheduleId -> Set<weekStartISO> currently
// "이번 주만 비활성화". A Set (not a boolean) because the toggle is PER WEEK — the
// same fixed schedule can be deactivated for one week and stay active every other
// week, which is the whole point of PLAN-33/34 (never a global on/off).
const weekExceptionsByFixedId = new Map()

// True unless THIS week has an exception recorded for THIS fixed schedule. Read
// by both the V2 rule (a deactivated fixed schedule stops blocking) and
// getFixedSchedules (the `activeThisWeek` the ghost display keys off).
function isFixedActiveForWeek(fixed, weekStartISO) {
  return !weekExceptionsByFixedId.get(fixed.fixedScheduleId)?.has(weekStartISO)
}
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
// Once placed, a task lives in placedTaskData permanently — its UNPLACED presence
// is then derived as a REMAINDER (est − placed), so a shrink-resize (A4) or a full
// unplace (PLAN-16) both just surface as more remaining time.
function rememberPlaced(taskId) {
  const src = unplacedTasks.find((t) => t.taskId === taskId)
  if (src && !placedTaskData.has(taskId)) placedTaskData.set(taskId, { ...src, reason: null })
}

// Total minutes a task currently occupies across all weeks' blocks.
function placedMinutesOf(taskId) {
  let total = 0
  for (const week of weeks.values()) {
    for (const b of week.blocks) {
      if (b.taskId === taskId) {
        total += (new Date(b.endAt).getTime() - new Date(b.startAt).getTime()) / 60000
      }
    }
  }
  return total
}

// Placed tasks whose blocks cover LESS than their estimate → the leftover shows
// back in the unplaced panel as a remainder (A4 "남은 시간은 미배치에 다시 계산").
function placedRemainders() {
  const out = []
  for (const task of placedTaskData.values()) {
    const placed = placedMinutesOf(task.taskId)
    const remaining = (task.estimatedMinutes ?? 0) - placed
    if (remaining >= 5) {
      out.push({
        ...task,
        estimatedMinutes: Math.round(remaining),
        // Only a PARTIALLY-placed task is a "placed shorter than planned"
        // remainder; a fully-unplaced one (placed 0) is just a normal backlog item.
        reason: placed > 0 ? '예정보다 짧게 배치되어 남은 시간이 있습니다' : null,
      })
    }
  }
  return out
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
    // The current week is richly seeded (ST-F1-05's blocking-violation demo);
    // the week right before it is seeded too, but separately (AC-5's past-week
    // demo — see seedPastWeekBlocks' header). Every other week still starts
    // empty, which remains valid — nothing here requires a week to be seeded.
    let blocks = []
    if (weekStartISO === currentWeekStartISO()) blocks = seedBlocks(weekStartISO)
    else if (weekStartISO === addWeeksISO(currentWeekStartISO(), -1)) {
      blocks = seedPastWeekBlocks(weekStartISO)
    }
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

/*
  --- Validation rules (ST-F1-05) -------------------------------------------

  These are REAL computations over the mock's own data, not canned issues: every
  violation the panel shows can be created and cleared by moving blocks in the
  browser, which is the only way the 3-layer display and the save gate can be
  checked by eye before BE-1's rules exist.

  Coverage: V1·V2·V4·V5 always computable from the seeded data; V3 needs a task
  with a dueDate (backlog tasks have one — placing one after its due date fires
  it); V6 needs two blocks closer than the buffer; V7 needs WBS project ranges,
  which this mock has no data for at all, so it is intentionally never emitted
  (inventing a fake WBS range would make the rule untestable, not testable).

  The emitted shape mirrors what a server would plausibly send — code, target
  ids, and the copy variables at the top level — and planApi.normalizeIssue
  folds the extra keys into `params`. No violation TEXT lives here: that is
  violationMessages.js's job alone (J1).
*/

// Minimum gap between consecutive blocks before "버퍼 부족" (V6) applies.
// ASSUMPTION: no rule document fixes this number; 10분 is the smallest gap that
// still reads as a deliberate break. Change here when the rule spec lands.
const BUFFER_MIN_MINUTES = 10

// The mock's OWN severity classification, deliberately not imported from
// violationMessages: that catalog is the CLIENT's table, and a mock standing in
// for the server must be able to disagree with it (that's exactly the case the
// client's "catalog wins for known codes" rule has to survive).
const MOCK_BLOCKING_CODES = new Set(['V1', 'V2'])

const overlaps = (a, b) =>
  new Date(a.startAt) < new Date(b.endAt) && new Date(b.startAt) < new Date(a.endAt)

const durationOf = (b) => (new Date(b.endAt).getTime() - new Date(b.startAt).getTime()) / 60000

const timeRangeOf = (b) =>
  `${formatMinutesLabel(minutesOfDay(b.startAt))} - ${formatMinutesLabel(minutesOfDay(b.endAt))}`

function activeWindowFor(weekdayKey) {
  return availability.find((a) => a.weekday === weekdayKey && a.isActive) ?? null
}

// Minutes of [startMin,endMin) that fall INSIDE `win` ({startMinutes,endMinutes}),
// clamped to 0 when there's no overlap (or no window at all — e.g. a weekend
// with no active availability pattern). No existing helper in
// planGeometry/planTime/planPlacement measures a clamped overlap like this
// (they test boolean overlap or search for free slots), so this is new but
// deliberately minimal — one clamp, one subtraction. Shared by V4 below.
function minutesInsideWindow(startMin, endMin, win) {
  if (!win) return 0
  return Math.max(0, Math.min(endMin, win.endMinutes) - Math.max(startMin, win.startMinutes))
}

function computeValidationIssues(weekStartISO, blocks) {
  const days = weekDays(weekStartISO)
  const issues = []
  let seq = 0
  const push = (code, targetBlockIds, params) => {
    seq += 1
    issues.push({ id: `${code}-${seq}`, code, targetBlockIds, ...params })
  }

  // Only blocks that actually land in this week participate; everything below
  // groups by grid column, so an out-of-week block would have no day to compare.
  const inWeek = blocks
    .map((b) => ({ ...b, dayIndex: days.indexOf(dateOf(b.startAt)) }))
    .filter((b) => b.dayIndex >= 0)
    .sort((a, b) => new Date(a.startAt) - new Date(b.startAt))

  // V1 일정 겹침 (차단) — every unordered pair that shares time on the same day.
  for (let i = 0; i < inWeek.length; i += 1) {
    for (let j = i + 1; j < inWeek.length; j += 1) {
      const a = inWeek[i]
      const b = inWeek[j]
      if (a.dayIndex !== b.dayIndex || !overlaps(a, b)) continue
      push('V1', [a.planBlockId, b.planBlockId], {
        blockTitle: a.title,
        otherTitle: b.title,
        timeRange: `${WEEKDAY_LABELS_KO[a.dayIndex]} ${timeRangeOf(a)}`,
      })
    }
  }

  // V2 고정 일정 충돌 (차단) — a plan block sitting on an immovable fixed schedule.
  // A fixed schedule deactivated for THIS week (ST-F1-06 PLAN-33) is skipped: the
  // whole point of "이번 주만 비활성화" is that it stops blocking for that week
  // specifically, without touching any other week's V2 result.
  for (const block of inWeek) {
    const weekdayKey = WEEKDAY_KEYS[block.dayIndex]
    const startMin = minutesOfDay(block.startAt)
    const endMin = minutesOfDay(block.endAt)
    for (const fixed of fixedSchedules) {
      if (fixed.weekday !== weekdayKey) continue
      if (!isFixedActiveForWeek(fixed, weekStartISO)) continue
      if (startMin >= fixed.endMinutes || endMin <= fixed.startMinutes) continue
      push('V2', [block.planBlockId], {
        blockTitle: block.title,
        otherTitle: fixed.title,
        timeRange:
          `${WEEKDAY_LABELS_KO[block.dayIndex]} ` +
          `${formatMinutesLabel(fixed.startMinutes)} - ${formatMinutesLabel(fixed.endMinutes)}`,
      })
    }
  }

  // V5 가용 시간 밖 배치 (경고) — TASK ONLY. ONB-03 defines 가용 시간 as "태스크를
  // 배치할 수 있는 시간" — a TASK-placement capacity, not a constraint on when a
  // SCHEDULE (a real, already-fixed appointment/meeting) may sit. An evening
  // SCHEDULE block outside the day's window is not a violation of anything; it
  // is the whole reason the window doesn't cover that hour in the first place.
  // (owner-reported: "일정은 가용시간 범위 밖에 있어도 되는데 경고가 뜨네" — V5 used to
  // fire for both block types because this loop never checked blockType at all.)
  //
  // BE NOTE: this is the DEV mock's rule engine — computeValidationIssues here
  // is never consulted once a real server answers OP-PLAN-VALIDATE. The real
  // V5 rule needs this SAME blockType≠SCHEDULE exclusion; flagging so the BE
  // rule-engine story picks it up.
  for (const block of inWeek) {
    if (block.blockType !== 'TASK') continue
    const win = activeWindowFor(WEEKDAY_KEYS[block.dayIndex])
    const startMin = minutesOfDay(block.startAt)
    const endMin = minutesOfDay(block.endAt)
    if (win && startMin >= win.startMinutes && endMin <= win.endMinutes) continue
    push('V5', [block.planBlockId], {
      blockTitle: block.title,
      dayLabel: `${WEEKDAY_LABELS_KO[block.dayIndex]}요일`,
      timeRange: timeRangeOf(block),
    })
  }

  // V4 가용 시간 초과 (경고) — one issue per day whose TASK load exceeds that
  // day's TASK-PLACEMENT CAPACITY.
  //
  // 가용 창(WINDOW, 09–18) and 가용 시간(CAPACITY, "얼마나 태스크에 쓸 수 있는가")
  // are NOT the same thing — that's the distinction this rule turns on
  // (ONB-03 · owner decision). The window is a fixed span; the capacity is what
  // is LEFT of it after a personal SCHEDULE inside it has already claimed some
  // (a 2-hour lunch meeting inside a 9-hour window leaves only 7 hours a TASK
  // could ever occupy).
  //   capacity = window length − SCHEDULE minutes INSIDE the window (clipped
  //              via minutesInsideWindow, reused as-is — its signature already
  //              fits a SCHEDULE block the same as a TASK block).
  //   planned  = TASK minutes IN FULL, regardless of where they sit. A task
  //              pushed out past the window is still planned work for that
  //              day — that is exactly the "초과" this rule exists to catch,
  //              so clipping it to the window would hide the one case that
  //              matters most.
  //
  // PRIOR VERSION (superseded): clipped EVERY block — TASK included — to the
  // window and compared against the raw window length. That made this rule
  // UNFIRABLE in practice: two non-overlapping blocks' in-window minutes can
  // never exceed the window's own length (their clipped sum is bounded by the
  // window itself), and the only way to exceed it is to overlap, which V1
  // (차단) already reports. Do not go back to that shape.
  //
  // capacity is clamped to >= 0 (Math.max) — a SCHEDULE that fills or exceeds
  // the window on its own (an all-day commitment) leaves NEGATIVE room, not
  // negative capacity; any TASK placed that day is then, correctly, entirely
  // "초과".
  //
  // BE NOTE: same as V5/V6 — computeValidationIssues is the DEV mock's rule
  // engine only; the real V4 rule needs this identical 창≠용량 distinction
  // (capacity = window minus in-window SCHEDULE time; load = full TASK time).
  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const dayBlocks = inWeek.filter((b) => b.dayIndex === dayIndex)
    if (dayBlocks.length === 0) continue
    const win = activeWindowFor(WEEKDAY_KEYS[dayIndex])
    const windowLength = win ? win.endMinutes - win.startMinutes : 0
    const scheduleMinutesInWindow = dayBlocks
      .filter((b) => b.blockType === 'SCHEDULE')
      .reduce(
        (sum, b) => sum + minutesInsideWindow(minutesOfDay(b.startAt), minutesOfDay(b.endAt), win),
        0,
      )
    const capacity = Math.max(0, windowLength - scheduleMinutesInWindow)

    // A day with NO active window (weekend, or a weekday toggled off) now
    // gets capacity 0 — a genuine behavior change from the prior version,
    // where such a day was silent. Placing a TASK there is a real 초과 (its
    // whole duration is over a 0-capacity day) AND is separately caught by V5
    // (TASK-only, "가용 시간 밖 배치"): the two fire TOGETHER on a windowless
    // day, one naming the day's total, the other naming the specific
    // placement. This mirrors a pattern the panel already tolerates elsewhere
    // (one block can carry several simultaneous issues — see
    // WeeklyPage.jsx's violationsByBlockId), so it is left as two honest,
    // differently-worded warnings rather than suppressing either.
    const taskBlocks = dayBlocks.filter((b) => b.blockType === 'TASK')
    const planned = taskBlocks.reduce((sum, b) => sum + durationOf(b), 0)
    if (planned <= capacity) continue
    push(
      'V4',
      // Targets are the TASK blocks that make up the excess, not the
      // SCHEDULE(s) that shrank capacity — selecting this item should answer
      // "which of MY tasks would I move", and a schedule (a fixed personal
      // commitment) isn't something V4 is asking the user to reconsider.
      taskBlocks.map((b) => b.planBlockId),
      {
        dayLabel: `${WEEKDAY_LABELS_KO[dayIndex]}요일`,
        overMinutes: Math.round(planned - capacity),
      },
    )
  }

  // V3 마감일 이후 배치 (경고) — the task's own dueDate vs the day it sits on.
  for (const block of inWeek) {
    const task = block.taskId ? placedTaskData.get(block.taskId) : null
    const placedDate = dateOf(block.startAt)
    if (!task?.dueDate || placedDate <= task.dueDate) continue
    push('V3', [block.planBlockId], {
      blockTitle: block.title,
      dueDate: task.dueDate,
      placedDate,
    })
  }

  // V6 버퍼 부족 (경고) — consecutive same-day blocks with a gap under the
  // buffer. A gap of EXACTLY 0 (back-to-back, no breathing room at all) is the
  // WORST case of "버퍼 부족", not an exemption from it — it must warn same as
  // any gap under BUFFER_MIN_MINUTES (owner-reported: 5분 간격은 경고되는데 0분은
  // 안 뜨는 건 규칙이 앞뒤가 안 맞았음). Only a NEGATIVE gap is skipped here —
  // that is a genuine overlap, already reported as the 차단 V1 above; V6 has
  // nothing further to add about it as a mere warning.
  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const dayBlocks = inWeek.filter((b) => b.dayIndex === dayIndex)
    for (let i = 1; i < dayBlocks.length; i += 1) {
      const prev = dayBlocks[i - 1]
      const next = dayBlocks[i]
      const gap = minutesOfDay(next.startAt) - minutesOfDay(prev.endAt)
      if (gap < 0 || gap >= BUFFER_MIN_MINUTES) continue
      push('V6', [prev.planBlockId, next.planBlockId], {
        blockTitle: prev.title,
        otherTitle: next.title,
        gapMinutes: gap,
      })
    }
  }

  return issues
}

/*
  --- Replan alternatives (ST-F1-07) -----------------------------------------

  Like the validation rules above, these are REAL computations over the mock's
  own block/availability/fixed-schedule data, not canned responses — every
  alternative can be produced and compared by moving blocks in the browser,
  which is the only way "4안 비교" is checkable before BE-1's rule engine
  exists. Each strategy reuses the SAME primitives the rest of the app already
  trusts (findFirstFreeSlot, byPriorityThenDue's sibling comparator, the V1/V2
  blocking-issue detector) rather than inventing separate placement math.

  A fixed schedule is an immovable constraint here exactly as it is for V2: it
  never appears in `week.blocks` (fixed schedules are not plan_blocks — see the
  seedFixedSchedules comment), so every strategy below builds its own "occupied"
  spans list by ADDING the week's active fixed-schedule spans to whatever plan
  blocks it is placing around. Only a TASK block is ever moved; a SCHEDULE
  block is a personal commitment the user placed on purpose (ST-F1-04) and is
  left untouched, exactly like a fixed schedule.
*/

// This week's active fixed schedules as {startAt,endAt} spans, so they can be
// added to a placement search's "occupied" list the same way plan blocks are.
// A schedule deactivated for this week (PLAN-33) contributes nothing — the
// whole point of "이번 주만 비활성화" is that it stops constraining this week.
function fixedScheduleSpans(weekStartISO) {
  const days = weekDays(weekStartISO)
  const spans = []
  for (const fixed of fixedSchedules) {
    if (!isFixedActiveForWeek(fixed, weekStartISO)) continue
    const dayIndex = WEEKDAY_KEYS.indexOf(fixed.weekday)
    if (dayIndex < 0) continue
    spans.push({
      startAt: composeTimestamp(days[dayIndex], fixed.startMinutes),
      endAt: composeTimestamp(days[dayIndex], fixed.endMinutes),
    })
  }
  return spans
}

// RB-PLAN-03 최소 변경안 — move ONLY the blocks currently named by a 차단
// violation (V1 겹침 / V2 고정 일정 충돌) to the NEXT free slot after their
// current position ("인접 가용 시간"); every other block is untouched. Returns
// null when there is nothing blocking to fix — a real "no change needed"
// result, not a failure.
function buildMinimalChange(week, blocks) {
  const days = weekDays(week.weekStartDate)
  const fixedSpans = fixedScheduleSpans(week.weekStartDate)
  const issues = computeValidationIssues(week.weekStartDate, blocks)
  const conflictingIds = new Set(
    issues.filter((i) => MOCK_BLOCKING_CODES.has(i.code)).flatMap((i) => i.targetBlockIds),
  )
  if (conflictingIds.size === 0) return null

  let working = blocks.map((b) => ({ ...b }))
  let movedCount = 0
  for (const blockId of conflictingIds) {
    const block = working.find((b) => b.planBlockId === blockId)
    if (!block || block.blockType !== 'TASK') continue // only a TASK block is this strategy's to move
    const dayIndex = days.indexOf(dateOf(block.startAt))
    if (dayIndex < 0) continue
    const duration = durationOf(block)
    const occupied = [
      ...working.filter((b) => b.planBlockId !== blockId).map((b) => ({ startAt: b.startAt, endAt: b.endAt })),
      ...fixedSpans,
    ]
    const slot = findFirstFreeSlot({
      days,
      availability,
      blocks: occupied,
      durationMin: duration,
      fromDayIndex: dayIndex,
      fromMin: minutesOfDay(block.startAt),
    })
    if (!slot) continue
    const startAt = composeTimestamp(days[slot.dayIndex], slot.startMin)
    const endAt = composeTimestamp(days[slot.dayIndex], slot.startMin + duration)
    working = working.map((b) => (b.planBlockId === blockId ? { ...b, startAt, endAt } : b))
    movedCount += 1
  }
  if (movedCount === 0) return null

  return {
    strategyType: 'MINIMAL_CHANGE',
    changeSummary: `충돌 항목 ${movedCount}건만 인접한 가용 시간으로 옮깁니다`,
    recommendationReason: '기존 배치를 최대한 유지하면서 충돌만 해소합니다',
    // This strategy's OWN definition of "better" is "fewer moves" — the inverse
    // of the other two, where a higher score means more improved.
    score: 1 / (1 + movedCount),
    proposedBlocks: working,
  }
}

// RB-PLAN-04 마감 우선안 — re-lay every TASK block out in due-date order
// (byDueThenPriority), earliest deadline claiming the earliest free slot.
// SCHEDULE blocks are anchors (never moved); a task that already sits at the
// best slot available to it simply doesn't move.
function buildDeadlineFirst(week, blocks) {
  const days = weekDays(week.weekStartDate)
  const fixedSpans = fixedScheduleSpans(week.weekStartDate)
  const taskBlocks = blocks.filter((b) => b.blockType === 'TASK')
  const anchored = blocks.filter((b) => b.blockType !== 'TASK')
  if (taskBlocks.length === 0) return null

  const ordered = [...taskBlocks].sort((a, b) => {
    const taskA = a.taskId ? placedTaskData.get(a.taskId) : null
    const taskB = b.taskId ? placedTaskData.get(b.taskId) : null
    return byDueThenPriority(
      { dueDate: taskA?.dueDate ?? null, priority: taskA?.priority ?? a.priority },
      { dueDate: taskB?.dueDate ?? null, priority: taskB?.priority ?? b.priority },
    )
  })

  let occupied = [...anchored.map((b) => ({ startAt: b.startAt, endAt: b.endAt })), ...fixedSpans]
  const placed = []
  let movedCount = 0
  for (const block of ordered) {
    const duration = durationOf(block)
    const slot = findFirstFreeSlot({ days, availability, blocks: occupied, durationMin: duration })
    if (!slot) {
      // No room to improve this one — leave it exactly where it was rather than
      // dropping it from the plan.
      placed.push(block)
      occupied.push({ startAt: block.startAt, endAt: block.endAt })
      continue
    }
    const startAt = composeTimestamp(days[slot.dayIndex], slot.startMin)
    const endAt = composeTimestamp(days[slot.dayIndex], slot.startMin + duration)
    if (startAt !== block.startAt || endAt !== block.endAt) movedCount += 1
    placed.push({ ...block, startAt, endAt })
    occupied.push({ startAt, endAt })
  }
  if (movedCount === 0) return null

  return {
    strategyType: 'DEADLINE_FIRST',
    changeSummary: `마감일이 가까운 태스크 ${movedCount}건을 앞쪽 가용 슬롯으로 옮깁니다`,
    recommendationReason: '마감일 준수 가능성을 높이는 방향으로 재배치합니다',
    score: movedCount,
    proposedBlocks: [...anchored, ...placed],
  }
}

// RB-PLAN-05 작업 분산안 — while some day plans more than its availability
// window (the same over-capacity test V4 uses) and some OTHER day still has
// spare room, move the smallest TASK block on the worst over-capacity day into
// the day with the most spare room, one block per iteration. Bounded by the
// number of TASK blocks so an infeasible week (nowhere has room) can't loop.
function buildWorkloadBalance(week, blocks) {
  const days = weekDays(week.weekStartDate)
  const fixedSpans = fixedScheduleSpans(week.weekStartDate)
  let working = blocks.map((b) => ({ ...b }))

  const dayLoad = (dayIndex) => {
    const dayISO = days[dayIndex]
    const dayBlocks = working.filter((b) => dateOf(b.startAt) === dayISO)
    const win = availabilityForColumn(dayIndex, availability)
    const capacity = win ? win.endMinutes - win.startMinutes : 0
    const planned = dayBlocks.reduce((sum, b) => sum + durationOf(b), 0)
    return { planned, capacity, over: planned - capacity }
  }

  let movedCount = 0
  const maxIterations = working.filter((b) => b.blockType === 'TASK').length
  for (let iter = 0; iter < maxIterations; iter += 1) {
    const loads = Array.from({ length: 7 }, (_, i) => ({ dayIndex: i, ...dayLoad(i) }))
    const overDay = loads.filter((d) => d.over > 0).sort((a, b) => b.over - a.over)[0]
    if (!overDay) break
    const underDay = loads
      .filter((d) => d.capacity - d.planned > 0)
      .sort((a, b) => b.capacity - b.planned - (a.capacity - a.planned))[0]
    if (!underDay) break

    const dayISO = days[overDay.dayIndex]
    // The smallest block that still fits the under-day's remaining room — the
    // least disruptive single move available this iteration.
    const candidate = working
      .filter((b) => b.blockType === 'TASK' && dateOf(b.startAt) === dayISO)
      .filter((b) => durationOf(b) <= underDay.capacity - underDay.planned)
      .sort((a, b) => durationOf(a) - durationOf(b))[0]
    if (!candidate) break

    const occupied = [
      ...working
        .filter((b) => b.planBlockId !== candidate.planBlockId)
        .map((b) => ({ startAt: b.startAt, endAt: b.endAt })),
      ...fixedSpans,
    ]
    const slot = findFirstFreeSlot({
      days,
      availability,
      blocks: occupied,
      durationMin: durationOf(candidate),
      fromDayIndex: underDay.dayIndex,
      fromMin: 0,
    })
    // Only accept a slot that actually landed on the intended under-capacity
    // day — findFirstFreeSlot wraps to OTHER days once that day has no room,
    // which would silently defeat the balancing intent (still legal, just not
    // what this iteration was trying to do).
    if (!slot || slot.dayIndex !== underDay.dayIndex) break

    const startAt = composeTimestamp(days[slot.dayIndex], slot.startMin)
    const endAt = composeTimestamp(days[slot.dayIndex], slot.startMin + durationOf(candidate))
    working = working.map((b) =>
      b.planBlockId === candidate.planBlockId ? { ...b, startAt, endAt } : b,
    )
    movedCount += 1
  }
  if (movedCount === 0) return null

  return {
    strategyType: 'WORKLOAD_BALANCE',
    changeSummary: `과부하 요일의 태스크 ${movedCount}건을 여유 있는 요일로 분산합니다`,
    recommendationReason: '하루 가용 시간 초과를 줄이는 방향으로 재배치합니다',
    score: movedCount,
    proposedBlocks: working,
  }
}

function buildReplanOption(week, blocks, strategyType) {
  switch (strategyType) {
    case 'MINIMAL_CHANGE':
      return buildMinimalChange(week, blocks)
    case 'DEADLINE_FIRST':
      return buildDeadlineFirst(week, blocks)
    case 'WORKLOAD_BALANCE':
      return buildWorkloadBalance(week, blocks)
    default:
      return null
  }
}

// replan_option_id -> { ...option, weeklyPlanId }. The mock has no persistent
// replan_options table, so a generated option is kept here just long enough for
// a later `selectReplanOption` call to look its proposedBlocks back up by id —
// mirroring what a real server would do internally between the two endpoints.
const replanOptionsById = new Map()

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
  // The week payload's `validation` summary is the counts the header shows BEFORE
  // the first dry-run answers, so it runs the same rules the dry-run does — a
  // placeholder here would make the badge briefly lie on every week change.
  const issues = computeValidationIssues(week.weekStartDate, blocks)
  const blockingCodes = issues.filter((i) => MOCK_BLOCKING_CODES.has(i.code))
  return {
    ...week,
    blocks,
    totalPlannedMinutes,
    // Unplaced count = never-placed backlog + partially-placed remainders (A4).
    unplacedCount: unplacedTasks.length + placedRemainders().length,
    validation: {
      blockCount: blockingCodes.length,
      warningCount: issues.length - blockingCodes.length,
    },
  }
}

export const mockBackend = {
  async getWeek(weekStartISO) {
    await delay(60)
    return computeDerived(ensureWeek(weekStartISO))
  },

  async getAvailability() {
    await delay(60)
    return availability
  },

  // GET /fixed-schedules?status=ACTIVE — ST-F1-06. `weekStartISO` is a mock-only
  // extra argument (see fixedScheduleApi.js's ASSUMPTION note): the real 07번
  // 명세서 GET has no weekly concept at all, so this is where that gap is
  // papered over — `activeThisWeek` is computed fresh per call from the week
  // exception store rather than stored on the schedule itself.
  async getFixedSchedules(weekStartISO) {
    await delay(60)
    return {
      fixedSchedules: fixedSchedules.map((f) => ({
        ...f,
        activeThisWeek: isFixedActiveForWeek(f, weekStartISO),
      })),
    }
  },

  // POST /fixed-schedules/{id}/week-exceptions — PLAN-33 이번 주만 비활성화. The
  // contract marks this non-idempotent (api-contracts.md §2.2), but a Set makes a
  // repeat call for the SAME week a harmless no-op here — there is no meaningful
  // "second" deactivation of a week that is already deactivated.
  async addFixedWeekException(fixedScheduleId, weekStartISO) {
    await delay()
    if (!weekExceptionsByFixedId.has(fixedScheduleId)) {
      weekExceptionsByFixedId.set(fixedScheduleId, new Set())
    }
    weekExceptionsByFixedId.get(fixedScheduleId).add(weekStartISO)
    return { message: 'CREATED' }
  },

  // DELETE /fixed-schedules/{id}/week-exceptions/{weekStartDate} — PLAN-34 다시
  // 활성화. Idempotent per the contract: deleting an exception that is already
  // gone (e.g. a stale UI retry) is treated as success, not a 404.
  async removeFixedWeekException(fixedScheduleId, weekStartISO) {
    await delay()
    weekExceptionsByFixedId.get(fixedScheduleId)?.delete(weekStartISO)
    return { message: 'DELETED' }
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
    // Soft no-op for an unknown id (e.g. an optimistic temp-id acted on before it
    // reconciled) — avoids a spurious "요청을 처리하지 못했습니다" on a benign race.
    return { planBlockId, ...patch }
  },

  async putAvailabilities(patterns) {
    await delay()
    availability = patterns
    return patterns
  },

  // GET /tasks?status=UNASSIGNED — the unplaced backlog, optionally filtered to a
  // project (PROJ-15/19 entry). Returns the `{ tasks }` envelope body shape.
  async getUnplacedTasks(projectId) {
    await delay(60)
    // Never-placed backlog + remainders of partially-placed tasks (A4).
    const all = [...unplacedTasks, ...placedRemainders()]
    const tasks = projectId ? all.filter((t) => t.projectId === projectId) : all
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
    await delay(220) // a visible "배치 중…" beat, without feeling stuck
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
    await delay(80)
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
      // TASK: the task stays in placedTaskData; removing its block(s) just raises
      // its unplaced remainder (full est when none remain) — PLAN-16 via A4 model.
      // SCHEDULE: gone for good.
      if (block.blockType === 'TASK' && block.taskId) {
        // Safety net: if it was never routed through placedTaskData, seed it now
        // so the freed time reappears in the backlog.
        if (!placedTaskData.has(block.taskId)) {
          placedTaskData.set(block.taskId, {
            taskId: block.taskId,
            title: block.title,
            estimatedMinutes: block.estimatedMinutes ??
              Math.round((new Date(block.endAt) - new Date(block.startAt)) / 60000),
            priority: block.priority ?? 2,
            projectId: block.projectId ?? null,
            projectName: block.projectName ?? null,
            dueDate: null,
            reason: null,
          })
        }
        return { message: 'UNASSIGNED' }
      }
      return { message: 'DELETED' }
    }
    // Idempotent: a block already gone (e.g. an optimistic temp-id that reconciled
    // to a real id before this landed) is treated as deleted, not an error.
    return { message: 'DELETED' }
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

  // POST /weekly-plans/{id}/validation-issues — the dry-run (ST-F1-05 AC-1). Runs
  // the rules against the CLIENT's block set (the unsaved draft), never the stored
  // one, and writes nothing. Kept fast on purpose: the whole loop — local change →
  // 300ms debounce → this call → badge update — has a 1s budget (NFR-025).
  async validatePlan(weeklyPlanId, blocks) {
    await delay(50)
    const week = findWeekByPlanId(weeklyPlanId)
    if (!week) throw new Error(`mock: plan ${weeklyPlanId} not found`)
    const issues = computeValidationIssues(week.weekStartDate, blocks ?? []).map((issue) => ({
      ...issue,
      severity: MOCK_BLOCKING_CODES.has(issue.code) ? 'blocking' : 'warning',
    }))
    return { issues }
  },

  // PUT /weekly-plans/{weeklyPlanId} — PLAN-03 저장(확정). Flips the week to
  // CONFIRMED and bumps `version`, which is what a real optimistic-lock 409 would
  // key off; the mock never rejects, so the 409 path is exercised against a real
  // server (or by pointing at one) rather than simulated here.
  async saveWeek(weeklyPlanId, body) {
    await delay()
    const week = findWeekByPlanId(weeklyPlanId)
    if (!week) throw new Error(`mock: plan ${weeklyPlanId} not found`)
    week.status = body?.status ?? 'CONFIRMED'
    week.version += 1
    return { weeklyPlanId }
  },

  // POST /tasks/{taskId}/execution-records — PLAN-15 실제 시간 기록 (write-only).
  async logExecution(taskId, body) {
    await delay(150)
    const executionRecordId = nextId('exec')
    executionRecords.push({ executionRecordId, taskId, ...body })
    return { executionRecordId }
  },

  // POST /weekly-plans/{id}/replan-options — ST-F1-07 PLAN-29. Runs ONE strategy
  // against the CURRENT (unsaved) block set — a longer delay than most writes
  // here on purpose (220ms, matching autoPlace's own "visible beat" choice): the
  // modal's 5-second slow notice (NFR-029) needs something to eventually notice
  // in a slow/real environment, and disappearing instantly would never exercise it.
  async generateReplanOption(weeklyPlanId, strategyType) {
    await delay(220)
    const week = findWeekByPlanId(weeklyPlanId)
    if (!week) throw new Error(`mock: plan ${weeklyPlanId} not found`)
    const option = buildReplanOption(week, computeDerived(week).blocks, strategyType)
    if (!option) return { replanOptions: [] }
    const replanOptionId = nextId('replan')
    // Remembered so a later selectReplanOption(id) can find its proposedBlocks
    // (see replanOptionsById's header comment above).
    replanOptionsById.set(replanOptionId, { ...option, weeklyPlanId })
    return { replanOptions: [{ ...option, replanOptionId }] }
  },

  // PATCH /replan-options/{id}/selection — ST-F1-07 AC-3 "초안 교체 반영". The
  // real endpoint returns only a message (no updated week), so the client always
  // refetches after this resolves; this mock just needs to make that refetch
  // return the swapped blocks. FIXED schedules are never plan_blocks, so nothing
  // about them needs preserving here — only week.blocks is replaced.
  async selectReplanOption(replanOptionId) {
    await delay()
    const option = replanOptionsById.get(replanOptionId)
    if (!option) throw new Error(`mock: replan option ${replanOptionId} not found`)
    const week = findWeekByPlanId(option.weeklyPlanId)
    if (!week) throw new Error(`mock: plan ${option.weeklyPlanId} not found`)
    week.blocks = option.proposedBlocks.map((b) => ({ ...b }))
    return { message: 'APPLIED' }
  },
}

export default mockBackend
