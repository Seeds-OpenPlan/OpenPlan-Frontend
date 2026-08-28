/*
  DEV-ONLY in-memory mock backend for the project screens (ST-F1-08). Same
  reasoning as planFixtures.js: the 07 API 명세서 is the real contract but no
  server implements it yet, so projectApi.js calls the real endpoint first and
  only falls back here on a network error (DEV only). State is module-level and
  mutable so create/edit/delete/status changes persist for the session.
*/

import { SEED_CATEGORY_IDS } from './taskCategorySeedIds'

const MOCK_LATENCY_MS = 70
const delay = (ms = MOCK_LATENCY_MS) => new Promise((r) => setTimeout(r, ms))

let uid = 100
const nextId = (prefix) => `${prefix}-${(uid += 1)}`

// W3 — the old static CATEGORY_LIST placeholder is gone (moved to a real
// CRUD resource, see taskCategoryFixtures.js's own header). Seed tasks below
// now reference one of taskCategorySeedIds.js's real preset ids instead of a
// raw string, via SEED_CATEGORY_IDS imported below. Deliberately only
// 코딩테스트/취업준비 have a correction proposal (statsFixtures.js) —
// 자기계발 having NONE is itself a state worth keeping reachable (AC-2's
// chip must stay hidden for it).

// A task counts as "마감 임박" within this many days of its due date (and not
// yet completed). ASSUMPTION: no rule document fixes this number for
// PROJECTS specifically — 3 days mirrors the "곧" horizon the reference
// design's red badge implies. Change here when a real rule lands.
const DUE_SOON_DAYS = 3

function isDueSoon(task) {
  if (!task.dueDate || task.status === 'COMPLETED') return false
  const diffDays = Math.round((new Date(task.dueDate) - new Date()) / (24 * 60 * 60 * 1000))
  return diffDays >= 0 && diffDays <= DUE_SOON_DAYS
}

// project_id -> project record (ERD projects shape, camelCase).
const projects = new Map()
// project_id -> Task[] (ERD tasks shape, camelCase).
const tasksByProject = new Map()
// draft_id -> { projectId, tasks: [{taskDraftId, title, estimatedMinutes, priority}] }
const draftsById = new Map()
// project_id -> wbs node overrides (taskId -> {plannedStartDate, plannedEndDate})
const wbsByProject = new Map()

