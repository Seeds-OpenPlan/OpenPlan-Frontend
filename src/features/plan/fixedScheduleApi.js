/*
  OP functions for fixed schedules (ST-F1-06 — PLAN-33/34 주차 예외). Each maps 1:1
  to an endpoint; the TanStack hooks (usePlanData.js) call ONLY these. Same DEV
  mock-fallback rule as planApi/scheduleApi/taskApi: real path in prod, mock only
  on a genuine network error.

  CONFIRMED GAP (W6 계약 감사, resolves the ASSUMPTION this comment used to
  record — openapi-live-76c7009.yaml checked directly, not re-guessed):
  `GET /fixed-schedules` (line 1937) takes ONLY `status` — no `weekStartDate`
  param exists. Its `FixedSchedule` response schema (line 2519) has no
  `activeThisWeek` field either; that field only appears ANYWHERE in the
  contract nested inside `WeeklyPlanView.fixedSchedules` (line 2578-2585) —
  and `GET /weekly-plans`'s own summary (line 1627) explicitly says
  fixedSchedules/availability/validationSummary are "후속 편입" (a FUTURE
  addition, not live yet). The week-exception resource itself
  (POST/DELETE .../week-exceptions, PLAN-33/34) has NO GET at all — write-only.
  Net result: there is currently NO live endpoint that tells the client
  whether a given fixed schedule is excepted for the viewed week. Live-server
  confirmation was attempted but blocked on missing credentials (no
  E2E_EMAIL/E2E_PASSWORD available to this fix — see the W6 audit report);
  everything above is contract-document evidence only, flagged as such.

  FIX (this session, replaces the old server-guess): stop pretending the
  server told us. `activeThisWeek` is now computed client-side from
  `sessionWeekExceptions` below — a same-page-load memory of exactly the
  POST/DELETE week-exception calls THIS session itself made (the one thing
  the client can actually know for certain, since it made those calls). A
  schedule/week pair this session has never touched still defaults to
  ACTIVE (never silently ghosted) — same fail-open reasoning
  normalizeFixedSchedule always documented, kept because hiding a real
  scheduling conflict is a worse failure than occasionally under-reporting a
  week-exception the user set on ANOTHER device or an EARLIER page load.
  `weekStartDate` is still sent on the GET below as a harmless no-op hint —
  if BE ever ships the "후속 편입" and starts honoring it, this starts working
  for real with zero FE change; until then the server just ignores an
  unrecognized query param.

  REMAINING GAP FOR BE (see report): this client-side memory does not survive
  a page reload and cannot see another device's changes. The only real fix is
  a server-side way to read current week-exception state — either (a) ship
  the already-modeled `WeeklyPlanView.fixedSchedules[].activeThisWeek` this
  schema anticipates, or (b) a GET on the week-exceptions resource.
*/

import { apiClient } from '../../api/client'
import { withDevFallback } from './planApi'
import { mockBackend } from './planFixtures'
import { minutesFromTime, timeFromMinutes } from './planTime'
import { unwrapList } from '../../api/unwrap'

// `${fixedScheduleId}::${weekStartISO}` -> true (excepted/ghost this week).
// Absence means "not known to be excepted" (renders active), NOT "confirmed
// active" — see this file's header for why that direction is the safe one.
const sessionWeekExceptions = new Map()
const exceptionKey = (fixedScheduleId, weekStartISO) => `${fixedScheduleId}::${weekStartISO}`

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
 *
 * `weekStartISO`: only meaningful for the week-scoped grid read
 * (getFixedSchedules below) — `null` from every week-agnostic caller
 * (getAllFixedSchedules, create/update), which simply never computes a
 * session-known exception (there is no "this week" to look one up for).
 */
function normalizeFixedSchedule(f, weekStartISO = null) {
  const sessionKnown = weekStartISO != null && sessionWeekExceptions.get(exceptionKey(f.fixedScheduleId ?? f.fixed_schedule_id, weekStartISO))
  return {
    fixedScheduleId: f.fixedScheduleId ?? f.fixed_schedule_id,
    title: f.title,
    weekday: f.weekday,
    startMinutes: f.startMinutes ?? f.start_minutes ?? minutesFromTime(f.startTime ?? f.start_time),
    endMinutes: f.endMinutes ?? f.end_minutes ?? minutesFromTime(f.endTime ?? f.end_time),
    // See this file's header (CONFIRMED GAP / FIX) for the full reasoning.
    // Priority order: (1) this SESSION's own POST/DELETE week-exception call
    // for this exact (schedule, week) — the one source we can actually
    // trust; (2) a server-sent `activeThisWeek`, kept as a forward-compat
    // read in case BE ships the "후속 편입" this contract's own schema
    // anticipates (WeeklyPlanView.fixedSchedules[].activeThisWeek) — today
    // this is never present, so this branch is currently always a no-op;
    // (3) default ACTIVE (fail open — see header for why hiding a real
    // conflict is the worse failure direction than an occasional stale
    // ghost that never appears).
    activeThisWeek: sessionKnown ? false : (f.activeThisWeek ?? f.active_this_week) !== false,
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
 * OP-FIXED-LIST → GET /fixed-schedules?status=ACTIVE&weekStartDate= (the
 * `weekStartDate` param is a no-op hint the real server does not honor today
 * — confirmed against the contract, see this file's header — kept only as a
 * harmless forward-compat send). `activeThisWeek` on the returned shape comes
 * from this SESSION's own week-exception calls (normalizeFixedSchedule), not
 * from the server response.
 */
export function getFixedSchedules(weekStartISO) {
  return withDevFallback(
    () =>
      apiClient.get('/fixed-schedules', {
        params: { status: 'ACTIVE', weekStartDate: weekStartISO },
      }),
    () => mockBackend.getFixedSchedules(weekStartISO),
    // Real: `data:[FixedSchedule]` (array). Mock: `{ fixedSchedules: [...] }`.
  ).then((r) => unwrapList(r, 'fixedSchedules').map((f) => normalizeFixedSchedule(f, weekStartISO)))
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
  ).then((result) => {
    // Recorded only on CONFIRMED success, not optimistically before the call:
    // a false "known excepted" entry would make normalizeFixedSchedule ghost a
    // schedule the server never actually excepted — the OPPOSITE of the fail-
    // open direction this whole mechanism exists to protect (a ghosted block
    // reads as "not a placement conflict here", so a wrongly-ghosted entry
    // could hide a real one). `useToggleFixedException` (usePlanData.js)
    // invalidates+refetches `getFixedSchedules` in its own onSuccess, which
    // only runs after THIS promise (and this .then) already resolved, so the
    // map is guaranteed populated before that refetch's normalizeFixedSchedule
    // runs — no race despite being set "after" this call in the chain.
    sessionWeekExceptions.set(exceptionKey(fixedScheduleId, weekStartISO), true)
    return result
  })
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
  ).then((result) => {
    // Same "confirmed success only" reasoning as addFixedException above —
    // delete() removes the entry rather than setting `false`, so a schedule
    // this session never touched still falls through to the (fail-open)
    // server-field/default branch in normalizeFixedSchedule, not a explicit
    // "confirmed active" claim this call has no basis to make either.
    sessionWeekExceptions.delete(exceptionKey(fixedScheduleId, weekStartISO))
    return result
  })
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
