/*
  OP functions for fixed schedules (ST-F1-06 — PLAN-33/34 주차 예외). Each maps 1:1
  to an endpoint; the TanStack hooks (usePlanData.js) call ONLY these. Same DEV
  mock-fallback rule as planApi/scheduleApi/taskApi: real path in prod, mock only
  on a genuine network error.

  ASSUMPTION (unconfirmed with BE — flagged in the PR, not decided unilaterally):
  the 07번 API 명세서's `GET /fixed-schedules` takes only `status` and returns a
  flat list with no weekly concept, while `activeThisWeek` (api-contracts.md §5-J6)
  is inherently PER WEEK — a fixed schedule can be deactivated for one week and
  stay active every other week. Until BE confirms the real shape, this client
  asks for the CURRENTLY VIEWED week via an extra `weekStartDate` query param and
  expects the server to fold its week-exception state into an `activeThisWeek`
  field per schedule. This is the smallest, most reversible guess available (one
  extra param on an existing GET, not a second endpoint or a client-side merge of
  two separate lists) — if BE settles on something else (e.g. a dedicated
  GET .../week-exceptions), only `normalizeFixedSchedule` and `getFixedSchedules`
  below need to change; every consumer already just reads `activeThisWeek` off
  the normalized shape.
*/

import { apiClient } from '../../api/client'
import { withDevFallback } from './planApi'
import { mockBackend } from './planFixtures'
import { minutesFromTime, timeFromMinutes } from './planTime'
import { unwrapList } from '../../api/unwrap'

/**
 * Normalize a fixed schedule to the camelCase shape the grid AND the ST-F1-12
 * settings screen both read. version/startDate/endDate/source/status
 * (ST-B2-12's fixed_schedules columns) are additive — of these, only `version`
 * is actually consumed anywhere in this codebase today (the optimistic-lock
 * check on update). `startDate`/`endDate`/`source`/`status` are kept
 * normalized here so the shape round-trips cleanly (the mock backend already
 * threads them through create/update), but NO current screen reads or writes
 * them — neither the ST-F1-06 grid nor FixedScheduleForm (ST-F1-12's own CRUD
 * form only edits title/weekday/start/end minutes). They're reserved fields,
 * unused/on hold until a future story actually surfaces them in the UI.
 *
 * TIME CONTRACT (fixed BLOCKER — full-repo verification): FixedScheduleInput
 * (openapi-live-76c7009.yaml:2509) carries `startTime`/`endTime` as time
 * STRINGS ("HH:mm:ss"), required — every screen in this codebase, though,
 * works in minutes-of-day integers (startMinutes/endMinutes), same as the
 * availability contract already had to bridge (planApi.js's own
 * minutesFromTime/timeFromMinutes, now shared via planTime.js — see that
 * file's header). This is the ONE place the read side of that bridge lives:
 * prefer an already-minutes field (old mock/server shape) and fall back to
 * parsing the real contract's time string. Before this fix, this function
 * only ever read startMinutes/start_minutes — against a real server (which
 * sends ONLY startTime) that always evaluated to `undefined`, breaking every
 * time display on the settings list.
 */
function normalizeFixedSchedule(f) {
  return {
    fixedScheduleId: f.fixedScheduleId ?? f.fixed_schedule_id,
    title: f.title,
    weekday: f.weekday,
    startMinutes: f.startMinutes ?? f.start_minutes ?? minutesFromTime(f.startTime ?? f.start_time),
    endMinutes: f.endMinutes ?? f.end_minutes ?? minutesFromTime(f.endTime ?? f.end_time),
    // Defaults to true: a server that doesn't yet understand week exceptions
    // (or omits the field) should render every fixed schedule as ACTIVE, not
    // silently ghost all of them — an unrecognized false would be the wrong
    // failure direction (hiding a real conflict), so only an explicit false wins.
    activeThisWeek: (f.activeThisWeek ?? f.active_this_week) !== false,
    // Contract field names are startDate/endDate (nullable date) — this
    // codebase used to read effectiveFrom/effectiveTo, a name the real server
    // has never actually sent (renamed together with the mock, below).
    startDate: f.startDate ?? f.start_date ?? null,
    endDate: f.endDate ?? f.end_date ?? null,
    source: f.source ?? 'MANUAL',
    status: f.status ?? 'ACTIVE',
    version: f.version ?? 1,
    // Settings-list-only convenience (see planFixtures.getFixedSchedulesAll's
    // own comment) — undefined on the week-scoped grid read, never a false
    // "no conflict" claim it can't back up.
    hasConflict: f.hasConflict ?? undefined,
  }
}

/**
 * Translate a create/edit draft (FixedScheduleForm's own shape —
 * startMinutes/endMinutes, plus title/weekday and, on edit, version) into the
 * wire `FixedScheduleInput` the contract requires (startTime/endTime time
 * strings). This is the WRITE side of the same time-contract bridge
 * `normalizeFixedSchedule` reads back above — the boundary where the app's
 * minutes-of-day convention ever touches the server's string one, so a
 * future caller never has to remember to convert by hand.
 *
 * startDate/endDate are nullable in the contract and FixedScheduleForm never
 * collects them, so they are simply omitted here (not sent as `null`) rather
 * than invented — an absent optional field is not a contract violation.
 */
function serializeFixedSchedule(body) {
  const { startMinutes, endMinutes, ...rest } = body
  const wire = { ...rest }
  if (startMinutes != null) wire.startTime = timeFromMinutes(startMinutes)
  if (endMinutes != null) wire.endTime = timeFromMinutes(endMinutes)
  return wire
}