function seed() {
  const today = new Date()
  const iso = (offsetDays) => {
    const d = new Date(today)
    d.setDate(d.getDate() + offsetDays)
    return d.toISOString().slice(0, 10)
  }

  const p1 = nextId('proj')
  projects.set(p1, {
    projectId: p1,
    name: '자료구조',
    description: '알고리즘 스터디 대비 자료구조 정리',
    dueDate: iso(14),
    status: 'IN_PROGRESS',
    priority: 1,
    closedAt: null,
    version: 1,
  })
  // D-4 (owner review 2026-07-23): denser than the original 4 tasks, so the
  // 태스크 탭 reads closer to real usage density instead of mostly whitespace.
  tasksByProject.set(p1, [
    mkTask(p1, '트리 순회 정리', 60, 1, iso(2), 'IN_PROGRESS'),
    mkTask(p1, '그래프 탐색 문제풀이', 90, 1, iso(10), 'UNASSIGNED', SEED_CATEGORY_IDS.코딩테스트),
    mkTask(p1, '해시맵 구현 복습', 45, 2, null, 'COMPLETED'),
    mkTask(p1, '스택/큐 요약 노트', 30, 3, iso(20), 'COMPLETED'),
    mkTask(p1, '동적 계획법 문제풀이', 90, 1, iso(12), 'UNASSIGNED'),
    mkTask(p1, '정렬 알고리즘 비교표 정리', 45, 2, iso(8), 'IN_PROGRESS'),
  ])

  const p2 = nextId('proj')
  projects.set(p2, {
    projectId: p2,
    name: '코딩 테스트',
    description: '',
    dueDate: iso(30),
    status: 'IN_PROGRESS',
    priority: 2,
    closedAt: null,
    version: 1,
  })
  tasksByProject.set(p2, [
    mkTask(p2, '알고리즘 문제 풀이 세트', 60, 2, null, 'UNASSIGNED', SEED_CATEGORY_IDS.코딩테스트),
    mkTask(p2, '자료구조 복습 문제', 60, 2, iso(25), 'UNASSIGNED'),
    mkTask(p2, 'SQL 문제풀이', 45, 3, null, 'IN_PROGRESS'),
    mkTask(p2, '시스템 설계 스터디', 90, 1, iso(28), 'COMPLETED', SEED_CATEGORY_IDS.자기계발),
  ])

  // A project with zero tasks — RB-PROJ-01's structuring-draft entry point.
  const p3 = nextId('proj')
  projects.set(p3, {
    projectId: p3,
    name: '졸업 프로젝트 발표',
    description: '',
    dueDate: iso(45),
    status: 'IN_PROGRESS',
    priority: 2,
    closedAt: null,
    version: 1,
  })
  tasksByProject.set(p3, [])

  // A CLOSED project — the 종료 탭 + PROJ-08 auto-close caption path.
  const p4 = nextId('proj')
  projects.set(p4, {
    projectId: p4,
    name: '어학 자격증',
    // A-5 fix: this used to be the SAME string as ProjectCard's hardcoded
    // auto-close caption, which is exactly what made the caption look like it
    // was rendering `description` (it wasn't — the card never reads this
    // field at all). Kept deliberately different so nobody mistakes the
    // coincidence for a real data binding again.
    description: '토익·오픽 목표 점수 달성을 위한 학습 계획',
    dueDate: iso(-5),
    status: 'CLOSED',
    priority: 3,
    closedAt: new Date().toISOString(),
    version: 1,
  })
  tasksByProject.set(p4, [mkTask(p4, '단어 암기', 30, 2, iso(-5), 'COMPLETED')])

  // A PAUSED project — the 보류 탭 (A-2) had no seed data at all until now,
  // so it always rendered empty regardless of which tab the owner opened.
  const p5 = nextId('proj')
  projects.set(p5, {
    projectId: p5,
    name: '사이드 프로젝트 리뉴얼',
    description: '우선순위가 밀려 잠시 보류 중',
    dueDate: iso(60),
    status: 'PAUSED',
    priority: 3,
    closedAt: null,
    version: 1,
  })
  tasksByProject.set(p5, [
    mkTask(p5, '기존 코드베이스 점검', 60, 2, null, 'COMPLETED'),
    mkTask(p5, '리뉴얼 범위 정의', 45, 2, null, 'UNASSIGNED'),
  ])
}

// `categoryId` defaults to null ("없음") and `version` always starts at 1 —
// the optimistic-lock counter ST-F1-09 AC-4 bumps on every successful PATCH
// (see mockBackend.updateTask below). Every existing call site
// (5-arg-plus-status) keeps working unchanged; only the few seed tasks below
// that opt into a category pass the new trailing arg (one of
// taskCategorySeedIds.SEED_CATEGORY_IDS' real preset ids, W3 — this field
// used to hold a raw category NAME string before the real /task-categories
// resource existed; see projectApi.normalizeTask's own comment on the rename).
//
// `updatedAt` ([가정—신규], ST-F1-09 code review, Thomas item 5): no record in
// this codebase carried a save timestamp before this — ConflictOverlay.jsx's
// own `formatSavedAt` has always read `latest?.updatedAt`, but nothing ever
// populated it, so its "최신 저장 정보" box silently never rendered for a task
// conflict. Stamped at creation here and re-stamped on every successful
// updateTask (below) — the same "last write wins the timestamp" semantic a
// real `tasks.updated_at` column would have.
function mkTask(projectId, title, estimatedMinutes, priority, dueDate, status, categoryId = null) {
  return {
    taskId: nextId('task'),
    projectId,
    title,
    memo: '',
    estimatedMinutes,
    priority,
    dueDate,
    status,
    categoryId,
    version: 1,
    updatedAt: new Date().toISOString(),
  }
}

seed()

