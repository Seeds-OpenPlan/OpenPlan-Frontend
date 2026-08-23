/*
  DEV-ONLY in-memory mock backend for the settings screens. 기본값
  (preferences)·제안(suggestions)·계정(account)·알림(notification-settings)은
  07 API 명세서에 없는 [가정-확장]이다 — settingsApi.js's own header for the
  one rule this whole module follows (isolate the guess so only the
  normalize/base-URL layer changes once BE settles on a real shape). **연동
  (connections)은 W6부터 예외** — external-calendar-connections 계약이 확정돼
  이 mock도 그 모양(connectionId·status)을 그대로 흉내낸다(그 섹션 자신의
  헤더 코멘트 참조). withDevFallback이 여전히 이 mock으로 폴백시켜 주는 것은
  "계약이 정해졌다"는 것과 "실서버가 이 사이클에 붙어 있다"는 것이 별개이기
  때문 — 애플 경로는 BE PR #33이 아직 로컬에 없어 dev에서 이 mock 없이는
  전혀 시연할 수 없다.

  가용 시간 범위(요일별 창)·고정 일정·주차 예외 have a REAL contract already and
  are served by planApi.js/fixedScheduleApi.js's own mocks (planFixtures.js) —
  this file never duplicates those. "가용 시간"(사용자가 직접 입력하는 주간
  목표치, 오너 결정 2026-07-25 — 가용 시간 범위의 단순 합과는 다른 값) is the
  ONE exception: ST-B1-09's availabilities 계약에 없는 [가정-확장] 필드라 REAL
  쪽이 아니라 여기 산다 (see the "가용 시간 (사용자 입력)" section below).

  Same latency/id conventions as planFixtures.js (kept independent rather than
  imported — this module has no reason to share planFixtures' `weeks` Map or
  any of its plan-specific state).
*/

const MOCK_LATENCY_MS = 70
const delay = (ms = MOCK_LATENCY_MS) => new Promise((resolve) => setTimeout(resolve, ms))

// --- 기본값 + 가용 시간 (FIX-10~12, W6 계약 정합 2026-08-23) ---------------------
// W6부터 세 필드(기본 예상 시간·기본 재계획 전략·가용 시간)가 REAL
// `/users/me/preferences` 리소스 하나로 합쳐졌다(settingsApi.js 자신의 헤더
// 참조) — 이 mock도 그 모양을 그대로 흉내낸다. "가용 시간"(사용자가 직접
// 정하는 주간 목표치)이 "가용 시간 범위"(요일별 9-6 창)의 단순 합과 다른
// 개념이라는 구분(오너 결정 2026-07-25)은 필드가 합쳐진 뒤에도 그대로다 —
// 범위·고정일정과 무관하게 독립적으로 저장된다.
//
// Keys match replanStrategies.js's replanStrategyCatalog exactly (그 카탈로그가
// 유일한 명칭 출처 — J1과 같은 원칙), so the radio labels never diverge from the
// 재계획 모달이 이미 쓰는 4개 명칭. `defaultEstimatedMinutes`는 아직 이 화면에
// 편집 UI가 없어(taskApi.js normalizeTask의 하드코딩 60 주석 참조) null로
// 시작한다 — 계약엔 있는 필드이니 read-modify-write PUT이 항상 실어 보내는
// 자리는 마련해 둔다.
let preferences = {
  defaultEstimatedMinutes: null,
  defaultReplanStrategy: 'MINIMAL_CHANGE',
  weeklyAvailableMinutes: 30 * 60, // 기본값 예시: 30시간
}

// --- RB-FIX-01 제안 칩: 최근 재계획 선택 이력을 반영한 "다른 기본값이 어떠세요" 제안.
// 선택 전 자동 적용 금지(C-2)는 화면(Hook) 쪽 책임 — 이 mock은 그냥 제안값만 준다.
// null이면 "제안 없음" 상태(이력 부족 등)를 그대로 보여줘야 하므로, 대상 자체를 지우지
// 않는다(getCorrectionProposal의 "없음 그룹" 처리와 같은 이유).
const suggestion = {
  suggestedStrategy: 'DEADLINE_FIRST',
  reason: '최근 재계획에서 마감 우선안을 3회 선택했습니다',
  sampleSize: 3,
}

