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
import { mockBackend } from './notificationsFixtures'

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
    () => mockBackend.getNotifications(),
  ).then((r) => (r?.notifications ?? []).map(normalizeNotification))
}

/** PATCH /notifications/{id}/read ([가정-신규], OP-NOTI-READ · NOTI-03). */
export function markNotificationRead(notificationId) {
  return withDevFallback(
    () => apiClient.patch(`/notifications/${notificationId}/read`),
    () => mockBackend.markNotificationRead(notificationId),
  ).then(normalizeNotification)
}
