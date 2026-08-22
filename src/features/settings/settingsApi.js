/*
  OP functions for the ST-F1-12 설정 screens. 기본값(preferences)·제안
  (suggestions)·계정(account)·알림(notification-settings)은 여전히 07 API
  명세서에 없는 [가정-확장]이다(개별 플래그, 일방적 확정 아님). **연동
  (connections)만 예외** — W6(2026-08-23)에 `/external-calendar-connections`
  계약이 확정돼 [가정-확장] 딱지를 뗐다(그 섹션 자신의 헤더 코멘트 참조).

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

// --- 연동 (FIX-13~17 + 신규 연동 생성) — external-calendar-connections 계약 정합 ---
// W6 PATH CORRECTION (2026-08-23, 팀장 지시 · 근거: repo 밖 6주차 작업내용 문서
// "오민아(프론트) 작업내용.md" ⓪ 섹션): 이 섹션 전체가 이전에는 `[가정-확장]`
// `/users/me/connections` 계열이었다 — 계약이 확정되며 `/external-calendar-
// connections`로 전면 교체한다. 식별 키도 `provider`에서 서버가 발급하는
// **connectionId**(UUID)로 바뀐다: 같은 provider를 연결→해제→재연결하면 매번
// 새 connectionId가 생기므로 provider만으로는 더 이상 리소스를 유일하게
// 가리키지 못한다. 화면은 여전히 provider별 2행 고정을 유지하지만(그중 하나가
// "미연결"일 수 있음 — CalendarConnectionSection이 로컬에서 합성), 서버 호출은
// 전부 connectionId 기준이다. `PROVIDER_ICON`(CalendarConnectionSection.jsx)은
// 이 교체와 무관하게 그대로 둔다 — 이미 정본(서버가 화면에 맞춰졌다, 위 문서).
//
// 로컬 백엔드 체크아웃(C:\dev\openplan-backend)의 openapi.yaml은 이 사이클
// 시점에 매우 낡아(HEAD가 PR #15) `POST /external-calendar-connections`가 아직
// `provider: enum [GOOGLE]`뿐이고 `[미구현]`이다 — 애플 필드(appleId/
// appPassword)의 유일한 근거는 6주차 문서다(BE PR #33 머지 후 정본 반영 예정).
// 낡은 로컬 openapi를 근거로 애플 관련 코드를 빼거나 "정정"하지 않는다.

export const CONNECTION_STATUS = { CONNECTED: 'CONNECTED', DISABLED: 'DISABLED' }

/**
 * GET /external-calendar-connections. **오직 이미 수립된 연동만** 돌아온다(0~2
 * 행) — 한 번도 연결한 적 없는 provider는 아예 항목이 없다. "미연결" 행은
 * 서버가 주는 게 아니라 CalendarConnectionSection이 PROVIDER 고정 목록과
 * 이 응답을 대조해 로컬에서 합성한다.
 */
export function getConnections() {
  return withDevFallback(
    () => apiClient.get('/external-calendar-connections'),
    () => mockBackend.getConnections(),
    // Real: `data:[ExternalConnection]` (array). Mock: `{ connections: [...] }`.
  ).then((r) => unwrapList(r, 'connections'))
}

/**
 * GET /external-calendar-connections/{connectionId}/calendars — 캘린더 선택
 * 다이얼로그가 열릴 때 그 자리에서 불러오는, 선택 가능한 캘린더 목록. 이전
 * 라운드는 이 목록을 connections 응답 안에 얹어 뒀지만(availableCalendars),
 * 계약은 별도 엔드포인트로 분리돼 있어(팀장 지시 표) 여기서도 분리한다.
 */
export function getAvailableCalendars(connectionId) {
  return withDevFallback(
    () => apiClient.get(`/external-calendar-connections/${connectionId}/calendars`),
    () => mockBackend.getAvailableCalendars(connectionId),
  ).then((r) => unwrapList(r, 'calendars'))
}

/**
 * PATCH /external-calendar-connections/{connectionId} (FIX-16 활성 Toggle).
 * body는 `{ status: 'CONNECTED' | 'DISABLED' }` 뿐이다 — provider는 경로의
 * connectionId가 이미 식별하므로 다시 실을 필요가 없다. **DELETE와는 다른
 * 동작이다**: 이건 일시 정지/재개(자격증명은 그대로 남는다)이고, 완전한
 * 연동 해제는 아래 disconnectConnection의 몫이다 — 그래서 이 함수는 별도
 * 확인창 없이 Toggle에서 즉시 호출된다(파괴적이지 않은 동작).
 */
export function setConnectionStatus(connectionId, status) {
  return withDevFallback(
    () => apiClient.patch(`/external-calendar-connections/${connectionId}`, { status }),
    () => mockBackend.setConnectionStatus(connectionId, status),
  )
}

/**
 * PUT /external-calendar-connections/{connectionId}/calendar-selections
 * (FIX-15 캘린더 선택 편집). Full replace, per the spec's own "PUT 전체 교체"
 * wording — never a partial add/remove call.
 */
export function replaceSelectedCalendars(connectionId, calendarIds) {
  return withDevFallback(
    () => apiClient.put(`/external-calendar-connections/${connectionId}/calendar-selections`, { calendarIds }),
    () => mockBackend.replaceSelectedCalendars(connectionId, calendarIds),
  )
}

/**
 * DELETE /external-calendar-connections/{connectionId} (FIX-17 연동 해제).
 * setConnectionStatus(DISABLED)와 달리 자격증명 자체를 지워 그 행이 통째로
 * 사라지고 "미연결"로 되돌아간다 — 그래서 호출부(CalendarConnectionSection)는
 * 이 함수를 반드시 사용자의 확인 다이얼로그 뒤에만 부른다.
 */
