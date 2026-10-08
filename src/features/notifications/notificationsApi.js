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
 * casing question instead of every consumer guessing at both.
 *
 * Thomas PR 리뷰 지시(2026-10-08, notification-settings 계약 대조와 같은
 * 세션): 계약(Notification 스키마, openapi.yaml)의 필드명은
 * `notificationType`이다. `n.type`만 읽던 전 버전은 실서버 응답에 그런 키가
 * 없어 항상 undefined로 떨어졌다 — mock(notificationsFixtures.js)이 우연히
 * `type`이라는 옛 이름을 썼던 탓에 dev에서는 안 걸렸다. `n.type`은 그 mock과의
 * 하위 호환으로만 남긴다.
 *
 * PR #69 AI 리뷰 Should-fix: `body`는 아예 내보내지 않는다. 계약
 * `NotificationResponse`(BE 확인 — notificationId/notificationType/title/
 * routePath/readAt/createdAt)엔 이 필드가 없다 — 실서버로는 항상 undefined가
 * 되는데, 전 버전의 "소비처 없음" 주석이 틀렸다: NotificationPanel.jsx가
 * `{n.body}`를 캡션 줄로 그대로 렌더해, 실서버 전환 시 모든 알림의 캡션
 * 줄이 빈 줄로 나왔을 것이다. `n.body`를 여기서 떨어뜨리면(정규화 단계에서
 * 제거) NotificationPanel이 그 필드가 아예 없는 셈이 되어 캡션 줄 렌더
 * 분기(해당 파일 자신의 수정 참고)가 "없으면 안 그린다"로 깔끔하게 선다.
 */
function normalizeNotification(n) {
  return {
    notificationId: n.notificationId ?? n.notification_id,
    type: n.notificationType ?? n.notification_type ?? n.type,
    title: n.title,
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