// --- 연동 (FIX-13~17 + 신규 연동 생성): external-calendar-connections 계약 정합 ---
// W6(2026-08-23) 모델 교체: provider가 아니라 서버가 발급하는 connectionId가
// 유일 키다 — 같은 provider를 해제 후 재연결하면 새 connectionId가 생기므로
// 배열은 이제 "이미 수립된 연동만" 담는다(0~2개). GOOGLE은 기존 시나리오를
// 그대로 시연할 수 있게 미리 연결된 상태로 시작하고, APPLE은 **의도적으로
// 비워 둔다** — 새로 만든 [연동하기] → AppleConnectDialog 흐름을 아무 시드
// 없이도 바로 밟아볼 수 있어야 이 사이클의 핵심 변경(신규 연동 생성)이
// 검증된다.
let connections = [
  {
    connectionId: 'conn-google-demo',
    provider: 'GOOGLE',
    status: 'CONNECTED',
    accountIdentifier: 'user@gmail.com',
    selectedCalendarIds: ['gcal-1', 'gcal-2'],
  },
]

// getAvailableCalendars가 connectionId로 조회하는 provider별 캘린더 카탈로그.
// 이전 라운드는 이 목록을 connections 배열 위에 얹어 뒀지만, 계약이 별도
// GET .../{connectionId}/calendars 엔드포인트로 분리해 뒀으므로(팀장 지시 표)
// 여기서도 별도 저장소로 둔다.
const CALENDAR_CATALOG = {
  GOOGLE: [
    { id: 'gcal-1', name: '기본 캘린더' },
    { id: 'gcal-2', name: '업무' },
    { id: 'gcal-3', name: '스터디 그룹' },
  ],
  APPLE: [
    { id: 'ical-1', name: 'iCloud 캘린더' },
    { id: 'ical-2', name: '가족 공유' },
  ],
}

let nextConnectionSeq = 1
// DEV QA 트리거 전용 — 실서버 없이 502 "재시도" 버튼의 성공 경로까지 눈으로
// 확인할 유일한 방법이라 이메일 한 값을 예약해 둔다(authFixtures.js가 특정
// 데모 이메일로 로그인 실패 종류를 흉내내는 것과 같은 관례, 그 파일 87행 참조).
// 이 appleId로 첫 제출은 502로 실패하고, 재시도(같은 값)는 성공한다.
const FLAKY_APPLE_ID = 'flaky-gateway@icloud.com'
const flakyRetried = new Set()

// --- 계정 (ACCT-01/02) -----------------------------------------------------------
let account = {
  name: '오픈플랜 사용자',
  email: 'user@openplan.dev',
  createdAt: '2026-03-02T00:00:00.000Z',
  status: 'ACTIVE', // 'ACTIVE' | 'DEACTIVATED'
  deactivatedAt: null,
  // ACCT-04/05가 다루는 "복구 기한"의 자리만 잡아 둠 — 실제 문구/일수는 ST-F1-14
  // 확정 시 이 필드 하나만 바뀌면 되게.
  reactivationDeadlineDays: 30,
}

// --- 알림 (NOTI-01): 5종 즉시저장 토글 --------------------------------------------
// masterEnabled (ST-F1-15 오너 피드백 #5 — 전체 알림 켜기/끄기): 개별 5종과
// 같은 오브젝트의 필드 하나일 뿐이라 patchNotificationSetting('masterEnabled',
// …)이 그대로 재사용된다 — 이 마스터 스위치 하나 때문에 별도 엔드포인트/모양을
// 만들지 않는다. 5종의 실제 값에서 "전부 켜짐"을 매번 계산해 마스터 상태로
// 쓰지 않고 독립 필드로 저장하는 이유는 SettingsNotificationsPage.jsx 자신의
// 헤더 주석 참고 — 계산값으로 두면 개별 토글 하나만 꺼도 마스터가 즉시
// "꺼짐"으로 튀어 나머지 개별 토글까지 갑자기 비활성화되는 함정이 있다.
let notificationSettings = {
  masterEnabled: true,
  dueSoonTasks: true, // 마감 임박 태스크
  planRisk: true, // 계획 위험(과부하) 경고
  inquiryReply: true, // 문의 답변
  announcement: false, // 공지사항
  weeklyReminder: true, // 주간 계획 작성 리마인더
}

