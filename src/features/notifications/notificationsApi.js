/*
  OP functions for PNL-NOTI (ST-F1-15, NOTI-02~04). Endpoints named in
  ux-flow-map.md §5 (OP-NOTI-LIST/READ) but not yet in this checkout's Swagger
  mirror — [가정-신규] paths/shape, isolated here so only this file + the
  normalize step below need to change once the real contract lands (same
  rule settingsApi.js's own header states).

  Reuses planApi's withDevFallback rather than redefining it again (same
  choice statsApi.js/settingsApi.js already made).
*/
import { apiClient } from '../../api/client'
import { withDevFallback } from '../plan/planApi'
import { unwrapList } from '../../api/unwrap'

/*
  notificationsFixtures.js를 최상단 정적 import로 들이지 않는다 — authApi.js의
  loadAuthMock()과 같은 이유(그 파일 헤더 참조): 정적 import는 번들러가 실행
  경로와 무관하게 항상 포함시켜, DEV 전용 mock 데이터가 프로덕션 청크에도
  그대로 실린다. `import.meta.env.DEV` 분기 안에서만 동적 import를 호출하면
  Vite가 빌드 시 그 값을 리터럴 false로 치환해 분기 전체가 도달 불가능해지고
  번들러가 통째로 제거한다.
*/
async function loadNotificationsMock() {
  if (!import.meta.env.DEV) return null
  const { mockBackend } = await import('./notificationsFixtures')
  return mockBackend
}

/** Tolerates snake_case (server) or camelCase (mock) — same reasoning
 * planApi.js's normalizeBlock gives for why this one adapter absorbs the
 * casing question instead of every consumer guessing at both. */
function normalizeNotification(n) {
  return {
    notificationId: n.notificationId ?? n.notification_id,
    type: n.type,
    title: n.title,
    body: n.body,
    routePath: n.routePath ?? n.route_path,
    readAt: n.readAt ?? n.read_at ?? null,
    createdAt: n.createdAt ?? n.created_at,
  }
}

/** GET /notifications ([가정-신규], OP-NOTI-LIST). */
export function getNotifications() {
  return withDevFallback(
    () => apiClient.get('/notifications'),
    async () => (await loadNotificationsMock()).getNotifications(),
    // Real server: `data:[Notification]` (array). Mock: `{ notifications: [...] }`.
  ).then((r) => unwrapList(r, 'notifications').map(normalizeNotification))
}

/** PATCH /notifications/{id}/read ([가정-신규], OP-NOTI-READ · NOTI-03). */
export function markNotificationRead(notificationId) {
  return withDevFallback(
    () => apiClient.patch(`/notifications/${notificationId}/read`),
    async () => (await loadNotificationsMock()).markNotificationRead(notificationId),
  ).then(normalizeNotification)
}
