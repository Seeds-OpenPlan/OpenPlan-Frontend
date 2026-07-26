/*
  DEV-ONLY in-memory mock backend for PNL-NOTI (ST-F1-15, NOTI-02~04). Same
  latency/id conventions as settingsFixtures.js (kept independent — this
  module has no reason to share any other feature's store).

  [가정-신규] request/response shapes: ux-flow-map.md §5 names the two real OPs
  this screen consumes (OP-NOTI-LIST/READ) but this checkout has no Swagger
  page for them yet, so the field names below (routePath, readAt) are this
  PR's own best guess, taken straight from service-stories.md §SS14's "소유
  상태" line (`notification.read_at`·`route_path`). Only this file + the
  normalize step in notificationsApi.js need to change once the real shape
  lands.

  `type` mirrors the 5 keys ST-F1-12's alarm settings already defined
  (settingsFixtures.js NOTIFICATION_ITEMS) so a future "이 유형 알림 끄기" link
  from a notification item straight to its own settings toggle is a straight
  key lookup, not a translation table.
*/

const MOCK_LATENCY_MS = 70
const delay = (ms = MOCK_LATENCY_MS) => new Promise((resolve) => setTimeout(resolve, ms))

// dev-auth 고정 사용자(dev-user-0001)에게 온 알림처럼 시딩 — 문의 답변 알림
// 하나는 실제 존재하는 티켓(helpFixtures.js의 ticket-1)을 가리켜야
// NOTI-04(routePath 이동) + AC-1(id 검증) 데모가 실제로 성립한다.
let notifications = [
  {
    notificationId: 'noti-1',
    type: 'inquiryReply',
    title: '문의하신 내용에 답변이 등록되었습니다',
    body: '"주차 이동 시 가용 시간이 초기화돼요" 문의에 답변이 달렸습니다',
    routePath: '/help/ticket-1',
    readAt: null,
    createdAt: '2026-07-24T09:10:00.000Z',
  },
  {
    notificationId: 'noti-2',
    type: 'planRisk',
    title: '이번 주 계획이 과부하 상태입니다',
    body: '이번 주 화·수요일에 가용 시간을 초과하는 블록이 있습니다',
    routePath: '/weekly',
    readAt: null,
    createdAt: '2026-07-24T07:30:00.000Z',
  },
  {
    notificationId: 'noti-3',
    type: 'dueSoonTasks',
    title: '마감이 임박한 태스크가 있습니다',
    body: '"발표 자료 초안" 태스크의 마감이 내일입니다',
    routePath: '/projects?expanded=proj-1',
    readAt: null,
    createdAt: '2026-07-23T22:00:00.000Z',
  },
  {
    notificationId: 'noti-4',
    type: 'announcement',
    title: '새 공지가 등록되었습니다',
    body: '"7월 정기 점검 안내"를 확인해 주세요',
    routePath: '/notices/notice-1',
    readAt: '2026-07-22T08:00:00.000Z',
  },
  {
    notificationId: 'noti-5',
    type: 'weeklyReminder',
    title: '아직 이번 주 계획을 세우지 않았습니다',
    body: '주간 계획을 세우고 한 주를 시작해 보세요',
    routePath: '/weekly',
    readAt: '2026-07-21T09:00:00.000Z',
  },
]

// notificationId를 소유한 알림이 있으면 그 항목의 얕은 사본, 없으면 mock
// 404(존재하지 않는 알림 — 이미 삭제/만료 등 방어용, 지금은 UI가 부르지 않는다).
function findOrThrow(notificationId) {
  const found = notifications.find((n) => n.notificationId === notificationId)
  if (!found) {
    const err = new Error('mock: unknown notificationId')
    err.status = 404
    throw err
  }
  return found
}

export const mockBackend = {
  // OP-NOTI-LIST. 최신순 — createdAt 내림차순으로 정렬해 돌려준다(서버가
  // 이미 정렬해 준다는 가정 — 이 mock이 그 계약을 흉내낸다).
  async getNotifications() {
    await delay(60)
    return {
      notifications: [...notifications]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map((n) => ({ ...n })),
    }
  },

  // OP-NOTI-READ (NOTI-03). 이미 읽은 알림을 다시 읽음 처리해도 안전
  // (idempotent) — readAt이 있으면 그대로 둔다.
  async markNotificationRead(notificationId) {
    await delay()
    const target = findOrThrow(notificationId)
    if (!target.readAt) target.readAt = new Date().toISOString()
    return { ...target }
  },
}

export default mockBackend