/**
 * OP-FIXED-LIST → GET /fixed-schedules?status=ACTIVE&weekStartDate= (ASSUMPTION
 * above). Returns the week's recurring fixed schedules with `activeThisWeek`.
 */
export function getFixedSchedules(weekStartISO) {
  return withDevFallback(
    () =>
      apiClient.get('/fixed-schedules', {
        params: { status: 'ACTIVE', weekStartDate: weekStartISO },
      }),
    () => mockBackend.getFixedSchedules(weekStartISO),
    // Real: `data:[FixedSchedule]` (array). Mock: `{ fixedSchedules: [...] }`.
  ).then((r) => unwrapList(r, 'fixedSchedules').map(normalizeFixedSchedule))
}

/**
 * OP-FIXED-EXCEPT-ADD → POST /fixed-schedules/{id}/week-exceptions (PLAN-33 이번
 * 주만 비활성화). Body carries the week the exception applies to — the endpoint
 * itself has no other way to know which week the current screen is showing.
 */
export function addFixedException(fixedScheduleId, weekStartISO) {
  return withDevFallback(
    () =>
      apiClient.post(`/fixed-schedules/${fixedScheduleId}/week-exceptions`, {
        weekStartDate: weekStartISO,
      }),
    () => mockBackend.addFixedWeekException(fixedScheduleId, weekStartISO),
  )
}

/**
 * OP-FIXED-EXCEPT-DEL → DELETE /fixed-schedules/{id}/week-exceptions/{weekStart}
 * (PLAN-34 다시 활성화). Server-idempotent (api-contracts.md §2.2), but still only
 * ever consumed via `useMutation` (retry:0) — DELETE gets no automatic retry
 * either, per the retry-policy note above OP-FIXED-EXCEPT-ADD/DEL: automatic
 * retry is a GET-only privilege, writes retry solely on the user's own click.
 */
export function removeFixedException(fixedScheduleId, weekStartISO) {
  return withDevFallback(
    () => apiClient.delete(`/fixed-schedules/${fixedScheduleId}/week-exceptions/${weekStartISO}`),
    () => mockBackend.removeFixedWeekException(fixedScheduleId, weekStartISO),
  )
}

// --- ST-F1-12: 고정 일정 관리 (설정) — CRUD + 충돌 미리보기 --------------------

/**
 * OP-FIXED-LIST-ALL → GET /fixed-schedules (no weekStartDate — the settings
 * list is week-agnostic, unlike getFixedSchedules above which the PLAN GRID
 * scopes to the currently viewed week).
 */
export function getAllFixedSchedules() {
  return withDevFallback(
    () => apiClient.get('/fixed-schedules'),
    () => mockBackend.getFixedSchedulesAll(),
    // Real: `data:[FixedSchedule]` (array). Mock: `{ fixedSchedules: [...] }`.
  ).then((r) => unwrapList(r, 'fixedSchedules').map(normalizeFixedSchedule))
}

/**
 * OP-FIXED-CREATE → POST /fixed-schedules (FIX-06 고정일정 직접 추가).
 * `payload` arrives as FixedScheduleForm's own draft shape (startMinutes/
 * endMinutes); `serializeFixedSchedule` converts it to the wire
 * `FixedScheduleInput` (startTime/endTime) BEFORE either the real POST or the
 * mock, so the mock's own store actually exercises the same contract shape a
 * real server expects (see planFixtures.createFixedSchedule) — the previous
 * version sent `payload` straight through unconverted, so startTime/endTime
 * (required by the contract) never went out at all.
 */
export function createFixedSchedule(payload) {
  const wire = serializeFixedSchedule(payload)
  return withDevFallback(
    () => apiClient.post('/fixed-schedules', wire),
    () => mockBackend.createFixedSchedule(wire),
  ).then(normalizeFixedSchedule)
}

/**
 * OP-FIXED-UPDATE → PATCH /fixed-schedules/{id} (FIX-07 편집). `patch` must
 * carry `version` for the optimistic-lock check (E-COM-006, common invariant;
 * required server-side per openapi-live-76c7009.yaml:1994). Same
 * serializeFixedSchedule conversion as createFixedSchedule — `version`/
 * `title`/`weekday` pass through untouched (they're not time fields), only
 * startMinutes/endMinutes become startTime/endTime.
 */
export function updateFixedSchedule(fixedScheduleId, patch) {
  const wire = serializeFixedSchedule(patch)
  return withDevFallback(
    () => apiClient.patch(`/fixed-schedules/${fixedScheduleId}`, wire),
    () => mockBackend.updateFixedSchedule(fixedScheduleId, wire),
  ).then(normalizeFixedSchedule)
}

/** OP-FIXED-DELETE → DELETE /fixed-schedules/{id} (FIX-09 삭제). */
export function deleteFixedSchedule(fixedScheduleId) {
  return withDevFallback(
    () => apiClient.delete(`/fixed-schedules/${fixedScheduleId}`),
    () => mockBackend.deleteFixedSchedule(fixedScheduleId),
  )
}

/**
 * OP-FIXED-CONFLICT-PREVIEW → POST /fixed-schedules/conflict-previews
 * (FIX-08 저장 전 충돌 미리보기, dry-run — no persistence either side, ST-B2-12
 * AC-1). Called BEFORE create/update commits so the form can show "저장해도
 * 되지만 이 주들에 차단이 생깁니다" without writing anything yet — saving despite
 * a conflict is allowed (owner decision, ST-F1-12 AC-2); this call only informs
 * that choice.
 */
export function previewFixedScheduleConflicts(candidate) {
  return withDevFallback(
    () => apiClient.post('/fixed-schedules/conflict-previews', candidate),
    () => mockBackend.previewFixedScheduleConflicts(candidate),
  )
}
