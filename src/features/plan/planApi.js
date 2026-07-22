/*
  OP functions for the weekly plan (ux-flow-map §2, api-contracts §2.7). Each maps
  1:1 to an endpoint. Consumers (the TanStack Query hooks) call ONLY these — never
  apiClient directly — so the OP↔endpoint mapping lives in exactly one place.

  DEV fallback: on a network error in development the call is served from the
  in-memory mock backend so the screen is buildable before BE-1's Swagger is up.
  In production (or against any reachable server) the real path runs untouched,
  keeping the mock→real switch a base-URL change only (build-plan §3).
*/

import { apiClient } from '../../api/client'
import { mockBackend } from './planFixtures'
import { UNSPECIFIED_CONFLICT_CODE, violationSeverity } from './violationMessages'

// Run the real call; in DEV, fall back to the mock ONLY for genuine network
// failures (no server). Any real HTTP error (4xx/5xx) propagates unchanged so
// error handling and rollback are exercised against real responses. Exported so
// sibling OP modules (taskApi) share one definition of the mock-fallback rule.
export async function withDevFallback(realCall, mockCall) {
  try {
    return await realCall()
  } catch (error) {
    if (import.meta.env.DEV && error?.isNetwork) return mockCall()
    throw error
  }
}

/**
 * Normalize a server week payload to the camelCase shape the UI reads. Tolerates
 * either snake_case (server) or camelCase (mock) so the exact envelope field
 * casing — unconfirmed until Swagger — is absorbed in this one adapter.
 */
function normalizeBlock(b) {
  return {
    planBlockId: b.planBlockId ?? b.plan_block_id,
    blockType: b.blockType ?? b.block_type,
    title: b.title,
    tone: b.tone ?? null,
    status: b.status,
    taskId: b.taskId ?? b.task_id ?? null,
    scheduleId: b.scheduleId ?? b.schedule_id ?? null,
    startAt: b.startAt ?? b.start_at,
    endAt: b.endAt ?? b.end_at,
    // SCHEDULE-block extras (PLAN-17 편집 프리필); null on TASK blocks.
    memo: b.memo ?? null,
    estimatedMinutes: b.estimatedMinutes ?? b.estimated_minutes ?? null,
    priority: b.priority ?? null,
    // TASK-block project link (PLAN-12 프로젝트에서 보기); null when unknown.
    projectId: b.projectId ?? b.project_id ?? null,
    projectName: b.projectName ?? b.project_name ?? null,
  }
}

function normalizeWeek(w) {
  return {
    weeklyPlanId: w.weeklyPlanId ?? w.weekly_plan_id,
    weekStartDate: w.weekStartDate ?? w.week_start_date,
    weekEndDate: w.weekEndDate ?? w.week_end_date,
    status: w.status ?? 'DRAFT',
    version: w.version ?? 1,
    totalPlannedMinutes: w.totalPlannedMinutes ?? w.total_planned_minutes ?? 0,
    unplacedCount: w.unplacedCount ?? w.unplaced_count ?? 0,
    validation: w.validation ?? { blockCount: 0, warningCount: 0 },
    blocks: (w.blocks ?? []).map(normalizeBlock),
  }
}

function normalizeAvailability(patterns) {
  return (patterns ?? []).map((a) => ({
    weekday: a.weekday,
    startMinutes: a.startMinutes ?? a.start_minutes,
    endMinutes: a.endMinutes ?? a.end_minutes,
    isActive: a.isActive ?? a.is_active ?? true,
  }))
}

/** OP-PLAN-GETWEEK → GET /weekly-plans?weekStartDate= */
export function getWeek(weekStartDate) {
  return withDevFallback(
    () => apiClient.get('/weekly-plans', { params: { weekStartDate } }),
    () => mockBackend.getWeek(weekStartDate),
  ).then(normalizeWeek)
}

/** GET /users/me/availabilities (read side of the availability contract). */
export function getAvailability() {
  return withDevFallback(
    () => apiClient.get('/users/me/availabilities'),
    () => mockBackend.getAvailability(),
  ).then(normalizeAvailability)
}

