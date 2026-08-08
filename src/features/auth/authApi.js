/*
  OP functions for ST-F1-14 (인증 화면). Mirrors settingsApi.js's own contract:
  every export is 1 OP, real call first, DEV-only mock fallback. mock→real diff
  stays base-URL-only (charter §G3/§A4).

  PATHS (실서버 대조 2026-08-04 — AuthStubController.java, 직접 열어 확인): every
  path below now targets the REAL route the stub controller maps, not a guess.
  Every one of them except GET/DELETE /auth/session still answers 501
  E-AUTH-011 ("아직 제공되지 않는 기능") until 4주차 — see withAuthDevFallback's
  own header for how that's handled in DEV.

  (지난 대조, 2026-08-03, 틀렸던 것: login이 `/auth/login`을 불렀지만 실제는
  `/auth/sessions`; verifyEmail이 `/auth/email-verifications`를 불러 실제로는
  "발송" 엔드포인트에 부딪혔고 진짜 확정 경로 `/auth/email-verifications/
  confirmation`은 따로 있었다; resendVerificationEmail이 `/auth/email-
  verifications/resend`라는 존재하지 않는 경로를 불렀다; confirmPasswordReset이
  PATCH `/auth/password-resets`를 불렀지만 실제는 token이 경로 변수인
  `/auth/password-resets/{token}`. 틀린 경로들은 대부분 404 E-COM-004로
  떨어져 withDevFallback의 "미구현 404" 규칙에 우연히 걸려 mock으로 폴백됐지만,
  verifyEmail은 실제로 존재하는 다른 라우트(발송)와 겹쳐 501을 그대로 받았고,
  confirmPasswordReset은 500 E-COM-005로 떨어져 폴백도 안 됐다 — 둘 다 실서버가
  떠 있으면 화면이 그대로 깨지는 채였다.)

  ACCT-01/02(이름 변경·계정 조회)와, **로그인된 사용자 자신의** ACCT-04/05
  (비활성화·재활성화)는 이미 settingsApi.js/settings/useSettings.js에 있다 —
  여기서 다시 선언하지 않는다. useAuth.js가 그 훅들(useAccount/
  useDeactivateAccount/useReactivateAccount)을 그대로 재-export해,
  SettingsAccountPage의 OVL-ACCT-DEACT/REACT가 같은 호출을 그대로 쓴다.

  `reactivate(email)`는 그것과 다른 함수다(Thomas 리뷰 MAJOR) — SCR-AUTH-LOGIN
  이 로그인 실패(E-AUTH-008)로 얻은, **아직 로그인하지 않은 남의 계정을
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
import { authMockBackend } from './authFixtures'

/**
 * AUTH-ONLY dev fallback. Starts from planApi.js's `withDevFallback` rule
 * (network failure, or a 404 carrying E-COM-004 — Spring's generic "no route
 * at all") and adds exactly ONE more case: a 501 carrying E-AUTH-011. That
 * code is this backend's DELIBERATE "not built yet" marker for the whole auth
 * surface (AuthStubController.java's own doc comment: "나머지 인증 EP=501
 * E-AUTH-011" until 4주차) — not a generic server failure the way a stray 501
 * from anywhere else in the app would be.
 *
 * This rule is declared HERE, NOT added to the shared `withDevFallback` in
 * planApi.js, on purpose: every OTHER unimplemented endpoint in this codebase
 * still signals "not built" the SAME way Spring does automatically (404 +
 * E-COM-004, no handler for the route). Auth is the one surface where the
 * backend hand-codes a 501 instead. If the shared helper swallowed every 501
 * E-AUTH-011 globally, a genuine 501 from a module that ISN'T a deliberate
 * stub (a real crash reported with the wrong code, say) would also start
 * silently resolving to a mock response — this file is the only place a 501
 * is a known, intentional placeholder rather than a bug to surface.
 *
 * W4 SWITCH: every path this file calls already targets the REAL route
 * (실서버 대조 2026-08-04). Once BE-3 replaces AuthStubController with actual
 * implementations, EVERY function below starts getting real 200s/4xx instead
 * of 501 — the ONLY code change "going live" requires is deleting the
 * `isAuthStub` branch below (so a genuine future 501 stops being masked). Forgetting
 * that deletion is the failure mode: a real 501 from the live server would
 * keep silently falling back to the mock.
 */
async function withAuthDevFallback(realCall, mockCall) {
  try {
    return await realCall()
  } catch (error) {
    const isUnimplementedEndpoint = error?.status === 404 && error?.code === 'E-COM-004'
    const isAuthStub = error?.status === 501 && error?.code === 'E-AUTH-011'
    const shouldFallback = error?.isNetwork || isUnimplementedEndpoint || isAuthStub
    if (import.meta.env.DEV && shouldFallback) return mockCall()
    throw error
  }
}

