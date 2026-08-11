/*
  DEV-ONLY in-memory mock backend for ST-F1-14 (인증 화면). [가정-확장]
  throughout — the 12-endpoint auth surface (§2.1 in the 작업지시's "OP→API"
  citation) has no Swagger yet, so this file is the temporary source of truth,
  same role settingsFixtures.js/planFixtures.js already play for their own
  screens (see authApi.js's own header for the one rule this file follows).

  This story is explicitly SCOPED to mock screens only (owner: "화면만 만들어
  두고 4주차 실인증 때 가드에 연결") — dev-auth's stub session (OP-AUTH-SESSION,
  always 200) keeps auto-authenticating the whole app regardless of anything
  in this file. Nothing here changes what the router's session guard does.

  DEMO ACCOUNTS (all share password "password123") — deliberately fixed so
  every AC branch is reachable by typing a known email, not by editing code:
    user@openplan.dev         ACTIVE               → normal login success
    unverified@openplan.dev   PENDING_VERIFICATION → routes to SCR-AUTH-VERIFY
    deactivated@openplan.dev  DEACTIVATED, 9일 경과  → OVL-ACCT-REACT (복구 가능)
    expired@openplan.dev      DEACTIVATED, 40일 경과 → OVL-ACCT-REACT (삭제 안내, ACCT-06)
  Any other email/password → generic invalid-credential error (account
  existence never disclosed — ui-spec §AUTH, AC2).
*/

import { deriveReactivationInfo } from './reactivationInfo'

const MOCK_LATENCY_MS = 70
const delay = (ms = MOCK_LATENCY_MS) => new Promise((resolve) => setTimeout(resolve, ms))

const DAY_MS = 24 * 60 * 60 * 1000
const daysAgo = (n) => new Date(Date.now() - n * DAY_MS).toISOString()

function authError(code, status, details = null) {
  const err = new Error(`mock: ${code}`)
  err.code = code
  err.status = status
  err.details = details
  return err
}

let users = [
  {
    userId: 'dev-user-0001',
    email: 'user@openplan.dev',
    password: 'password123',
    name: '오픈플랜 사용자',
    status: 'ACTIVE',
    deactivatedAt: null,
  },
  {
    userId: 'dev-user-0002',
    email: 'unverified@openplan.dev',
    password: 'password123',
    name: '신규 사용자',
    status: 'PENDING_VERIFICATION',
    deactivatedAt: null,
  },
  {
    userId: 'dev-user-0003',
    email: 'deactivated@openplan.dev',
    password: 'password123',
    name: '휴면 사용자',
    status: 'DEACTIVATED',
    deactivatedAt: daysAgo(9),
  },
  {
    userId: 'dev-user-0004',
    email: 'expired@openplan.dev',
    password: 'password123',
    name: '만료 사용자',
    status: 'DEACTIVATED',
    deactivatedAt: daysAgo(40),
  },
]

// 재활성화 유예기간(ACCT-04/05 AC) — SettingsAccountPage가 이미 이 이름의 필드를
// 응답에 실어 보내던 것과 값을 맞춘다(그 파일의 `reactivationDeadlineDays: 30`).
const REACTIVATION_DEADLINE_DAYS = 30

