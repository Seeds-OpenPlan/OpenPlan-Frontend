/*
  OP functions for ST-F1-14 (인증 화면). Mirrors settingsApi.js's own contract:
  every export is 1 OP, real call first, DEV-only mock fallback on network
  error/unimplemented-404 via withDevFallback (defined once in planApi.js —
  reused here rather than redeclared, same choice settingsApi.js/statsApi.js
  already made). mock→real diff stays base-URL-only (charter §G3/§A4).

  ACCT-01/02(이름 변경·계정 조회)와, **로그인된 사용자 자신의** ACCT-04/05
  (비활성화·재활성화)는 이미 settingsApi.js/settings/useSettings.js에 있다 —
  여기서 다시 선언하지 않는다. useAuth.js가 그 훅들(useAccount/
  useDeactivateAccount/useReactivateAccount)을 그대로 재-export해,
  SettingsAccountPage의 OVL-ACCT-DEACT/REACT가 같은 호출을 그대로 쓴다.

  `reactivate(email)`는 그것과 다른 함수다(Thomas 리뷰 MAJOR) — SCR-AUTH-LOGIN
  이 로그인 실패(E-AUTH-DEACTIVATED)로 얻은, **아직 로그인하지 않은 남의 계정을
  email로 지목해** 재활성화하는 경로라 세션 기반인 settingsApi 쪽 재활성화와
  전제 자체가 다르다(그 함수는 "지금 로그인된 나"만 다룬다 — email 인자가
  없다). 두 경로 모두 서버에서는 결국 `POST /auth/reactivations`로 만나겠지만,
  이 mock 단계에서는 authFixtures.users(로그인 시도로 얻는 계정들)와
  settingsFixtures.account(설정 화면의 단일 데모 계정)가 서로 다른 저장소라
  섞어 쓸 수 없다 — 그래서 별도 함수·별도 mock 데이터로 분리한다.

  DELETE /users/me(ACCT-06)는 이 스토리의 어떤 AC도 버튼으로 트리거하지
  않는다 — 유예기간 경과 후 삭제는 서버가 자동으로 하는 시스템 동작이라는
  것이 유저스토리 자체의 명시("30일간의 비활성화 이후 완전히 데이터가
  삭제된다")이자 ux-flow-map의 커버리지 표가 이미 "ACCT-06 = 화면 없음(시스템)"
  으로 확정한 부분이라, 클라이언트가 호출하는 함수를 만들지 않는다(죽은 코드
  방지 — 실제 호출부가 생기는 시점에 그 스토리에서 추가).

  소셜 로그인(AUTH-02·AC4)은 이 파일에 OP 함수가 없다: 실 흐름은 브라우저가
  OAuth 프로바이더로 완전히 리다이렉트했다가 콜백 쿼리스트링(`?error=
  E-AUTH-010`)으로 돌아오는 것이라 우리 axios 인스턴스를 거치는 API 호출 자체가
  아니다(api-contracts.md §3.4 "transport: 쿼리스트링 error 파라미터 — 봉투
  아님"). 그래서 소셜 버튼의 mock 동작은 LoginPage가 직접 라우팅으로 흉내
  낸다 — 실제 통합 시 그 자리를 `window.location.href = OAuth 시작 URL`로
  바꾸면 된다(LoginPage 주석 참조).
*/
import { apiClient } from '../../api/client'
import { withDevFallback } from '../plan/planApi'
import { authMockBackend } from './authFixtures'

/** POST /auth/login ([가정-확장]). */
export function login(email, password) {
  return withDevFallback(
    () => apiClient.post('/auth/login', { email, password }),
    () => authMockBackend.login(email, password),
  )
}

/** POST /auth/signup ([가정-확장]). */
export function signup({ name, email, password }) {
  return withDevFallback(
    () => apiClient.post('/auth/signup', { name, email, password }),
    () => authMockBackend.signup({ name, email, password }),
  )
}

/** POST /auth/email-verifications ([가정-확장], AUTH-04). */
export function verifyEmail(token) {
  return withDevFallback(
    () => apiClient.post('/auth/email-verifications', { token }),
    () => authMockBackend.verifyEmail(token),
  )
}

/** POST /auth/email-verifications/resend ([가정-확장], AUTH-03 AC5 60초 쿨다운). */
export function resendVerificationEmail(email) {
  return withDevFallback(
    () => apiClient.post('/auth/email-verifications/resend', { email }),
    () => authMockBackend.resendVerificationEmail(email),
  )
}

/** POST /auth/password-resets ([가정-확장], AUTH-05). 계정 존재 비노출 — 항상 동일 응답. */
export function requestPasswordReset(email) {
  return withDevFallback(
    () => apiClient.post('/auth/password-resets', { email }),
    () => authMockBackend.requestPasswordReset(email),
  )
}

/** PATCH /auth/password-resets ([가정-확장], AUTH-06). */
export function confirmPasswordReset({ token, password }) {
  return withDevFallback(
    () => apiClient.patch('/auth/password-resets', { token, password }),
    () => authMockBackend.confirmPasswordReset({ token, password }),
  )
}

/**
 * POST /auth/logout ([가정-확장], ACCT-03). Best-effort server call — the
 * caller (SettingsAccountPage) clears the local session cache and navigates
 * regardless of this promise's outcome (dev-auth stub means there is no real
 * server session to actually invalidate yet; see that page's own comment).
 */
export function logout() {
  return withDevFallback(
    () => apiClient.post('/auth/logout'),
    () => authMockBackend.logout(),
  )
}

/**
 * POST /auth/reactivations ([가정-확장], ACCT-05). email로 지목한, 아직
 * 로그인하지 않은 계정을 재활성화한다 — SCR-AUTH-LOGIN의 OVL-ACCT-REACT
 * 전용(이 파일 헤더의 "reactivate vs settingsApi" 구분 참조). 실 서버에서는
 * 세션 없이도 처리 가능한 별도 인가(재설정 링크 등)가 필요하겠지만, 이
 * mock 단계에서는 로그인 실패 응답이 이미 준 email을 그대로 body에 싣는다.
 */
export function reactivate(email) {
  return withDevFallback(
    () => apiClient.post('/auth/reactivations', { email }),
    () => authMockBackend.reactivate(email),
  )
}
