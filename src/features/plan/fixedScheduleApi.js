/*
  OP functions for fixed schedules (ST-F1-06 — PLAN-33/34 주차 예외). Each maps 1:1
  to an endpoint; the TanStack hooks (usePlanData.js) call ONLY these. Same DEV
  mock-fallback rule as planApi/scheduleApi/taskApi: real path in prod, mock only
  on a genuine network error.

  WEEK-SCOPED READ, CORRECTED (BE #90). What used to be an unconfirmed ASSUMPTION
  here — guessing the server would fold week-exception state into an
  `activeThisWeek` field if this client asked `GET /fixed-schedules` with an
  extra, out-of-contract `weekStartDate` param — turned out to be wrong: the real
  07번 API 명세서's `GET /fixed-schedules` (openapi.yaml `listFixedSchedules`)
  takes only `status` and has no weekly concept at all, so the server silently
  ignored that extra param and never sent `activeThisWeek` either — every fixed
  schedule rendered permanently ACTIVE regardless of a saved week-exception
  (normalizeFixedSchedule's own default-to-true, below). The CONFIRMED contract
  (openapi.yaml `WeeklyPlanView.fixedSchedules`, ~2823행; tracked as BE #90) is
  instead that `GET /weekly-plans?weekStartDate=` itself carries this week's
  fixed schedules (including `activeThisWeek`) alongside `blocks` — so the plan
  grid now reads them from THERE (planApi.js's `getWeek`/`normalizeWeek`), not
  from this file. `getFixedSchedules` below still exists, but demoted to a
  FALLBACK that `getWeek` calls only if a server hasn't deployed BE #90 yet (the
  `fixedSchedules` field is missing from its response) — see that function's own
  header for what it can and cannot restore in that case.

  `normalizeFixedSchedule`/`activeInWeek` moved out to fixedScheduleShape.js —
  planApi.js's own `normalizeWeek` needs the exact same normalization for the
  SAME server shape, and importing it from here would cycle back through this
  file's own `withDevFallback` import below (see that new module's header).
*/

import { apiClient } from '../../api/client'
import { withDevFallback } from './planApi'
import { timeFromMinutes } from './planTime'
import { activeInWeek, normalizeFixedSchedule } from './fixedScheduleShape'
import { mockBackend } from './planFixtures'
import { unwrapList } from '../../api/unwrap'

/**
 * 화면이 쓰는 분 단위를 계약이 요구하는 시각 문자열로 되돌린다.
 *
 * 🔴 계약(openapi `FixedScheduleInput`)은 `startTime`·`endTime`을 **required**로
 * 요구하는데, 폼은 `{startMinutes, endMinutes}`를 그대로 실어 보내고 있었다 —
 * 읽기 쪽 이름 불일치(normalizeFixedSchedule 참조)의 거울상이라, 손으로 만드는
 * 고정 일정도 같은 이유로 서버에 닿지 못했다.
 *
 * 화면(폼·그리드·설정 목록)은 분 단위 그대로 두고 **이 경계에서만** 바꾼다.
 * 화면 전체를 시각 문자열로 옮기는 것은 훨씬 큰 변경이고, 계약과 UI 모델이
 * 다른 것 자체는 정상이다 — 어긋나 있던 것은 그 사이를 잇는 어댑터뿐이었다.
 *
 * 이미 시각 문자열이면 건드리지 않는다(목 경로·미래의 호출부 대비).
 */
function toServerFixedSchedule(payload) {
  if (!payload || typeof payload !== 'object') return payload
  const body = { ...payload }
  if (body.startTime == null && Number.isFinite(body.startMinutes)) {
    body.startTime = timeFromMinutes(body.startMinutes)
  }
  if (body.endTime == null && Number.isFinite(body.endMinutes)) {
    body.endTime = timeFromMinutes(body.endMinutes)
  }
  delete body.startMinutes
  delete body.endMinutes
  return body
}

/**
 * OP-FIXED-LIST → GET /fixed-schedules?status=ACTIVE (contract-faithful — no
 * `weekStartDate` param; openapi.yaml `listFixedSchedules` never accepted one,
 * see this file's own header). FALLBACK ONLY, called by planApi.js's `getWeek`
 * when `GET /weekly-plans`'s response doesn't carry a `fixedSchedules` field
 * yet (BE #90 not deployed on that server). Still takes `weekStartISO` as a JS
 * param — not sent to the server, just used to apply the same `activeInWeek`
 * date-range filter `normalizeWeek` would have applied.
 *
 * `activeThisWeek` CANNOT be recovered through this path — this endpoint has
 * no weekly concept at all, so every schedule normalizes to its
 * default-active (see normalizeFixedSchedule). That is the accepted, narrower
 * gap this fallback leaves open (see getWeek's own fallback comment): fixed
 * schedules stay visible instead of vanishing, but a saved "이번 주만
 * 비활성화" won't show as a ghost until the server actually deploys #90.
 */
export function getFixedSchedules(weekStartISO) {
  return withDevFallback(
    () => apiClient.get('/fixed-schedules', { params: { status: 'ACTIVE' } }),
    () => mockBackend.getFixedSchedules(weekStartISO),
    // Real: `data:[FixedSchedule]` (array). Mock: `{ fixedSchedules: [...] }`.
  ).then((r) =>
    unwrapList(r, 'fixedSchedules')
      .map(normalizeFixedSchedule)
      .filter((f) => activeInWeek(f, weekStartISO)),
  )
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

/** OP-FIXED-CREATE → POST /fixed-schedules (FIX-06 고정일정 직접 추가). */
export function createFixedSchedule(payload) {
  return withDevFallback(
    () => apiClient.post('/fixed-schedules', toServerFixedSchedule(payload)),
    () => mockBackend.createFixedSchedule(payload),
  ).then(normalizeFixedSchedule)
}

/**
 * OP-FIXED-UPDATE → PATCH /fixed-schedules/{id} (FIX-07 편집). `patch` must
 * carry `version` for the optimistic-lock check (E-COM-006, common invariant).
 */
export function updateFixedSchedule(fixedScheduleId, patch) {
  return withDevFallback(
    () => apiClient.patch(`/fixed-schedules/${fixedScheduleId}`, toServerFixedSchedule(patch)),
    () => mockBackend.updateFixedSchedule(fixedScheduleId, patch),
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
    // 🔴 계약은 `{candidate: FixedScheduleInput}` 봉투를 요구하고, 그 안의 시각은
    //    `startTime`/`endTime`이다(ConflictPreviewRequest.Candidate). 폼은 봉투 없이
    //    `{weekday, startMinutes, endMinutes}`를 그대로 보내고 있었다 — 위
    //    normalizeFixedSchedule·toServerFixedSchedule과 같은 계열의 불일치다.
    //    이 호출은 디바운스된 배경 요청이라 실패해도 화면에 오류가 안 뜬다.
    //    그래서 "충돌 경고가 한 번도 안 뜬 것"이 결함으로 보이지 않았다.
    () => apiClient.post('/fixed-schedules/conflict-previews', {
      candidate: toServerFixedSchedule(candidate),
    }),
    () => mockBackend.previewFixedScheduleConflicts(candidate),
  )
}
