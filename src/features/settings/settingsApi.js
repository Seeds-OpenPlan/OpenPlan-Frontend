/*
  OP functions for the ST-F1-12 설정 screens. 계정(account, deactivate 제외)·
  알림(notification-settings)은 여전히 07 API 명세서에 없는 [가정-확장]이다
  (개별 플래그, 일방적 확정 아님). **연동(connections)·기본값+가용 시간
  (preferences)·계정 비활성화는 예외** — W6(2026-08-23)에 그 계약들이 확정돼
  [가정-확장] 딱지를 뗐다(각 섹션 자신의 헤더 코멘트 참조).

  가용 시간 범위·고정 일정·주차 예외 already have a REAL contract
  (ST-B1-09/ST-B2-12/13) and are NOT re-declared here — screens read those
  straight from `features/plan/planApi.js` and
  `features/plan/fixedScheduleApi.js`. "가용 시간"(사용자 입력 주간 목표치,
  아래 §기본값+가용 시간 섹션)은 그 REAL availabilities 계약과는 별개 필드지만,
  W6부터는 `/users/me/preferences`라는 REAL 리소스의 일부다(더 이상
  [가정-확장] 아님 — 오너 결정 2026-07-25가 정한 "범위 합과 다른 개념"이라는
  구분 자체는 그대로 유지).

  Reuses planApi's withDevFallback (the one shared mock-fallback rule — see
  that function's own header) rather than redefining it a third/fourth time,
  same choice statsApi.js already made.
*/
import { apiClient } from '../../api/client'
import { withDevFallback } from '../plan/planApi'
import { mockBackend } from './settingsFixtures'
import { unwrapList } from '../../api/unwrap'

// --- 기본값 + 가용 시간 (FIX-10~12, W6 계약 정합 2026-08-23) ----------------------
//
// W6 PATH CORRECTION (팀장 지시, 근거: 오민아 실서버 실측 목록 ①-B): 가용
// 시간(사용자 입력 주간 목표치)과 기본값(예상 시간 기본값·재계획 전략
// 기본값)은 이전엔 서로 다른 [가정-확장] 엔드포인트 — GET/PUT
// `/users/me/availability-target`(가용 시간 전용) vs GET/PATCH
// `/users/me/preferences`(기본값 전용) — 로 나뉘어 있었지만, 실제로는
// `/users/me/preferences` 하나의 REAL 리소스가 세 필드를 함께 들고 있다:
// `{ defaultEstimatedMinutes, defaultReplanStrategy, weeklyAvailableMinutes }`.
//
// 🔴 가용 시간 저장이 막혀 있던 원인이 이것이다(8/23 실서버 로그 실측): 가용
// 시간 화면이 먼저 (더 이상 존재하지 않는) `availability-target`을 GET해
// 404를 받고, 그 뒤로 진짜 저장 PUT조차 서버에 나가지 못했다.
//
// 🔴 PUT은 전체 교체다(정본 문구). 세 필드 중 하나만 바꿔도 나머지 둘을 함께
// 싣지 않으면 서버가 그 값들을 null로 지운다 — 그래서 모든 쓰기가
// `putPreferences`(먼저 GET으로 현재 세 필드를 받고 그 위에 patch를 얹어
// PUT하는 read-modify-write) 하나를 거친다.
//
// 기존에 이 리소스를 쓰던 두 화면(가용 시간 화면·기본값 화면)은 이미
// `getWeeklyAvailableMinutes`/`updateWeeklyAvailableMinutes`와
// `getPreferences`/`updatePreferences`라는 서로 다른 함수 이름 4개로 나뉘어
// 있었다 — 그 네 함수의 시그니처(인자·반환 모양)는 그대로 두고 내부만 이
// 하나의 공유 리소스로 합친다. 화면·훅(useSettings.js) 어느 쪽도 호출
// 형태를 바꿀 필요가 없다.

/** GET 응답을 세 필드 다 갖춘 모양으로 고정한다 — 서버가 아직 값이 없는
 * 필드를 아예 생략해 보내도(신규 사용자 등) `undefined`가 아니라 `null`로
 * 떨어지게 해, merge(`{...current, ...patch}`)가 실수로 필드를 빠뜨리지
 * 않도록 한다. */
function normalizePreferences(r) {
  return {
    defaultEstimatedMinutes: r?.defaultEstimatedMinutes ?? null,
    defaultReplanStrategy: r?.defaultReplanStrategy ?? null,
    weeklyAvailableMinutes: r?.weeklyAvailableMinutes ?? null,
  }
}

/** GET /users/me/preferences. 세 필드(기본 예상 시간·기본 재계획 전략·가용
 * 시간)를 한 번에 돌려준다 — 기본값 화면·가용 시간 화면 둘 다 (직접 또는
 * `getWeeklyAvailableMinutes`를 통해) 이 하나의 GET을 공유한다. */
