/*
  DEV-ONLY in-memory mock backend for the settings screens the 07 API 명세서
  does NOT define yet: 기본값(preferences)·제안(suggestions)·연동(connections)·
  계정(account)·알림(notification-settings). [가정-확장] throughout this file —
  see settingsApi.js's own header for the one rule this whole module follows
  (isolate the guess so only the normalize/base-URL layer changes once BE
  settles on a real shape).

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

// --- 가용 시간 (사용자 입력, phase 1 — 오너 결정 2026-07-25) ---------------------
// "가용 시간 범위"(요일별 9-6 창)의 단순 합("가용 시간 범위 합계")과는 별개로,
// 사용자가 "이번 주에 실제로 계획에 할애할 수 있는 시간"을 직접 정하는 값 —
// glossary 최상위 "가용 시간" 개념 그 자체([가정-확장], ST-B1-09 availabilities
// 계약엔 없음). 범위·고정일정과 무관하게 독립적으로 저장된다. phase 1은 설정
// 화면 자체만 다루므로 주간계획/대시보드/V4 쪽에서는 아직 아무도 이 값을
// 읽지 않는다(오너가 별도 후속 브랜치로 뺌).
let weeklyAvailableMinutes = 30 * 60 // 기본값 예시: 30시간

// --- 기본값 (FIX-10~12): default replan strategy on RB-PLAN-02's own 3-택 gate ---
// Keys match replanStrategies.js's replanStrategyCatalog exactly (그 카탈로그가
// 유일한 명칭 출처 — J1과 같은 원칙), so the radio labels never diverge from the
// 재계획 모달이 이미 쓰는 4개 명칭.
let preferences = {
  defaultReplanStrategy: 'MINIMAL_CHANGE',
  version: 1,
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

// --- 연동 (FIX-13~17): 캘린더 연동 — 오너 4차 리뷰로 Google/Apple 다시 독립 항목.
// 라운드 2에서 "캘린더 연동" 단일 스위치로 합쳤던 것을 이 화면 한정으로 되돌림
// (오너 재확인: round-1처럼 provider별로 각자 연결/해제·캘린더 선택을 갖는
// 편이 맞다는 판단) — 독립 하위 화면(SettingsCalendarPage, 라운드 3)이라는
// 배치 결정 자체는 유지되고, 그 화면이 보여주는 데이터 모델만 배열로 복귀.
let connections = [
  {
    provider: 'GOOGLE',
    label: 'Google 캘린더',
    connected: true,
    availableCalendars: [
      { id: 'gcal-1', name: '기본 캘린더' },
      { id: 'gcal-2', name: '업무' },
      { id: 'gcal-3', name: '스터디 그룹' },
    ],
    selectedCalendarIds: ['gcal-1', 'gcal-2'],
  },
  {
    provider: 'APPLE',
    label: 'Apple 캘린더',
    connected: false,
    availableCalendars: [
      { id: 'ical-1', name: 'iCloud 캘린더' },
      { id: 'ical-2', name: '가족 공유' },
    ],
    selectedCalendarIds: [],
  },
]

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
  // 가용 시간 (사용자 입력, phase 1). 가용 시간 범위(patterns)와 완전히 별개의
  // 저장소 — 여기서 patterns를 참조하거나 검증하지 않는다(독립 값이라는
  // 오너 결정 그대로).
  async getWeeklyAvailableMinutes() {
    await delay(60)
    return { weeklyAvailableMinutes }
  },

  async updateWeeklyAvailableMinutes(minutes) {
    await delay()
    weeklyAvailableMinutes = minutes
    return { weeklyAvailableMinutes }
  },

  async getPreferences() {
    await delay()
    return { ...preferences }
  },

  // PATCH 대상 리소스가 tasks/projects/weekly_plans/schedules/fixed_schedules
  // 목록에 없어 공통 불변식의 version 낙관잠금 대상이 아니다([가정] — 전 스토리
  // 공통 불변식 문서가 명시한 5개 리소스에 preferences는 없음). 그래도 재요청
  // 경합을 흉내는 최소한으로 남겨 둔다: version 필드 자체는 응답에 계속 실어
  // 보내 이후 BE가 낙관잠금을 추가하기로 하면 이 필드 하나로 흡수되게 한다.
  async updatePreferences(patch) {
    await delay()
    preferences = { ...preferences, ...patch, version: preferences.version + 1 }
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

  // PATCH 연동 활성/비활성 (FIX-16 Toggle · FIX-17 해제). 해제 확인창은 화면
  // 쪽 책임(사용자가 이미 "확인"을 누른 뒤에만 이 호출이 옴).
  async setConnectionActive(provider, connected) {
    await delay()
    const conn = connections.find((c) => c.provider === provider)
    if (!conn) {
      const err = new Error('mock: unknown connection provider')
      err.status = 404
      throw err
    }
    conn.connected = connected
    // 해제 시 선택 캘린더도 함께 비움 — "이후 반영되지 않습니다"의 실제 효과.
    if (!connected) conn.selectedCalendarIds = []
    return { ...conn }
  },

  // PUT 전체 교체 (FIX-15). 배열 자체를 그대로 덮어써 부분 패치를 허용하지 않음
  // — 정본 문구 그대로 "PUT 전체 교체".
  async replaceSelectedCalendars(provider, calendarIds) {
    await delay()
    const conn = connections.find((c) => c.provider === provider)
    if (!conn) {
      const err = new Error('mock: unknown connection provider')
      err.status = 404
      throw err
    }
    conn.selectedCalendarIds = [...calendarIds]
    return { ...conn }
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