export const authMockBackend = {
  async login(email, password) {
    await delay()
    const user = users.find((u) => u.email === email)
    // 존재하지 않는 계정과 비밀번호 불일치를 하나의 카피/코드로 통일 — 계정
    // 존재 자체를 노출하지 않는다(ui-spec §AUTH, AC2). 코드는 실서버 카탈로그의
    // E-AUTH-001 "이메일 또는 비밀번호가 올바르지 않습니다"(401) — 이전엔
    // 서버 enum에 없는 `E-AUTH-401`을 임의로 썼다(실서버 대조 2026-08-03 정정).
    if (!user || user.password !== password) {
      throw authError('E-AUTH-001', 401)
    }
    if (user.status === 'PENDING_VERIFICATION') {
      // 실서버 E-AUTH-005 "이메일 인증 미완료 계정"(403) — 이전 `E-AUTH-UNVERIFIED`
      // 는 존재하지 않는 코드였다.
      throw authError('E-AUTH-005', 403, { email: user.email })
    }
    if (user.status === 'DEACTIVATED') {
      // 실서버 E-AUTH-008 "비활성화된 계정" — status는 403이 아니라 409(카탈로그
      // 확인). 이전 `E-AUTH-DEACTIVATED`/403은 존재하지 않는 코드+틀린 status였다.
      throw authError('E-AUTH-008', 409, {
        // email 포함 — LoginPage가 "이 이메일을 재활성화하라"고 뒤이어 부르는
        // reactivate(email)에 그대로 넘겨준다(Thomas 리뷰 MAJOR: 로그인 실패로
        // 얻은 이 계정 자체를 재활성화해야지, settingsFixtures의 별개
        // account 싱글턴을 바꿔서는 재로그인이 계속 실패한다).
        email: user.email,
        ...deriveReactivationInfo({
          deactivatedAt: user.deactivatedAt,
          reactivationDeadlineDays: REACTIVATION_DEADLINE_DAYS,
        }),
      })
    }
    return { userId: user.userId, name: user.name, email: user.email, status: user.status }
  },

  // 실서버 계약(openapi `/users` operationId: signUp, 실서버 대조 2026-08-08):
  // body는 email·password·termsAgreed뿐이다 — name은 계약에 없어(authApi.js
  // signup 헤더 참조) 이 mock도 인자에서 뺐다(termsAgreed는 mock이 검증하지
  // 않는다 — 실서버 유효성만 다루는 이 mock 단계에서 판별할 근거가 없다).
  // 새로 생성되는 계정 레코드는 name: null로 남는다 — 이름은 온보딩 단계에서
  // 채워질 몫이라 signup mock이 대신 채워 넣지 않는다.
  async signup({ email, password }) {
    await delay()
    if (users.some((u) => u.email === email)) {
      // 가입 자체는 이메일 중복을 알려줘야 사용자가 다음 행동(로그인/재설정)을
      // 고를 수 있다 — 로그인 실패와 달리 "계정 존재 비노출" 원칙이 적용되는
      // 지점이 아니다(본인이 방금 그 이메일을 입력한 발신자이므로). 실서버
      // E-AUTH-003 "이미 가입된 이메일"(409) — 이전 `E-AUTH-409`는 존재하지
      // 않는 코드였다(실서버 대조 2026-08-03 정정).
      throw authError('E-AUTH-003', 409, { field: 'email' })
    }
    const userId = `dev-user-${String(users.length + 1).padStart(4, '0')}`
    users = [...users, { userId, email, password, name: null, status: 'PENDING_VERIFICATION', deactivatedAt: null }]
    // 실서버 201 응답 형태(openapi `/users` 201 — 실서버 대조 2026-08-08):
    // { userId, emailVerificationRequired }. 이전엔 서버 계약에 없는
    // { userId, email, status }를 임의로 돌려주고 있었다.
    return { userId, emailVerificationRequired: true }
  },

  // 토큰 검증 mock — 실제 이메일 발송이 없어 resendVerificationEmail의 devHint
  // (`demo-${encodeURIComponent(email)}`)가 토큰 역할을 한다. Thomas 리뷰
  // BLOCKER: 이전엔 토큰을 무시하고 배열의 "첫 PENDING 계정"을 무조건
  // ACTIVE로 바꿔, 방금 가입한 계정 대신 데모 unverified@ 계정이 걸리는
  // 버그가 있었다 — 이제 토큰에서 email을 역파싱해 정확히 그 계정만 찾는다.
  // 'invalid'/'expired' 리터럴과, 형식이 안 맞거나 해당 이메일의 PENDING
  // 계정을 못 찾는 모든 경우가 실패로 귀결된다.
  async verifyEmail(token) {
    await delay()
    const match = typeof token === 'string' ? /^demo-(.+)$/.exec(token) : null
    const email = match ? decodeURIComponent(match[1]) : null
    const user = email ? users.find((u) => u.email === email && u.status === 'PENDING_VERIFICATION') : null
    if (!user) {
      // 실서버 E-AUTH-004 "이메일 인증 링크 만료"(410) — 이전 `E-AUTH-422`/422는
      // 존재하지 않는 코드+틀린 status였다(실서버 대조 2026-08-03 정정). 이
      // mock은 만료·형식오류·계정불명을 구분하지 않고 전부 이 코드로 귀결시킨다
      // (실서버도 "링크가 더 이상 유효하지 않다"는 하나의 결론으로 답한다).
      throw authError('E-AUTH-004', 410, { reason: 'INVALID_TOKEN' })
    }
    user.status = 'ACTIVE'
    return { verified: true }
  },

  async resendVerificationEmail(email) {
    await delay()
    // devHint: 실 메일 발송이 없는 개발 환경에서 인증 링크를 직접 재현할 수
    // 있게 하는 값 — 실 서버 응답에는 존재하지 않을 필드(화면은 이 값을
    // 소비하지 않고, 콘솔 로그 전용 디버그로만 쓴다).
    return { sent: true, devHint: `?token=demo-${encodeURIComponent(email)}` }
  },

  // 이메일 존재 여부와 무관하게 항상 동일한 성공 응답 — 계정 존재 비노출
  // 원칙을 재설정 요청에도 동일하게 적용(로그인 실패 카피와 같은 이유). 인자로
  // 받는 이메일 자체는 이 mock이 아무것도 판별하지 않으므로 시그니처에서 뺐다
  // (authApi.js 호출부는 그대로 email을 넘겨도 무방 — 여분 인자는 무시된다).
  async requestPasswordReset() {
    await delay()
    return { sent: true }
  },

  async confirmPasswordReset({ token }) {
    await delay()
    if (!token || token === 'invalid' || token === 'expired') {
      // 실서버 E-AUTH-006 "재설정 링크 만료·사용됨"(410) — verifyEmail의
      // E-AUTH-004와 이유는 같은 부류("링크가 더 이상 유효하지 않다")지만 엔드
      // 포인트가 달라 서버 코드도 다르다. 이전 `E-AUTH-422`/422는 존재하지
      // 않는 코드+틀린 status였다(실서버 대조 2026-08-03 정정).
      throw authError('E-AUTH-006', 410, { reason: 'INVALID_TOKEN' })
    }
    return { reset: true }
  },

  async logout() {
    await delay(40)
    return { loggedOut: true }
  },

  // 로그인 실패(E-AUTH-008)로 드러난 그 계정 자체를 재활성화한다 —
  // settingsFixtures의 단일 account 싱글턴(설정 화면 전용, 항상 user@ 컨텍스트)
  // 과는 별개(Thomas 리뷰 MAJOR). 대상을 못 찾으면(이미 재활성화됐거나 잘못된
  // email) 조용히 무시하지 않고 에러로 알린다 — 호출부가 "재활성화됐다"고
  // 낙관적으로 넘어가지 않게.
  async reactivate(email) {
    await delay()
    const user = users.find((u) => u.email === email && u.status === 'DEACTIVATED')
    if (!user) {
      // 자격 증명 실패가 아니라 "재활성화 대상 계정을 못 찾음"이라 E-AUTH
      // 네임스페이스가 아니라 공통 E-COM-004(404) — 이전 `E-AUTH-401`/401은
      // 존재하지 않는 코드였을 뿐 아니라 의미도 로그인 실패 것을 잘못 빌려 쓴
      // 것이었다(실서버 대조 2026-08-03 정정).
      throw authError('E-COM-004', 404)
    }
    user.status = 'ACTIVE'
    user.deactivatedAt = null
    return { email: user.email, status: user.status }
  },
}

export default authMockBackend