/** POST /auth/sessions (로그인, AUTH-01). */
export function login(email, password) {
  return withAuthDevFallback(
    () => apiClient.post('/auth/sessions', { email, password }),
    () => authMockBackend.login(email, password),
  )
}

/**
 * POST /users (회원가입, AUTH-03). 실서버 대조 2026-08-08 — openapi.yaml
 * `operationId: signUp`이 이제 채워져 경로가 확정됐다(이전 주석은 "경로 자체가
 * 아직 없다"였다 — 그 시점엔 맞는 말이었지만 지금은 아니다). 경로가 `/auth/*`가
 * 아니라 `/users`인 이유: 가입은 세션이 아니라 계정 리소스 자체를 만드는
 * 동작이라 `users` 태그다(security: [] — 비인증 호출).
 *
 * body는 email·password·termsAgreed 셋뿐이다. `name`은 계약에 없다 — 이 앱은
 * 이름을 온보딩 ONB-02(`PATCH /users/me/profile`)에서 받으므로 가입 시점엔
 * 보낼 곳이 없다(폼 자체는 그대로 둔다 — SignupPage.jsx가 name을 검증에는
 * 계속 쓰되 서버로는 보내지 않는 이유와, 이후 화면으로 이어붙일 수 없는 이유를
 * 그 파일 주석에 남겨 뒀다). 201 응답은 `{ userId, emailVerificationRequired }`.
 *
 * 로컬 BE 대조(2026-08-08): 컨트롤러 라우트 자체가 아직 매핑되어 있지 않아
 * (x-implementation-status: not-implemented — AuthStubController가 아니라
 * UserController가 맡을 자리인데 핸들러가 없음) 501 E-AUTH-011이 아니라 Spring의
 * 일반 404 E-COM-004로 떨어진다. withAuthDevFallback의 기존 404 분기가 이미
 * 그 코드를 잡으므로 이 함수는 그 헬퍼를 변경 없이 그대로 쓴다.
 */
export function signup({ email, password, termsAgreed }) {
  return withAuthDevFallback(
    () => apiClient.post('/users', { email, password, termsAgreed }),
    () => authMockBackend.signup({ email, password, termsAgreed }),
  )
}

/** POST /auth/email-verifications/confirmation (이메일 인증 확정, AUTH-04). */
export function verifyEmail(token) {
  return withAuthDevFallback(
    () => apiClient.post('/auth/email-verifications/confirmation', { token }),
    () => authMockBackend.verifyEmail(token),
  )
}

/** POST /auth/email-verifications (인증 메일 발송, AUTH-03 AC5 60초 쿨다운). */
export function resendVerificationEmail(email) {
  return withAuthDevFallback(
    () => apiClient.post('/auth/email-verifications', { email }),
    () => authMockBackend.resendVerificationEmail(email),
  )
}

/** POST /auth/password-resets (재설정 메일 요청, AUTH-05). 계정 존재 비노출 — 항상 동일 응답. */
export function requestPasswordReset(email) {
  return withAuthDevFallback(
    () => apiClient.post('/auth/password-resets', { email }),
    () => authMockBackend.requestPasswordReset(email),
  )
}

/**
 * PATCH /auth/password-resets/{token} (재설정 확정, AUTH-06). token은 경로
 * 변수다(이전엔 body에만 실어 PATCH `/auth/password-resets`를 불렀는데, 그
 * 경로엔 핸들러가 없어 500 E-COM-005로 떨어졌었다 — 실서버 대조 2026-08-04 정정).
 */
export function confirmPasswordReset({ token, password }) {
  return withAuthDevFallback(
    () => apiClient.patch(`/auth/password-resets/${token}`, { password }),
    () => authMockBackend.confirmPasswordReset({ token, password }),
  )
}

/**
 * DELETE /auth/session (실서버 대조 2026-08-04 — AuthStubController). This is
 * one of only TWO auth endpoints the backend actually implements today (the
 * other is GET /auth/session, read via useAuth.js's useSession) — everything
 * else on this file's surface answers 501 E-AUTH-011 until 4주차 (see
 * withAuthDevFallback's own header). Best-effort — the caller
 * (SettingsAccountPage) clears the local session cache and navigates
 * regardless of this promise's outcome (dev-auth stub means there is no real
 * server session to actually invalidate yet; see that page's own comment).
 */
export function logout() {
  return withAuthDevFallback(
    () => apiClient.delete('/auth/session'),
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
  return withAuthDevFallback(
    () => apiClient.post('/auth/reactivations', { email }),
    () => authMockBackend.reactivate(email),
  )
}