/**
 * Block write → PATCH /plan-blocks/{id}. `patch` carries startAt/endAt (and,
 * for a week-boundary move, __targetWeek so the mock can migrate stores; the
 * real server infers the target week from start_at).
 */
export function patchBlock(planBlockId, patch) {
  // __targetWeek is a client-only hint for the mock's cross-week migration; the
  // real server infers the target week from start_at, so strip it before PATCH.
  const serverPatch = { ...patch }
  delete serverPatch.__targetWeek
  return withDevFallback(
    () => apiClient.patch(`/plan-blocks/${planBlockId}`, serverPatch),
    () => mockBackend.patchBlock(planBlockId, patch),
  )
}

/** 가용 저장 → PUT /users/me/availabilities (full replace). */
export function putAvailabilities(patterns) {
  return withDevFallback(
    () => apiClient.put('/users/me/availabilities', { patterns }),
    () => mockBackend.putAvailabilities(patterns),
  ).then(normalizeAvailability)
}

/**
 * Block delete → DELETE /plan-blocks/{id}. Used by both PLAN-18 (일정 삭제) and
 * PLAN-16 (배치 해제): a SCHEDULE block is deleted; a TASK block is removed and its
 * task returns to the unplaced backlog (the server decides by block type).
 */
export function deleteBlock(planBlockId) {
  return withDevFallback(
    () => apiClient.delete(`/plan-blocks/${planBlockId}`),
    () => mockBackend.deleteBlock(planBlockId),
  )
}

// --- ST-F1-05: validation dry-run · week confirm --------------------------------

// Envelope keys that are structure, not copy variables. Everything NOT in here
// becomes a `params` entry, so a rule that starts sending a new variable needs no
// adapter change — only the catalog message that reads it.
const ISSUE_STRUCTURE_KEYS = new Set([
  'id',
  'issueId',
  'code',
  'rule',
  'ruleCode',
  'severity',
  'targetBlockIds',
  'target_block_ids',
  'blockIds',
  'block_ids',
  'planBlockId',
  'params',
])

/**
 * Normalize one validation issue. The response shape is only pinned down to
 * "issues: []" by the spec, so this adapter is deliberately tolerant: it accepts
 * either an explicit `params` object or the copy variables spread at the top
 * level, and either a single target id or a list. Everything the copy catalog
 * needs ends up under `params`; everything the UI needs to point at a block ends
 * up in `targetBlockIds`.
 *
 * `severity` is resolved through the catalog — for a KNOWN code the client's
 * table wins so the save gate is deterministic; an unknown code keeps the
 * server's severity (see violationMessages.js).
 */
function normalizeIssue(raw, index) {
  const code = raw.code ?? raw.rule ?? raw.ruleCode ?? 'UNKNOWN'
  const rawTargets =
    raw.targetBlockIds ??
    raw.target_block_ids ??
    raw.blockIds ??
    raw.block_ids ??
    (raw.planBlockId ? [raw.planBlockId] : [])
  // Array.isArray guard, not a bare .filter: a server sending a single id as a
  // STRING (or an object) would otherwise throw here, and a throw in this
  // adapter turns a perfectly good validation response into a "검증 실패", which
  // is the one state where the gate has the least information to work with.
  const targetBlockIds = Array.isArray(rawTargets)
    ? rawTargets.filter(Boolean)
    : [rawTargets].filter((id) => typeof id === 'string' && id.length > 0)
  const params =
    raw.params ??
    Object.fromEntries(Object.entries(raw).filter(([key]) => !ISSUE_STRUCTURE_KEYS.has(key)))
  return {
    // A stable key for the list. The server may not send an id, so a code+index
    // composite is the fallback — issues are re-created wholesale per dry-run,
    // never patched in place, so index stability within one response is enough.
    id: raw.id ?? raw.issueId ?? `${code}-${index}`,
    code,
    severity: violationSeverity(code, raw.severity),
    targetBlockIds,
    params,
  }
}

