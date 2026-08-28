/*
  OP functions for personal-schedule blocks (ST-F1-04 — PLAN-08 create, PLAN-17
  edit). Each maps 1:1 to an endpoint; consumers (TanStack hooks) call ONLY these.
  Same DEV mock-fallback rule as planApi/taskApi: real path in prod, mock only on a
  genuine network error, so the mock→real switch is a base-URL change only.

  VERSION TRACKING (BLOCKER FIX, W6 계약 감사): `PATCH /schedules/{id}` requires
  `version` (openapi-live-76c7009.yaml:1857, 409 VersionConflict/E-COM-006 on a
  stale one) — the same optimistic-lock input projectApi.js/fixedScheduleApi.js
  already thread through. This one is harder to plumb than those two: neither
  `PlanBlock` (what create/list responses actually return, `WeeklyPlan.blocks[]`)
  nor the create response's own schema carries a `version` field AT ALL — a
  `Schedule`'s version is only ever visible in the response of THIS module's own
  updateSchedule/patchSchedule call. There is no `GET /schedules/{id}` to ask
  for it out of band either. Before this fix, `patchSchedule` sent `patch`
  straight through with no `version` — the caller (WeeklyPage's schedule edit
  form) never had one to include either, since nothing upstream ever gave it
  one — so the server's optimistic lock was silently disabled for every
  personal-schedule edit, not merely edited around.
  The fix: track each known schedule's version in this module (the one place
  that ever sees a Schedule's real version), so `patchSchedule` can inject it
  without requiring every caller across the codebase to carry it manually —
  WeeklyPage.jsx is unowned by this fix, so the round-trip has to close
  entirely inside this file. `postScheduleBlock`/`createScheduleBlock` seed the
  tracker at 1 (matches this codebase's own create-a-fresh-row convention —
  see projectFixtures/planFixtures seeding every new row at `version: 1`);
  `patchSchedule` updates it from each successful PATCH's own response.
  REMAINING GAP (flagged for BE, see W6 audit report): a page reload loses
  this in-memory tracker, so the FIRST edit of a schedule created in an
  EARLIER page load falls back to the same `1` guess — if the real version
  has since moved past 1, that edit spuriously 409s. This fails in the SAFE
  direction (a rejected write, not a silently accepted stale one) but is a
  real UX rough edge; the only real fix is a server-side way to read a
  schedule's current version without editing it (a `GET /schedules/{id}`, or
  `version` added to `PlanBlock` — WeeklyPage already has scheduleId per
  block, this addition alone would remove the guess entirely).
*/

import { apiClient } from '../../api/client'
import { withDevFallback } from './planApi'
import { mockBackend } from './planFixtures'

// scheduleId -> last known version (see this file's own header for why this
// tracker exists and its one known gap). Module-scoped, not query-cache-
// scoped: every caller of patchSchedule goes through this exact module, so a
// plain Map is the smallest mechanism that closes the loop.
const knownScheduleVersions = new Map()

/**
 * OP-SCHED-CREATE → POST /weekly-plans/{id}/blocks (blockType=SCHEDULE, PLAN-08).
 * Body: { blockType:'SCHEDULE', title, startAt, endAt, status, estimatedMinutes,
 * priority, memo }. Real response is a full `PlanBlock` (data unwrapped by the
 * axios interceptor); the mock still returns the smaller `{planBlockId,
 * scheduleId}` shape documented here, which is also the only part of either
 * shape this function itself reads.
 */
export function postScheduleBlock(weeklyPlanId, body) {
  return withDevFallback(
    () => apiClient.post(`/weekly-plans/${weeklyPlanId}/blocks`, body),
    () => mockBackend.createScheduleBlock(weeklyPlanId, body),
  ).then((result) => {
    // Seed the version tracker so the FIRST edit of this brand-new schedule
    // (still within this page load) sends a correct `version` instead of
    // falling all the way back to the same `1` guess patchSchedule uses for
    // an untracked id — see this file's header for why `1` is that guess's
    // basis (every fresh row in this codebase starts at version 1).
    if (result?.scheduleId) knownScheduleVersions.set(result.scheduleId, 1)
    return result
  })
}

/**
 * OP-SCHED-UPDATE → PATCH /schedules/{scheduleId} (PLAN-17). Body: { title,
 * startAt, endAt, memo, status, estimatedMinutes, priority, version }.
 * `version` is filled in from the tracker above when the caller doesn't
 * already carry one (no caller in this codebase does today — see this file's
 * header) and is updated from the response's own `version` on success, so a
 * SECOND edit in the same page load always sends the freshest known value.
 */
export function patchSchedule(scheduleId, patch) {
  const version = patch.version ?? knownScheduleVersions.get(scheduleId) ?? 1
  const wire = { ...patch, version }
  return withDevFallback(
    () => apiClient.patch(`/schedules/${scheduleId}`, wire),
    () => mockBackend.updateSchedule(scheduleId, wire),
  ).then(
    (result) => {
      if (result?.version != null) knownScheduleVersions.set(scheduleId, result.version)
      return result
    },
    (error) => {
      // A 409 still carries the CURRENT server version (details.latest.version,
      // the shared VersionConflict/E-COM-006 shape every OVL-CONFLICT caller in
      // this codebase already reads). Nothing here mounts a ConflictOverlay for
      // schedule edits yet (WeeklyPage's own save-conflict path still only
      // toasts — a separate, pre-existing gap this fix doesn't expand into),
      // but updating the tracker anyway means a plain unassisted resubmit
      // (the user just presses 저장 again) picks up the correct version instead
      // of 409ing a second time on the same stale guess.
      if (error?.code === 'E-COM-006' && error.details?.latest?.version != null) {
        knownScheduleVersions.set(scheduleId, error.details.latest.version)
      }
      throw error
    },
  )
}
