/*
  OP functions for SCR-HELP/HELP-NEW/FAQ/OPS (ST-F1-15). Endpoints named in
  ux-flow-map.md §5 (OP-HELP-LIST/CREATE/DETAIL · OP-OPS-ANNOUNCEMENTS) — see
  helpFixtures.js's own header for why these are [가정] rather than fully
  invented (BE1's ST-B1-13/14 already ship a real backend for this, just not
  documented in this checkout).

  Reuses planApi's withDevFallback (same choice every other feature file here
  makes rather than redefining it again).
*/
import { apiClient } from '../../api/client'
import { withDevFallback } from '../plan/planApi'
import { mockBackend } from './helpFixtures'

function normalizeTicket(t) {
  return {
    ticketId: t.ticketId ?? t.ticket_id,
    userId: t.userId ?? t.user_id,
    category: t.category ?? null, // owner feedback #9 — [가정], HELP-03 폼 select
    email: t.email ?? null, // owner feedback #C — [가정], 회신 이메일
    attachments: t.attachments ?? [], // owner feedback #C — [가정], mock: 파일 이름 배열
    title: t.title,
    body: t.body,
    status: t.status,
    answerContent: t.answerContent ?? t.answer_content ?? null,
    createdAt: t.createdAt ?? t.created_at,
    answeredAt: t.answeredAt ?? t.answered_at ?? null,
  }
}

function normalizeAnnouncement(a) {
  return {
    noticeId: a.noticeId ?? a.notice_id ?? a.announcementId ?? a.announcement_id,
    title: a.title,
    body: a.body,
    publishedAt: a.publishedAt ?? a.published_at,
  }
}

// --- 문의 (HELP-01~04) -------------------------------------------------------------

/** GET /support-tickets ([가정], OP-HELP-LIST). 본인 문의만. */
export function getTickets() {
  return withDevFallback(
    () => apiClient.get('/support-tickets'),
    () => mockBackend.getTickets(),
  ).then((r) => (r?.tickets ?? []).map(normalizeTicket))
}

/** GET /support-tickets/{id} ([가정], OP-HELP-DETAIL). 소유권 검증은 호출자
 * (HelpDetailPage)의 몫 — NFR-030 FE 방어는 이 함수가 아니라 그 화면에 산다. */
export function getTicket(ticketId) {
  return withDevFallback(
    () => apiClient.get(`/support-tickets/${ticketId}`),
    () => mockBackend.getTicket(ticketId),
  ).then(normalizeTicket)
}

/** POST /support-tickets ([가정], OP-HELP-CREATE · SCR-HELP-NEW). `category`
 * — owner feedback #9. `email`/`attachments` — owner feedback #C (attachments
 * = 파일 이름 문자열 배열, 실 업로드 없음 — TicketCreateForm.jsx 자신의 헤더 참고). */
export function createTicket({ title, body, category, email, attachments }) {
  return withDevFallback(
    () => apiClient.post('/support-tickets', { title, body, category, email, attachments }),
    () => mockBackend.createTicket({ title, body, category, email, attachments }),
  ).then(normalizeTicket)
}

// --- FAQ (HELP-05/06) --------------------------------------------------------------

/** GET /help-articles?query= ([가정]). `query` 생략 시 전체 목록. */
export function getFaqArticles(query) {
  return withDevFallback(
    () => apiClient.get('/help-articles', { params: query ? { query } : undefined }),
    () => mockBackend.getFaqArticles(query),
  ).then((r) => r?.articles ?? [])
}

// --- 공지 (OPS-01/02) ---------------------------------------------------------------

/** GET /announcements ([가정], OP-OPS-ANNOUNCEMENTS). */
export function getAnnouncements() {
  return withDevFallback(
    () => apiClient.get('/announcements'),
    () => mockBackend.getAnnouncements(),
  ).then((r) => (r?.announcements ?? []).map(normalizeAnnouncement))
}

/** GET /announcements/{id} ([가정]). */
export function getAnnouncement(noticeId) {
  return withDevFallback(
    () => apiClient.get(`/announcements/${noticeId}`),
    () => mockBackend.getAnnouncement(noticeId),
  ).then(normalizeAnnouncement)
}