export function getPreferences() {
  return withDevFallback(
    () => apiClient.get('/users/me/preferences'),
    () => mockBackend.getPreferences(),
  ).then(normalizePreferences)
}

/** 가용 시간 화면 전용 read. 같은 GET에서 한 필드만 골라 쓴다 — 이 함수의
 * 반환 모양(bare number)은 기존 그대로 유지해, 그 화면의 `capacityQuery.data`
 * 소비 코드를 고칠 필요가 없게 한다. */
export function getWeeklyAvailableMinutes() {
  return getPreferences().then((p) => p.weeklyAvailableMinutes)
}

/**
 * PUT /users/me/preferences — read-modify-write 본체. `patch`가 세 필드 중
 * 무엇이든(가용 시간 하나든 재계획 전략 하나든) 먼저 GET으로 현재 값을 전부
 * 받고 그 위에 얹어 통째로 PUT한다 — PUT 전체 교체이므로 이렇게 하지 않으면
 * patch에 없는 나머지 필드가 서버에서 null로 지워진다(위 섹션 헤더 참조).
 * 두 공개 write 함수(updatePreferences/updateWeeklyAvailableMinutes)가 이
 * 하나의 헬퍼를 공유해, read-modify-write 로직이 두 곳에 따로 살지 않는다.
 */
function putPreferences(patch) {
  return getPreferences().then((current) => {
    const body = { ...current, ...patch }
    return withDevFallback(
      () => apiClient.put('/users/me/preferences', body),
      () => mockBackend.updatePreferences(body),
    ).then(normalizePreferences)
  })
}

/** 기본값 화면(SettingsDefaultsPage) 전용 write. `patch` = 예:
 * `{ defaultReplanStrategy }` — read-modify-write 뒤 갱신된 세 필드 전체를
 * 돌려준다(화면은 그중 defaultReplanStrategy만 읽는다). */
export function updatePreferences(patch) {
  return putPreferences(patch)
}

/** 가용 시간 화면(SettingsAvailabilityPage) 전용 write. `minutes`는 5분
 * 배수(공통 불변식 E-COM-009) — read-modify-write 뒤 그 필드 하나만 돌려준다
 * (반환 모양을 기존 그대로 유지 — `useUpdateWeeklyAvailableMinutes`의
 * 캐시가 bare number를 기대한다). */
export function updateWeeklyAvailableMinutes(minutes) {
  return putPreferences({ weeklyAvailableMinutes: minutes }).then((p) => p.weeklyAvailableMinutes)
}

/**
 * GET /users/me/preference-suggestions (RB-FIX-01). W6 PATH CORRECTION
 * (팀장 지시): 이전 `/users/me/preferences/suggestions`에서 주소만 바뀌었다
 * — 계약(openapi-live-76c7009.yaml)엔 아직 `x-implementation-status:
 * not-implemented`로 남아 있어([미구현], 서버 미제공) 응답을 못 받을 때는
 * 지금처럼 mock 폴백으로 흡수한다. 실제로 뜨면 `{ suggestedStrategy, reason,
 * sampleSize }` 또는 이력 부족 시 `null`(오류 아님)을 기대한다 — 그 "제안
 * 없음" 상태는 stats의 getCorrectionProposal처럼 계속 재현 가능해야 하므로
 * 가짜 값으로 덮지 않는다.
 */
export function getSuggestion() {
  return withDevFallback(
    () => apiClient.get('/users/me/preference-suggestions'),
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

/**
 * DELETE /users/me (W6 PATH CORRECTION, 팀장 지시 — 이전 `POST
 * /users/me/deactivation` [가정-확장]에서 주소·메서드 둘 다 바뀌었다).
 *
 * ⚠️ 응답 모양이 이전 mock과 다르다: 계약은 `{ recoverableUntil }`
 * (복구 가능 마감 시각) 하나뿐이다 — `status`/`deactivatedAt`/
 * `reactivationDeadlineDays` 같은 필드는 계약에 없다(GET /users/me가 돌려주는
 * UserProfile 스키마 자체에도 이 필드들이 없다 — 계정 상태 표시는 여전히
 * [가정-확장]인 채로 남는다, 팀장 보고 대상). 그래서 이 함수는 서버 응답을
 * 그대로 캐시에 덮어쓰지 않고 `recoverableUntil`만 넘긴다 — 기존 계정 캐시
 * 필드(name/email 등)를 보존한 채 병합하는 건 호출부(useSettings.js의
 * useDeactivateAccount)의 몫이다.
 */
export function deactivateAccount() {
  return withDevFallback(
    () => apiClient.delete('/users/me'),
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