export function disconnectConnection(connectionId) {
  return withDevFallback(
    () => apiClient.delete(`/external-calendar-connections/${connectionId}`),
    () => mockBackend.disconnectConnection(connectionId),
  )
}

/**
 * POST /external-calendar-connections (신규 연동 생성 — 이전 라운드까지 이
 * 화면에 자리 자체가 없었다). provider별로 body 모양이 다르다:
 *   구글: { provider: 'GOOGLE', authCode, redirectUri, state }
 *   애플: { provider: 'APPLE',  appleId, appPassword }
 *
 * withDevFallback을 그대로 물려받는다(네트워크 오류·미구현 404만 mock으로
 * 흡수, 그 외 — 특히 422/502/409 — 는 그대로 던짐) — 애플 폼이 이 셋을 서로
 * 다른 화면 상태로 분기해야 하므로, 여기서 조용히 mock 성공으로 삼켜버리면
 * 그 분기 자체를 검증할 방법이 없어진다. mockBackend.createConnection이 같은
 * 상태코드 모양(422/502/409)으로 던지는 것도 그래서다 — 실서버 대조 전까지
 * 이 화면의 유일한 확인 경로.
 */
function createConnection(body) {
  return withDevFallback(
    () => apiClient.post('/external-calendar-connections', body),
    () => mockBackend.createConnection(body),
  )
}

export function createAppleConnection({ appleId, appPassword }) {
  return createConnection({ provider: 'APPLE', appleId, appPassword })
}

export function createGoogleConnection({ authCode, redirectUri, state }) {
  return createConnection({ provider: 'GOOGLE', authCode, redirectUri, state })
}

/*
 * TODO(redirect-uri): 구글 콘솔에 등록할 콜백 주소가 아직 확정되지 않았다 —
 * 구글 콘솔 등록이 백엔드 쪽 선행 작업이라 여기서 값을 임의로 지어내지
 * 않는다(팀장 지시). 이 상수는 GoogleCalendarCallbackPage(router.js의
 * `settings/calendar/google-callback`)와 항상 같은 주소를 가리켜야 하므로
 * 그 라우트 문자열과 함께 이 한 곳에서만 관리한다 — 실제 값이 확정되면
 * `GOOGLE_CALENDAR_REDIRECT_URI`만 채우면 된다(경로 문자열은 이미 맞춰져
 * 있으니 라우트 자체를 옮길 필요는 없다는 전제 — 옮기게 되면 이 상수도 같이
 * 고친다). 값이 비어 있는 동안 CalendarConnectionSection은 구글 [연동하기]
 * 버튼을 disabledReason과 함께 막아 둔다 — redirectUri 없이 인가를 시작하면
 * 서버/구글 양쪽에서 거부되거나(최악의 경우) 등록되지 않은 주소로 조용히
 * 리다이렉트되는 상태가 되므로, 값이 없을 때 아예 시작하지 못하게 막는 편이
 * "일단 눌러보게 두고 실패시키는" 것보다 안전하다.
 */
export const GOOGLE_CALENDAR_CALLBACK_PATH = '/settings/calendar/google-callback'
export const GOOGLE_CALENDAR_REDIRECT_URI = undefined // TODO(redirect-uri)

/**
 * GET /external-calendar-authorization?provider=GOOGLE&redirectUri=... 로
 * 브라우저를 통째로 보낸다(authApi.js의 oauthStartUrl과 같은 이유 — axios로
 * 부르면 302를 XHR이 대신 따라가 버려 브라우저는 그 자리에 남고 제공자 HTML만
 * 응답으로 받는다). 이 주소를 프론트가 직접 조립하지 않고 반드시 이
 * 엔드포인트를 거치는 이유: 서버가 캘린더 scope·`access_type=offline`·
 * `prompt=consent`·서명한 `state`를 실어 보내야 하는데, 그중 `access_type=
 * offline`이 빠지면 refresh 토큰이 발급되지 않아 연동이 성공한 지 한 시간
 * 뒤 조용히 죽는다(로그인용 소셜 인가를 재활용해도 결과가 같다 — 그래서
 * authApi.oauthStartUrl과 별개 함수로 둔다).
 */
export function googleCalendarAuthorizationUrl(redirectUri) {
  const base = import.meta.env.VITE_API_BASE_URL ?? ''
  const params = new URLSearchParams({ provider: 'GOOGLE', redirectUri: redirectUri ?? '' })
  return `${base}/external-calendar-authorization?${params.toString()}`
}

// --- 계정 (ACCT-01/02) -------------------------------------------------------------

/*
  PATH CORRECTION (실서버 대조 2026-07-29): 계정/프로필은 하나의 UserController
  가 소유한다 — 조회는 GET `/users/me`, 수정은 PATCH `/users/me/profile`
  (부분 수정). 이 파일이 [가정-확장]으로 쓰던 `/users/me/account`는 서버에
  없는 경로였다. 응답은 {userId, email, loginType, socialProvider, name,
  purpose, timezone, weekStartDay} 한 덩어리라 계정 화면과 프로필 화면이 같은
  레코드를 읽는다.
*/

/** GET /users/me (ACCT-01 — 계정+프로필 한 덩어리). */
export function getAccount() {
  return withDevFallback(
    () => apiClient.get('/users/me'),
    () => mockBackend.getAccount(),
  )
}

/** PATCH /users/me/profile (ACCT-01 이름 변경 · ONB-02 — 부분 수정). */
export function updateAccount(patch) {
  return withDevFallback(
    () => apiClient.patch('/users/me/profile', patch),
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
