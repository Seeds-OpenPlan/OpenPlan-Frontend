/*
  OP functions for the ST-F1-12 설정 screens whose endpoints are NOT in the 07
  API 명세서 yet: 기본값(preferences)·제안(suggestions)·연동(connections)·계정
  (account)·알림(notification-settings). Every export below is [가정-확장] —
  flagged individually, not decided unilaterally as fact.

  가용 시간 범위·고정 일정·주차 예외 already have a REAL contract
  (ST-B1-09/ST-B2-12/13) and are NOT re-declared here — screens read those
  straight from `features/plan/planApi.js` and
  `features/plan/fixedScheduleApi.js`. "가용 시간"(사용자 입력 주간 목표치,
  아래 §가용 시간 섹션)은 그 REAL 계약에 없는 필드라 여기 [가정-확장]으로 산다
  (오너 결정 2026-07-25 — phase 1, 설정 화면 한정).

  Reuses planApi's withDevFallback (the one shared mock-fallback rule — see
  that function's own header) rather than redefining it a third/fourth time,
  same choice statsApi.js already made.
*/
import { apiClient } from '../../api/client'
import { withDevFallback } from '../plan/planApi'
import { mockBackend } from './settingsFixtures'
import { unwrapList } from '../../api/unwrap'

// --- 가용 시간 (사용자 입력, phase 1) ------------------------------------------------
// [가정-확장] — ST-B1-09 availabilities 계약엔 없는 필드. 실 Swagger 확정 시
// 이 리소스 경로/모양이 통째로 바뀔 수 있어 별도 엔드포인트로 분리해 둔다
// (기존 /users/me/availabilities와는 무관 — 가용 시간 범위 patterns를 건드리지
// 않는다).

/** GET /users/me/availability-target ([가정-확장]). Returns `{ weeklyAvailableMinutes }`. */
export function getWeeklyAvailableMinutes() {
  return withDevFallback(
    () => apiClient.get('/users/me/availability-target'),
    () => mockBackend.getWeeklyAvailableMinutes(),
  ).then((r) => r?.weeklyAvailableMinutes)
}

/** PUT /users/me/availability-target ([가정-확장]). `minutes`는 5분 배수(공통 불변식 E-COM-009). */
export function updateWeeklyAvailableMinutes(minutes) {
  return withDevFallback(
    () => apiClient.put('/users/me/availability-target', { weeklyAvailableMinutes: minutes }),
    () => mockBackend.updateWeeklyAvailableMinutes(minutes),
  ).then((r) => r?.weeklyAvailableMinutes)
}

// --- 기본값 (FIX-10~12) -----------------------------------------------------------

/** GET /users/me/preferences ([가정-확장]). */
export function getPreferences() {
  return withDevFallback(
    () => apiClient.get('/users/me/preferences'),
    () => mockBackend.getPreferences(),
  )
}

/** PATCH /users/me/preferences ([가정-확장]). `patch` = { defaultReplanStrategy }. */
export function updatePreferences(patch) {
  return withDevFallback(
    () => apiClient.patch('/users/me/preferences', patch),
    () => mockBackend.updatePreferences(patch),
  )
}

/**
 * GET /users/me/preferences/suggestions ([가정-신규], RB-FIX-01). Returns
 * `{ suggestedStrategy, reason, sampleSize }` or `null` when there is no
 * suggestion (short-circuits like stats' getCorrectionProposal) — that "no
 * suggestion" state must stay reachable, not just papered over with a fake one.
 */
export function getSuggestion() {
  return withDevFallback(
    () => apiClient.get('/users/me/preferences/suggestions'),
    () => mockBackend.getSuggestion(),
  )
}

// --- 연동 (FIX-13~17) — Google/Apple 독립 (오너 4차 리뷰로 2차의 단일 병합 정정) -
// provider별 하위 경로로 되돌림 — round-1과 동일한 REST 모양([가정-확장], 실
// Swagger 없음). 독립 하위 화면(SettingsCalendarPage, 라운드 3)이라는 배치는
// 그대로 유지되고, 그 화면이 부르는 이 API들의 모양만 provider별로 복귀.

/** GET /users/me/connections ([가정-확장]). Returns the GOOGLE/APPLE rows. */
export function getConnections() {
  return withDevFallback(
    () => apiClient.get('/users/me/connections'),
    () => mockBackend.getConnections(),
    // Real: `data:[ExternalConnection]` (array). Mock: `{ connections: [...] }`.
  ).then((r) => unwrapList(r, 'connections'))
}

/**
 * PATCH /users/me/connections/{provider} ([가정-확장], FIX-16 활성 Toggle).
 * Disconnect (connected:false) is only ever called AFTER the caller's own
 * confirm dialog (FIX-17 "이후 반영되지 않습니다") — this function does not
 * confirm anything itself.
 */
export function setConnectionActive(provider, connected) {
  return withDevFallback(
    () => apiClient.patch(`/users/me/connections/${provider}`, { connected }),
    () => mockBackend.setConnectionActive(provider, connected),
  )
}

/**
 * PUT /users/me/connections/{provider}/calendars ([가정-확장], FIX-15 캘린더
 * 선택 편집). Full replace, per the spec's own "PUT 전체 교체" wording — never a
 * partial add/remove call.
 */
export function replaceSelectedCalendars(provider, calendarIds) {
  return withDevFallback(
    () => apiClient.put(`/users/me/connections/${provider}/calendars`, { calendarIds }),
    () => mockBackend.replaceSelectedCalendars(provider, calendarIds),
  )
}

// --- 계정 (ACCT-01/02) -------------------------------------------------------------

/** GET /users/me/account ([가정-확장]). */
export function getAccount() {
  return withDevFallback(
    () => apiClient.get('/users/me/account'),
    () => mockBackend.getAccount(),
  )
}

/** PATCH /users/me/account ([가정-확장], 오너 리뷰 3차 item 5 — 이름 변경). */
export function updateAccount(patch) {
  return withDevFallback(
    () => apiClient.patch('/users/me/account', patch),
    () => mockBackend.updateAccount(patch),
  )
}

/** POST /users/me/deactivation ([가정-확장], ACCT-01 진입 이후 실제 확정). */
export function deactivateAccount() {
  return withDevFallback(
    () => apiClient.post('/users/me/deactivation'),
    () => mockBackend.deactivateAccount(),
  )
}

/** POST /auth/reactivations ([가정-확장], ACCT-02 진입 이후 실제 확정). */
export function reactivateAccount() {
  return withDevFallback(
    () => apiClient.post('/auth/reactivations'),
    () => mockBackend.reactivateAccount(),
  )
}

// --- 알림 (NOTI-01) -----------------------------------------------------------------

/** GET /users/me/notification-settings ([가정-확장]). */
export function getNotificationSettings() {
  return withDevFallback(
    () => apiClient.get('/users/me/notification-settings'),
    () => mockBackend.getNotificationSettings(),
  )
}

/**
 * PATCH /users/me/notification-settings ([가정-확장]). One key per call —
 * matches AC "5종 토글 즉시 저장" (each switch commits on its own, no separate
 * save button/batch).
 */
export function patchNotificationSetting(key, enabled) {
  return withDevFallback(
    () => apiClient.patch('/users/me/notification-settings', { [key]: enabled }),
    () => mockBackend.patchNotificationSetting(key, enabled),
  )
}
