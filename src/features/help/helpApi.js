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
import { unwrapList } from '../../api/unwrap'
import { fetchAllPages } from '../../api/paging'

/*
  실서버 대조 (2026-07-29, SupportController/SupportTicketResponse): the ticket
  id is `supportTicketId` and the question text is `content`, where this file
  had assumed `ticketId`/`body`. Both spellings are accepted here rather than
  renamed through the screens, matching how planApi absorbs casing differences
  in one adapter. `email`/`attachments` have no server-side counterpart at all
  ([가정] from the ST-F1-15 owner review) — they stay null/[] against a real
  server, which the detail screen already renders as "없음".
*/
function normalizeTicket(t) {
  return {
    ticketId: t.ticketId ?? t.ticket_id ?? t.supportTicketId ?? t.support_ticket_id,
    userId: t.userId ?? t.user_id ?? null,
    category: t.category ?? null, // owner feedback #9 — [가정], HELP-03 폼 select
    email: t.email ?? null, // owner feedback #C — [가정], 회신 이메일
    attachments: t.attachments ?? [], // owner feedback #C — [가정], mock: 파일 이름 배열
    title: t.title,
    body: t.body ?? t.content ?? '',
    status: t.status,
    answerContent: t.answerContent ?? t.answer_content ?? null,
    createdAt: t.createdAt ?? t.created_at,
    answeredAt: t.answeredAt ?? t.answered_at ?? null,
  }
}

/*
  실서버 대조 (2026-07-29, HelpArticleResponse): `{helpArticleId, category,
  title, content}` — this file's FAQ browser reads `{faqId, category, question,
  answer}` (the mock's own shape, written before the real one was known). The
  Q/A naming is the screen's vocabulary and worth keeping, so the mapping lives
  here instead of renaming FaqBrowser's fields to a server spelling that means
  the same thing.
*/
function normalizeFaqArticle(a) {
  return {
    faqId: a.faqId ?? a.faq_id ?? a.helpArticleId ?? a.help_article_id,
    category: a.category ?? null,
    question: a.question ?? a.title ?? '',
    answer: a.answer ?? a.content ?? '',
  }
}

/*
  실서버 대조 (2026-08-04, AnnouncementController/AnnouncementResponse): the
  server shape is `{announcementId, announcementType, title, content,
  publishedStartAt}`, where this file had assumed `{noticeId, title, body,
  publishedAt}` (still this screen's own vocabulary — kept, same reasoning
  normalizeFaqArticle's header gives for question/answer over title/content).
  Two fields were silently WRONG against a real response before this fix: only
  `a.body` was read (server has no `body` — every real notice showed empty
  content) and only `a.publishedAt` was read (server has no `publishedAt` —
  every real notice showed an invalid/missing date).

  `announcementType` (MAINTENANCE/INCIDENT/CHANGE enum — see the backend's own
  AnnouncementType.java) is a NEW field this adapter didn't carry at all. It is
  NOT decorative: OPS-01's own user story text lists "목록(유형·제목·게시일)"
  and ST-B1-14 AC③ ties it to a Badge. Passed through here so it's available,
  but no screen reads it yet — building that badge is a separate UI decision,
  not bundled into this adapter fix.
*/
function normalizeAnnouncement(a) {
  return {
    noticeId: a.noticeId ?? a.notice_id ?? a.announcementId ?? a.announcement_id,
    announcementType: a.announcementType ?? a.announcement_type ?? null,
    title: a.title,
    body: a.body ?? a.content ?? '',
    publishedAt: a.publishedAt ?? a.published_at ?? a.publishedStartAt ?? a.published_start_at,
  }
}

// --- 문의 (HELP-01~04) -------------------------------------------------------------

/*
  PATH CORRECTION (실서버 대조 2026-07-29): every support endpoint lives under
  `/support/*` (SupportController), not the flat `/support-tickets` this file
  assumed. The server pages at 20 by default and the 문의 목록 screen has no
  pager, so — same as taskApi/projectApi — this walks every page via
  `fetchAllPages` (api/paging.js) rather than requesting just the server's max
  single page and hoping that's everything.
*/