export const mockBackend = {
  // GET /users/me/preferences — 세 필드(기본 예상 시간·기본 재계획 전략·가용
  // 시간)를 한 번에 돌려준다. settingsApi.getWeeklyAvailableMinutes는 이
  // 함수를 거쳐 그중 한 필드만 골라 읽는다(별도 mock 함수를 두지 않는다 —
  // 실서버에도 별도 엔드포인트가 없다).
  async getPreferences() {
    await delay()
    return { ...preferences }
  },

  // PUT 전체 교체 (정본 문구). settingsApi.putPreferences가 이미 GET 결과에
  // patch를 얹어 "빠진 필드 없는" 완전한 객체를 보내므로, mock도 부분 merge가
  // 아니라 받은 그대로 갈아 끼운다 — 실서버 동작과 동형이어야 read-modify-write
  // 로직 자체(그걸 빠뜨리면 나머지 필드가 null로 지워지는 버그)를 이 mock
  // 위에서는 재현할 수 없게 되는 것을 막는다.
  async updatePreferences(body) {
    await delay()
    preferences = { ...body }
    return { ...preferences }
  },

  async getSuggestion() {
    await delay(60)
    return { ...suggestion }
  },

  async getConnections() {
    await delay(60)
    return { connections: connections.map((c) => ({ ...c })) }
  },

  // GET .../{connectionId}/calendars — provider 카탈로그에서 그대로 찾아준다
  // (실서버는 실제 CalDAV/구글 API 왕복을 하겠지만, mock은 형태만 흉내낸다).
  async getAvailableCalendars(connectionId) {
    await delay(60)
    const conn = connections.find((c) => c.connectionId === connectionId)
    if (!conn) {
      const err = new Error('mock: unknown connectionId')
      err.status = 404
      throw err
    }
    return { calendars: (CALENDAR_CATALOG[conn.provider] ?? []).map((c) => ({ ...c })) }
  },

  // PATCH 연동 status (FIX-16 Toggle — 일시 정지/재개, 파괴적이지 않음).
  // DELETE(연동 해제)와 다른 동작이라 여기서는 확인창을 거치지 않는다.
  async setConnectionStatus(connectionId, status) {
    await delay()
    const conn = connections.find((c) => c.connectionId === connectionId)
    if (!conn) {
      const err = new Error('mock: unknown connectionId')
      err.status = 404
      throw err
    }
    conn.status = status
    return { ...conn }
  },

  // PUT 전체 교체 (FIX-15). 배열 자체를 그대로 덮어써 부분 패치를 허용하지 않음
  // — 정본 문구 그대로 "PUT 전체 교체".
  async replaceSelectedCalendars(connectionId, calendarIds) {
    await delay()
    const conn = connections.find((c) => c.connectionId === connectionId)
    if (!conn) {
      const err = new Error('mock: unknown connectionId')
      err.status = 404
      throw err
    }
    conn.selectedCalendarIds = [...calendarIds]
    return { ...conn }
  },

  // DELETE .../{connectionId} (FIX-17 연동 해제 — 확인창은 화면 쪽 책임, 이미
  // "확인"을 누른 뒤에만 이 호출이 옴). status 변경이 아니라 행 자체를 배열에서
  // 제거한다 — "미연결"로 완전히 되돌아가는 유일한 경로.
  async disconnectConnection(connectionId) {
    await delay()
    const idx = connections.findIndex((c) => c.connectionId === connectionId)
    if (idx === -1) {
      const err = new Error('mock: unknown connectionId')
      err.status = 404
      throw err
    }
    connections.splice(idx, 1)
    return { connectionId }
  },

  /**
   * POST /external-calendar-connections (신규 연동 생성). 세 가지 오류를
   * 상태코드로 구분해 던진다 — settingsApi.js의 createConnection 헤더가
   * 설명하듯, AppleConnectDialog가 이 셋을 서로 다른 화면으로 분기해야 하므로
   * mock도 실서버와 같은 모양(상태코드)으로 실패해야 그 분기를 검증할 수
   * 있다:
   *   409 — 같은 provider가 이미 CONNECTED (E-EXT-004, 6주차 문서 명시)
   *   422 — 애플 자격증명이 형식상 유효하지 않음(이메일 아님/앱 암호 형태
   *         아님 — 흔히 일반 로그인 비밀번호를 그대로 입력하는 실패 패턴을
   *         흉내낸다) · 구글 authCode/state 누락
   *   502 — FLAKY_APPLE_ID로 첫 제출만 일부러 실패시켜, 재시도 버튼이 같은
   *         입력으로 다시 보내면 성공하는 것까지 눈으로 확인할 수 있게 한다
   */
  async createConnection(body) {
    await delay()
    const { provider } = body

    if (connections.some((c) => c.provider === provider && c.status === 'CONNECTED')) {
      const err = new Error('mock: already connected')
      err.code = 'E-EXT-004'
      err.status = 409
      throw err
    }

    if (provider === 'APPLE') {
      const { appleId, appPassword } = body

      if (appleId === FLAKY_APPLE_ID && !flakyRetried.has(appleId)) {
        flakyRetried.add(appleId)
        const err = new Error('mock: simulated gateway failure (first attempt only)')
        err.status = 502
        throw err
      }

      // 형태 검증만 흉내낸다 — 실제 CalDAV 핸드셰이크는 서버 몫. 이메일
      // 전체 형식(로컬파트만 금지)과, 일반 비밀번호와 구분되는 앱 암호 형태
      // (Apple이 발급하는 `xxxx-xxxx-xxxx-xxxx`, 소문자 4-4-4-4)를 확인한다.
      const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(appleId ?? '')
      const looksLikeAppPassword = /^[a-z]{4}-[a-z]{4}-[a-z]{4}-[a-z]{4}$/.test(appPassword ?? '')
      if (!looksLikeEmail || !looksLikeAppPassword) {
        const err = new Error('mock: invalid apple credentials')
        err.code = 'E-EXT-002'
        err.status = 422
        throw err
      }

      const conn = {
        connectionId: `conn-apple-${nextConnectionSeq++}`,
        provider: 'APPLE',
        status: 'CONNECTED',
        accountIdentifier: appleId,
        selectedCalendarIds: [],
      }
      connections.push(conn)
      return { ...conn }
    }

    if (provider === 'GOOGLE') {
      const { authCode, state } = body
      if (!authCode || !state) {
        const err = new Error('mock: missing oauth exchange params')
        err.code = 'E-EXT-002'
        err.status = 422
        throw err
      }
      const conn = {
        connectionId: `conn-google-${nextConnectionSeq++}`,
        provider: 'GOOGLE',
        status: 'CONNECTED',
        accountIdentifier: 'user@gmail.com',
        selectedCalendarIds: [],
      }
      connections.push(conn)
      return { ...conn }
    }

    const err = new Error('mock: unknown provider')
    err.status = 400
    throw err
  },

  async getAccount() {
    await delay(60)
    return { ...account }
  },

  // 이름 변경 (오너 리뷰 3차, item 5 — [가정-확장], 실 Swagger 없음). 지금은
  // name만 다루지만 patch 객체를 통째로 merge해 나중에 다른 필드(프로필
  // 사진 등)가 추가돼도 이 함수 시그니처가 안 바뀌게 한다.
  async updateAccount(patch) {
    await delay()
    account = { ...account, ...patch }
    return { ...account }
  },

  // ACCT-01 비활성화 진입의 실제 동작. 실제 OVL-ACCT-DEACT(ST-F1-14)가 아직 없어
  // 이 설정 화면이 최소 동작(모달 확인 → 상태 전환)까지만 대신한다 — 완결 우선 정책.
  async deactivateAccount() {
    await delay()
    account = { ...account, status: 'DEACTIVATED', deactivatedAt: new Date().toISOString() }
    return { ...account }
  },

  // ACCT-02 재활성화.
  async reactivateAccount() {
    await delay()
    account = { ...account, status: 'ACTIVE', deactivatedAt: null }
    return { ...account }
  },

  async getNotificationSettings() {
    await delay(60)
    return { ...notificationSettings }
  },

  // 즉시 저장 — 토글 하나마다 별도 호출(NOTI-01 AC "5종 토글 즉시 저장").
  async patchNotificationSetting(key, enabled) {
    await delay()
    notificationSettings = { ...notificationSettings, [key]: enabled }
    return { ...notificationSettings }
  },
}

export default mockBackend
