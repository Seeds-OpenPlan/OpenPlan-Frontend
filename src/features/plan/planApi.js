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

// Run the real call; in DEV, fall back to the mock ONLY for genuine network
// failures (no server). Any real HTTP error (4xx/5xx) propagates unchanged so
// error handling and rollback are exercised against real responses.
async function withDevFallback(realCall, mockCall) {
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