/**
 * Normalize a `{ issues }` payload into what the UI consumes. Exported because
 * the SAME shape arrives by two routes: the dry-run response, and a save 409's
 * `details.issues` (AC-4) — both must produce identical panel rows and counts.
 *
 * The counts are DERIVED here rather than read from the payload: the spec does
 * not promise them, and deriving keeps them consistent with the client-side
 * severity table that the save gate uses.
 */
export function normalizeValidationPayload(payload) {
  const issues = (payload?.issues ?? []).map(normalizeIssue)
  return {
    issues,
    blockingCount: issues.filter((i) => i.severity === 'blocking').length,
    warningCount: issues.filter((i) => i.severity !== 'blocking').length,
  }
}

/**
 * OP-PLAN-VALIDATE → POST /weekly-plans/{weeklyPlanId}/validation-issues (dry-run;
 * writes nothing). Body carries the LOCAL block set so the check reflects the
 * user's unsaved draft, not the last persisted plan.
 *
 * ENDPOINT NOTE: the FE-1 작업지시 writes this as `.../validations`; the BE 명세서
 * (07번) says `.../validation-issues` and that spec is authoritative.
 *
 * STATUS BRANCHES ARE RESULTS, NOT FAILURES. The spec lists 200 검증 통과 · 206
 * 일부 블록만 통과 · 409 일정 충돌 발견 as three outcomes of the SAME successful check.
 * axios resolves 2xx only, so 200/206 arrive here normally but 409 arrives as a
 * rejection — and rejecting it would be a silent, dangerous mistranslation: the
 * caller treats a rejection as "검증 못 함", keeps its last known counts (often
 * zero) and leaves the save button enabled. A 409 means the OPPOSITE of clean, so
 * it is converted back into a result here:
 *   409 + details.issues → those issues, exactly like a 200 body
 *   409 without issues   → one UNSPECIFIED_CONFLICT_CODE issue, which is blocking,
 *                          so the gate closes even though nothing can be pointed at
 * Every other status still rejects and is handled as a genuine failure upstream.
 */
export function validatePlan(weeklyPlanId, blocks) {
  const body = {
    blocks: (blocks ?? []).map((b) => ({
      planBlockId: b.planBlockId,
      blockType: b.blockType,
      title: b.title,
      taskId: b.taskId ?? null,
      scheduleId: b.scheduleId ?? null,
      startAt: b.startAt,
      endAt: b.endAt,
      status: b.status,
    })),
  }
  return withDevFallback(
    () => apiClient.post(`/weekly-plans/${weeklyPlanId}/validation-issues`, body),
    () => mockBackend.validatePlan(weeklyPlanId, body.blocks),
  ).then(normalizeValidationPayload, (error) => {
    if (error?.status !== 409) throw error
    const issues = error?.details?.issues
    return normalizeValidationPayload({
      issues: Array.isArray(issues) ? issues : [{ code: UNSPECIFIED_CONFLICT_CODE }],
    })
  })
}

/**
 * OP-PLAN-SAVEWEEK → PUT /weekly-plans/{weeklyPlanId} with status:"CONFIRMED"
 * (PLAN-03 저장/확정). Returns { weeklyPlanId }.
 *
 * ENDPOINT NOTE: the FE-1 작업지시 writes this as POST `.../confirmation`; the BE
 * 명세서 (07번) says PUT `/weekly-plans/{id}` and that spec is authoritative. The
 * 작업지시's AC-4 "확정 409 E-PLAN-004(레이스)" maps onto this endpoint's documented
 * 409 (최신 주간 계획 버전과 충돌) — the caller re-syncs the review panel from the
 * error's `details.issues`, or re-runs the dry-run when the body carries none.
 */
export function saveWeek(weeklyPlanId, { weekStartDate, weekEndDate, totalPlannedMinutes }) {
  const body = { weekStartDate, weekEndDate, totalPlannedMinutes, status: 'CONFIRMED' }
  return withDevFallback(
    () => apiClient.put(`/weekly-plans/${weeklyPlanId}`, body),
    () => mockBackend.saveWeek(weeklyPlanId, body),
  )
}
