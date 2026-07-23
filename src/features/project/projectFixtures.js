/*
  DEV-ONLY in-memory mock backend for the project screens (ST-F1-08). Same
  reasoning as planFixtures.js: the 07 API 명세서 is the real contract but no
  server implements it yet, so projectApi.js calls the real endpoint first and
  only falls back here on a network error (DEV only). State is module-level and
  mutable so create/edit/delete/status changes persist for the session.
*/

const MOCK_LATENCY_MS = 70
const delay = (ms = MOCK_LATENCY_MS) => new Promise((r) => setTimeout(r, ms))

let uid = 100
const nextId = (prefix) => `${prefix}-${(uid += 1)}`

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
    mkTask(p1, '그래프 탐색 문제풀이', 90, 1, iso(10), 'UNASSIGNED'),
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
    mkTask(p2, '알고리즘 문제 풀이 세트', 60, 2, null, 'UNASSIGNED'),
    mkTask(p2, '자료구조 복습 문제', 60, 2, iso(25), 'UNASSIGNED'),
    mkTask(p2, 'SQL 문제풀이', 45, 3, null, 'IN_PROGRESS'),
    mkTask(p2, '시스템 설계 스터디', 90, 1, iso(28), 'COMPLETED'),
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

function mkTask(projectId, title, estimatedMinutes, priority, dueDate, status) {
  return {
    taskId: nextId('task'),
    projectId,
    title,
    memo: '',
    estimatedMinutes,
    priority,
    dueDate,
    status,
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
    )
    task.memo = body.memo ?? ''
    tasksByProject.set(projectId, [task, ...(tasksByProject.get(projectId) ?? [])])
    return { taskId: task.taskId }
  },

  // PATCH /tasks/{taskId} (G-1, owner review 2026-07-24) — no `projectId` in
  // the signature (matches updateTaskSchedule's own shape below), so this
  // scans every project's task list the same way that one does. `dueDate`
  // is checked against `undefined` rather than `?? task.dueDate` on purpose
  // — the edit form can legitimately clear a due date back to null, and `??`
  // would treat that null as "not provided" and silently keep the old value.
  async updateTask(taskId, body) {
    await delay()
    for (const tasks of tasksByProject.values()) {
      const task = tasks.find((t) => t.taskId === taskId)
      if (!task) continue
      Object.assign(task, {
        title: body.title ?? task.title,
        estimatedMinutes: body.estimatedMinutes ?? task.estimatedMinutes,
        priority: body.priority ?? task.priority,
        dueDate: body.dueDate !== undefined ? body.dueDate : task.dueDate,
        memo: body.memo ?? task.memo,
      })
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

  // GET /projects/{id}/validation-issues — RB-PROJ-02. Real, derived checks
  // over this mock's own task store (same "computed, not canned" principle
  // planFixtures.computeValidationIssues uses) so every warning can be
  // produced/cleared by editing tasks in the browser.
  async getStructureWarnings(projectId) {
    await delay(60)
    const project = requireProject(projectId)
    const tasks = tasksByProject.get(projectId) ?? []
    const issues = []

    if (tasks.length > 0 && tasks.length < 3) {
      issues.push({ code: 'P-TASK-COUNT', severity: 'warning', params: { count: tasks.length } })
    }
    const noEstimate = tasks.filter((t) => !t.estimatedMinutes || t.estimatedMinutes <= 0)
    if (noEstimate.length > 0) {
      issues.push({ code: 'P-NO-ESTIMATE', severity: 'warning', params: { count: noEstimate.length } })
    }
    if (project.dueDate) {
      const remaining = tasks.filter((t) => t.status !== 'COMPLETED').length
      const daysLeft = Math.round((new Date(project.dueDate) - new Date()) / (24 * 60 * 60 * 1000))
      if (daysLeft >= 0 && daysLeft < remaining) {
        issues.push({
          code: 'P-DEADLINE-LOAD',
          severity: 'warning',
          params: { count: remaining, dueDate: project.dueDate },
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
