/*
  DEV-ONLY in-memory mock backend for PNL-NOTI (ST-F1-15, NOTI-02~04). Same
  latency/id conventions as settingsFixtures.js (kept independent — this
  module has no reason to share any other feature's store).

  Field shape now matches the real `Notification` schema found in this
  checkout's contract mirror (openapi-live-76c7009.yaml:2362-2370):
  notificationId / notificationType / title / routePath / readAt / createdAt.
  routePath/readAt/notificationType were originally a [가정-신규] best guess
  (service-stories.md §SS14's "소유 상태" line) written before this checkout
  had a Swagger page for these two OPs — that guess turned out to also
  include a `body` field the real contract never had, which is exactly why
  the 2026-08-28 contract audit's MAJOR finding (blank subtitles against the
  real server) went uncaught in DEV: this mock answered the same shape the
  UI was wrongly reading. `body` is removed here so this mock can never again
  paper over a field the real server doesn't send — see notificationsApi.js's
  normalizeNotification for the adapter side of the same fix.

  `notificationType` still mirrors the 5 keys ST-F1-12's alarm settings
  already defined (settingsFixtures.js NOTIFICATION_ITEMS) so a future "이
  유형 알림 끄기" link from a notification item straight to its own settings
  toggle is a straight key lookup, not a translation table — NOTE this is a
  DEV-only convenience naming and is NOT verified against the real server's
  actual notificationType values (the contract only types this field as a
  free string, no enum), same caveat this file's ST-F1-12 sibling already
  carries for its own 5-key list.
*/

const MOCK_LATENCY_MS = 70
const delay = (ms = MOCK_LATENCY_MS) => new Promise((resolve) => setTimeout(resolve, ms))

// dev-auth 고정 사용자(dev-user-0001)에게 온 알림처럼 시딩 — 문의 답변 알림
// 하나는 실제 존재하는 티켓(helpFixtures.js의 ticket-1)을 가리켜야
// NOTI-04(routePath 이동) + AC-1(id 검증) 데모가 실제로 성립한다.
// 각 항목의 title이 그 알림의 전체 문장 — 실서버 스키마에 body/message가
// 없으므로 title 하나로 사용자가 무슨 일인지 완결해 읽을 수 있어야 한다
// (NotificationPanel.jsx가 이제 title만 렌더링한다).
let notifications = [
  {
    notificationId: 'noti-1',
    notificationType: 'inquiryReply',
    title: '"주차 이동 시 가용 시간이 초기화돼요" 문의에 답변이 등록되었습니다',
    routePath: '/help/ticket-1',
    readAt: null,
    createdAt: '2026-07-24T09:10:00.000Z',
  },
  {
    notificationId: 'noti-2',
    notificationType: 'planRisk',
    title: '이번 주 화·수요일 계획이 가용 시간을 초과했습니다',
    routePath: '/weekly',
    readAt: null,
    createdAt: '2026-07-24T07:30:00.000Z',
  },
  {
    notificationId: 'noti-3',
    notificationType: 'dueSoonTasks',
    title: '"발표 자료 초안" 태스크의 마감이 내일입니다',
    routePath: '/projects?expanded=proj-1',
    readAt: null,
    createdAt: '2026-07-23T22:00:00.000Z',
  },
  {
    notificationId: 'noti-4',
    notificationType: 'announcement',
    title: '새 공지 "7월 정기 점검 안내"가 등록되었습니다',
    routePath: '/notices/notice-1',
    readAt: '2026-07-22T08:00:00.000Z',
    createdAt: '2026-07-22T06:30:00.000Z',
  },
  {
    notificationId: 'noti-5',
    notificationType: 'weeklyReminder',
    title: '아직 이번 주 계획을 세우지 않았습니다',
    routePath: '/weekly',
    readAt: '2026-07-21T09:00:00.000Z',
    createdAt: '2026-07-21T07:45:00.000Z',
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