/** GET /support/tickets (HELP-01/02). 본인 문의만, 최신순. */
export function getTickets() {
  const realCall = (page, size) => apiClient.get('/support/tickets', { params: { page, size }, withMeta: true })
  // Mock fallback only on page 1 — see fetchAllPages's header on why a later
  // page must never be allowed to fall back to the mock's whole list.
  const fetchFirstPage = (page, size) =>
    withDevFallback(
      () => realCall(page, size),
      () => mockBackend.getTickets().then((data) => ({ data, meta: null })),
    )
  return fetchAllPages(fetchFirstPage, realCall, (data) => unwrapList(data, 'tickets')).then((items) =>
    items.map(normalizeTicket),
  )
}

/** GET /support-tickets/{id} ([가정], OP-HELP-DETAIL). 소유권 검증은 호출자
 * (HelpDetailPage)의 몫 — NFR-030 FE 방어는 이 함수가 아니라 그 화면에 산다. */
export function getTicket(ticketId) {
  return withDevFallback(
    () => apiClient.get(`/support/tickets/${ticketId}`),
    () => mockBackend.getTicket(ticketId),
  ).then(normalizeTicket)
}

/** POST /support-tickets ([가정], OP-HELP-CREATE · SCR-HELP-NEW). `category`
 * — owner feedback #9. `email`/`attachments` — owner feedback #C (attachments
 * = 파일 이름 문자열 배열, 실 업로드 없음 — TicketCreateForm.jsx 자신의 헤더 참고). */
export function createTicket({ title, body, category, email, attachments }) {
  return withDevFallback(
    // The server's CreateTicketRequest is exactly {category, title, content}
    // — `body` is its `content`, and email/attachments have nowhere to go yet
    // (they stay in the mock, which is the only store that keeps them).
    () => apiClient.post('/support/tickets', { category, title, content: body }),
    () => mockBackend.createTicket({ title, body, category, email, attachments }),
  ).then(normalizeTicket)
}

// --- FAQ (HELP-05/06) --------------------------------------------------------------

/** GET /support/help-articles?keyword= (HELP-06). 생략 시 전체 목록. */
export function getFaqArticles(query) {
  return withDevFallback(
    // The server's search param is `keyword`; `query` was this file's guess.
    () => apiClient.get('/support/help-articles', { params: query ? { keyword: query } : undefined }),
    () => mockBackend.getFaqArticles(query),
    // Real: `data:[HelpArticle]` (array). Mock: `{ articles: [...] }`.
  ).then((r) => unwrapList(r, 'articles').map(normalizeFaqArticle))
}

// --- 공지 (OPS-01/02) ---------------------------------------------------------------

/*
  PAGINATION (실서버 대조 2026-08-04, AnnouncementController): the real
  endpoint pages (1-base `page`, default 20, server-clamped max 100), and this
  screen has no pager (AnnouncementAccordionList/AnnouncementsPage just render
  whatever array they get) — same shape of bug taskApi/projectApi/
  helpApi.getTickets already hit and fixed the same way, so this walks every
  page via `fetchAllPages` rather than requesting one page and assuming that's
  everything. Server list is already public/unauthenticated (no scoping to
  worry about, unlike getTickets).
*/

/** GET /announcements (OP-OPS-ANNOUNCEMENTS, OPS-01). 게시된 공지 전체, 게시일 DESC. */
export function getAnnouncements() {
  const realCall = (page, size) => apiClient.get('/announcements', { params: { page, size }, withMeta: true })
  // Mock fallback only on page 1 — see fetchAllPages's header on why a later
  // page must never be allowed to fall back to the mock's whole list.
  const fetchFirstPage = (page, size) =>
    withDevFallback(
      () => realCall(page, size),
      () => mockBackend.getAnnouncements().then((data) => ({ data, meta: null })),
    )
  return fetchAllPages(fetchFirstPage, realCall, (data) => unwrapList(data, 'announcements')).then((items) =>
    items.map(normalizeAnnouncement),
  )
}

/** GET /announcements/{announcementId} (OPS-02). 미게시 공지는 서버가 404로 은닉 —
 * AnnouncementDetailPage가 이미 그 실패를 "공지를 불러오지 못했습니다"로 처리한다. */
export function getAnnouncement(noticeId) {
  return withDevFallback(
    () => apiClient.get(`/announcements/${noticeId}`),
    () => mockBackend.getAnnouncement(noticeId),
  ).then(normalizeAnnouncement)
}