// Derive the list-card / WS-header aggregate counts from the task store — see
// projectApi.js's ASSUMPTION note on why the real endpoint may not send these.
function withAggregates(project) {
  const tasks = tasksByProject.get(project.projectId) ?? []
  const completedCount = tasks.filter((t) => t.status === 'COMPLETED').length
  const placedCount = tasks.filter((t) => t.status === 'IN_PROGRESS').length
  const unplacedCount = tasks.filter((t) => t.status === 'UNASSIGNED').length
  const dueSoonCount = tasks.filter(isDueSoon).length
  return {
    ...project,
    taskCount: tasks.length,
    completedCount,
    placedCount,
    unplacedCount,
    dueSoonCount,
  }
}

function requireProject(projectId) {
  const project = projects.get(projectId)
  if (!project) {
    const err = new Error(`mock: project ${projectId} not found`)
    err.status = 404
    throw err
  }
  return project
}

export const mockBackend = {
  async getProjects() {
    await delay(80)
    return { projects: Array.from(projects.values()).map(withAggregates) }
  },

  async getProject(projectId) {
    await delay(60)
    return withAggregates(requireProject(projectId))
  },

  async createProject(body) {
    await delay()
    const projectId = nextId('proj')
    const project = {
      projectId,
      name: body.name ?? '',
      description: body.description ?? '',
      dueDate: body.dueDate ?? null,
      status: 'IN_PROGRESS',
      priority: body.priority ?? 2,
      closedAt: null,
      version: 1,
    }
    projects.set(projectId, project)
    tasksByProject.set(projectId, [])
    return { projectId }
  },

  async updateProject(projectId, body) {
    await delay()
    const project = requireProject(projectId)
    Object.assign(project, {
      name: body.name ?? project.name,
      description: body.description ?? project.description,
      dueDate: body.dueDate ?? project.dueDate,
      priority: body.priority ?? project.priority,
      ...(body.status ? { status: body.status } : {}),
    })
    project.version += 1
    return { message: 'UPDATED' }
  },

  async updateProjectStatus(projectId, status) {
    await delay()
    const project = requireProject(projectId)
    project.status = status
    project.closedAt = status === 'CLOSED' ? new Date().toISOString() : null
    project.version += 1
    return { message: 'STATUS_UPDATED' }
  },

  async deleteProject(projectId) {
    await delay()
    projects.delete(projectId)
    tasksByProject.delete(projectId)
    return { message: 'DELETED' }
  },

  async getProjectTasks(projectId) {
    await delay(60)
    requireProject(projectId)
    return { tasks: (tasksByProject.get(projectId) ?? []).map((t) => ({ ...t, dueSoon: isDueSoon(t) })) }
  },

  async createTask(projectId, body) {
    await delay()
    requireProject(projectId)
    const task = mkTask(
      projectId,
      body.title ?? '',
      body.estimatedMinutes ?? 60,
      body.priority ?? 2,
      body.dueDate ?? null,
      'UNASSIGNED',
      body.categoryId ?? null,
    )
    task.memo = body.memo ?? ''
    tasksByProject.set(projectId, [task, ...(tasksByProject.get(projectId) ?? [])])
    return { taskId: task.taskId }
  },

  // GET /tasks/{taskId} ([가정—신규], ST-F1-09) — see projectApi.getTask's own
  // header comment for the full contract, including the cross-store gap with
  // the weekly-plan mock's own separate seed data.
  async getTask(taskId) {
    await delay(60)
    for (const [projectId, tasks] of tasksByProject.entries()) {
      const task = tasks.find((t) => t.taskId === taskId)
      if (task) return { ...task, projectId, dueSoon: isDueSoon(task) }
    }
    const err = new Error('mock: task not found')
    err.status = 404
    throw err
  },

  // PATCH /tasks/{taskId} (G-1, owner review 2026-07-24) — no `projectId` in
  // the signature (matches updateTaskSchedule's own shape below), so this
  // scans every project's task list the same way that one does. `dueDate`
  // is checked against `undefined` rather than `?? task.dueDate` on purpose
  // — the edit form can legitimately clear a due date back to null, and `??`
  // would treat that null as "not provided" and silently keep the old value.
  // The same `undefined`-check treatment now applies to `categoryId` (also
  // legitimately clearable back to "없음"/null, exactly like dueDate above —
  // W3 rename from the old `category` string field, see mkTask's own comment).
  // `status` (SCR-TASK-EDIT's own 상태 field — a SEPARATE write path from the
  // plan feature's own PATCH /tasks/{id}/status toggle in
  // taskApi.js/planFixtures.js; both exist in this codebase, targeting
  // disjoint mock task stores — see this task store's own cross-store-gap
  // note on getTask above) stays a plain `??` on purpose, UNLIKE dueDate/
  // categoryId: the edit form's 상태 라디오 group has no "clear to blank" state
  // — it is always exactly one of the three enum values — so there is no
  // legitimate falsy value for `??` to wrongly treat as "not provided".
  //
  // [가정—신규] (ST-F1-09 AC-4): `body.version`, when present, is checked
  // against the stored task's own `version` — the optimistic-lock contract
  // every other write here (create/delete/schedule) never needed. A mismatch
  // throws an AppError-SHAPED error directly (code/status/details already in
  // the exact fields the api client's normalizeError would have produced for
  // a real 409), because this rejection never passes through the axios
  // interceptor — withDevFallback only catches a NETWORK failure and calls
  // straight into this mock function; whatever this throws is exactly what
  // the caller (useUpdateTask's onError) receives. `body.version == null`
  // (the pre-existing TaskCreateForm edit path, which never sent a version)
  // skips the check entirely — unchanged, non-breaking behavior for that
  // caller.
  async updateTask(taskId, body) {
    await delay()
    for (const tasks of tasksByProject.values()) {
      const task = tasks.find((t) => t.taskId === taskId)
      if (!task) continue
      if (body.version != null && body.version !== task.version) {
        const err = new Error('mock: task version conflict')
        err.code = 'E-COM-006'
        err.status = 409
        err.details = { latest: { ...task, dueSoon: isDueSoon(task) } }
        throw err
      }
      Object.assign(task, {
        title: body.title ?? task.title,
        estimatedMinutes: body.estimatedMinutes ?? task.estimatedMinutes,
        priority: body.priority ?? task.priority,
        dueDate: body.dueDate !== undefined ? body.dueDate : task.dueDate,
        status: body.status ?? task.status,
        categoryId: body.categoryId !== undefined ? body.categoryId : task.categoryId,
        memo: body.memo ?? task.memo,
      })
      task.version = (task.version ?? 1) + 1
      task.updatedAt = new Date().toISOString()
      return { message: 'UPDATED' }
    }
    const err = new Error('mock: task not found')
    err.status = 404
    throw err
  },

  // DELETE /tasks/{taskId} (G-1).
  async deleteTask(taskId) {
    await delay()
    for (const tasks of tasksByProject.values()) {
      const idx = tasks.findIndex((t) => t.taskId === taskId)
      if (idx === -1) continue
      tasks.splice(idx, 1)
      return { message: 'DELETED' }
    }
    const err = new Error('mock: task not found')
    err.status = 404
    throw err
  },

  // GET /projects/{id}/structure-warnings — RB-PROJ-02 (W6 계약 정합
  // 2026-08-28). 실서버 응답 모양은 `{warningType, reason, action}`이고
  // `reason`은 서버가 완성 문장으로 준다 — 이 목도 같은 모양으로 맞춘다
  // (예전 `{code, severity, params}`는 실계약에 없는 목 전용 발명품이었고,
  // StructureWarningBanner.jsx가 그 문구를 다시 조립하던 원인이었다). 여전히
  // 이 mock 스토어의 실제 태스크 상태로부터 매번 계산한다("computed, not
  // canned", planFixtures.computeValidationIssues와 같은 원칙) — 브라우저에서
  // 태스크를 편집하면 경고가 그대로 생기고 사라진다.
  async getStructureWarnings(projectId) {
    await delay(60)
    const project = requireProject(projectId)
    const tasks = tasksByProject.get(projectId) ?? []
    const issues = []

    if (tasks.length > 0 && tasks.length < 3) {
      issues.push({
        warningType: 'TOO_FEW_TASKS',
        reason: `태스크가 ${tasks.length}개뿐입니다. 계획 전에 작업을 더 나눠 주세요.`,
        action: 'ADD_TASK',
      })
    }
    const noEstimate = tasks.filter((t) => !t.estimatedMinutes || t.estimatedMinutes <= 0)
    if (noEstimate.length > 0) {
      issues.push({
        warningType: 'MISSING_ESTIMATES',
        reason: `예상시간이 비어 있는 태스크가 ${noEstimate.length}개 있습니다. 입력해야 배치 검증이 정확해집니다.`,
        action: 'EDIT_TASK',
      })
    }
    if (project.dueDate) {
      const remaining = tasks.filter((t) => t.status !== 'COMPLETED').length
      const daysLeft = Math.round((new Date(project.dueDate) - new Date()) / (24 * 60 * 60 * 1000))
      if (daysLeft >= 0 && daysLeft < remaining) {
        // 실서버 실측 문구(팀장 보고 예시)와 동일한 형태로 맞춘다:
        // "마감까지 1일, 미완료 태스크가 3건 남았습니다." — 서버가 주는
        // 완성 문장을 목이 그대로 흉내 낸 것이지, 목이 독자적으로 지은 게
        // 아니다.
        issues.push({
          warningType: 'DEADLINE_PRESSURE',
          reason: `마감까지 ${daysLeft}일, 미완료 태스크가 ${remaining}건 남았습니다.`,
          action: 'EDIT_TASK',
        })
      }
    }
    return { issues }
  },

  async createStructuringDraft(projectId, body) {
    await delay(300) // a visible "만들고 있습니다…" beat
    const project = requireProject(projectId)
    if (!project.description && !body.goal && !project.dueDate) {
      const err = new Error('mock: insufficient input for structuring draft')
      err.status = 422
      throw err
    }
    const draftId = nextId('draft')
    const proposals = [
      { title: '요구사항 정리', estimatedMinutes: 30, priority: 2 },
      { title: '자료 조사', estimatedMinutes: 60, priority: 1 },
      { title: '초안 검토', estimatedMinutes: 30, priority: 3 },
    ].map((t) => ({ taskDraftId: nextId('draft-task'), ...t }))
    draftsById.set(draftId, { projectId, tasks: proposals })
    return { draftId, tasks: proposals }
  },

  async applyStructuringDraft(projectId, draftId, selectedTaskIds) {
    await delay()
    requireProject(projectId)
    const draft = draftsById.get(draftId)
    if (!draft) {
      const err = new Error('mock: draft not found')
      err.status = 404
      throw err
    }
    const selected = new Set(selectedTaskIds)
    const created = draft.tasks
      .filter((t) => selected.has(t.taskDraftId))
      .map((t) => mkTask(projectId, t.title, t.estimatedMinutes, t.priority, null, 'UNASSIGNED'))
    tasksByProject.set(projectId, [...created, ...(tasksByProject.get(projectId) ?? [])])
    draftsById.delete(draftId)
    return { createdTaskIds: created.map((t) => t.taskId) }
  },

  // GET /projects/{id}/wbs — §PROJ.3. A node per task that HAS a planned
  // range; a task with none is a "미설정 행" the UI offers [기간 설정] for.
  async getProjectWbs(projectId) {
    await delay(60)
    requireProject(projectId)
    const overrides = wbsByProject.get(projectId) ?? new Map()
    const tasks = tasksByProject.get(projectId) ?? []
    const nodes = tasks.map((t) => {
      const range = overrides.get(t.taskId)
      return {
        taskId: t.taskId,
        title: t.title,
        estimatedMinutes: t.estimatedMinutes,
        plannedStartDate: range?.plannedStartDate ?? null,
        plannedEndDate: range?.plannedEndDate ?? null,
      }
    })
    return { nodes }
  },

  async updateTaskSchedule(taskId, { plannedStartDate, plannedEndDate }) {
    await delay()
    for (const [projectId, tasks] of tasksByProject.entries()) {
      if (!tasks.some((t) => t.taskId === taskId)) continue
      if (!wbsByProject.has(projectId)) wbsByProject.set(projectId, new Map())
      wbsByProject.get(projectId).set(taskId, { plannedStartDate, plannedEndDate })
      return { message: 'UPDATED' }
    }
    return { message: 'UPDATED' }
  },
}

export default mockBackend
