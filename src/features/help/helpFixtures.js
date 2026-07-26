/*
  DEV-ONLY in-memory mock backend for SCR-HELP/HELP-NEW/FAQ/OPS (ST-F1-15,
  HELP-01~06 · OPS-01/02). Same latency/id conventions as settingsFixtures.js.

  UNLIKE settingsApi.js's own [가정-확장] resources, 문의(support_tickets)·
  FAQ(help_articles)·공지(announcements) are BE1(전창현)'s stories ST-B1-13/14
  — "완료·머지 대기" per `references/specs/2주차 작업 분배/02. 스토리 스펙
  (AC·엔드포인트).md` L134-139, i.e. a REAL backend for these already exists,
  just not merged/documented in THIS checkout yet. The field names below are
  this PR's best-effort guess (service-stories.md §SS14's "소유 상태" line:
  `support_ticket.status`(접수/처리중/답변완료/종료)·`answer_content`) rather
  than an invented shape from nothing — still flagged [가정] since the exact
  REST paths/casing aren't visible here, but expect a SMALLER diff at real-API
  swap time than a from-scratch guess would need.

  Ownership (`userId`) matters here specifically for HELP AC-1/NFR-030: one
  ticket below belongs to someone OTHER than the dev-auth fixed user
  (authFixtures.js "dev-user-0001") so the FE id-validation defense
  (HelpDetailPage → SCR-403 on mismatch) has something real to demonstrate
  against, not just an unreachable code path.
*/

const MOCK_LATENCY_MS = 70
const delay = (ms = MOCK_LATENCY_MS) => new Promise((resolve) => setTimeout(resolve, ms))

const DEV_USER_ID = 'dev-user-0001' // authFixtures.js의 dev-auth 고정 사용자와 동일

let tickets = [
  {
    ticketId: 'ticket-1',
    userId: DEV_USER_ID,
    category: 'BUG', // owner feedback #9
    email: 'user@openplan.dev', // owner feedback #C — authFixtures.js dev-auth 계정 이메일과 동일
    attachments: ['재현화면.png'], // owner feedback #C — [가정] 파일명만(mock, 실 업로드 없음)
    title: '주차 이동 시 가용 시간이 초기화돼요',
    body: '다음 주로 이동했다가 돌아오면 가용 시간 설정이 기본값으로 보입니다. 재현 방법을 첨부합니다.',
    status: 'ANSWERED', // RECEIVED · IN_PROGRESS · ANSWERED · CLOSED
    answerContent: '확인 결과 캐시 갱신 시점 문제로 확인되어 다음 배포에 반영될 예정입니다. 불편을 드려 죄송합니다.',
    createdAt: '2026-07-22T10:00:00.000Z',
    answeredAt: '2026-07-24T09:05:00.000Z',
  },
  {
    ticketId: 'ticket-2',
    userId: DEV_USER_ID,
    category: 'FEATURE',
    email: 'user@openplan.dev',
    attachments: [],
    title: '자동 배치 결과를 되돌릴 수 있나요',
    body: '자동 배치를 적용한 뒤 바로 취소했는데도 일부 블록이 남아있습니다.',
    status: 'IN_PROGRESS',
    answerContent: null,
    createdAt: '2026-07-23T14:20:00.000Z',
    answeredAt: null,
  },
  {
    ticketId: 'ticket-3',
    userId: DEV_USER_ID,
    category: 'BUG',
    email: 'user@openplan.dev',
    attachments: [],
    title: '캘린더 연동 시 중복 일정이 생겨요',
    body: 'Google 캘린더 연동 후 같은 일정이 두 번 보입니다.',
    status: 'RECEIVED',
    answerContent: null,
    createdAt: '2026-07-24T08:00:00.000Z',
    answeredAt: null,
  },
  // 다른 사용자 소유 — HELP AC-1(FE id 검증) 데모용. 목록에는 절대 나타나지
  // 않고(getTickets가 이미 소유자로 필터), 상세를 직접 열어야만(예: URL
  // 조작) 이 항목에 닿는다 — 그래서 최종 방어는 화면(HelpDetailPage) 쪽에서
  // 한 번 더 확인해야 한다는 이 스토리의 요지 그대로다.
  {
    ticketId: 'ticket-99',
    userId: 'dev-user-0002',
    category: 'ACCOUNT',
    email: 'other@openplan.dev',
    attachments: [],
    title: '다른 사용자의 문의 (접근 불가 데모)',
    body: '이 문의는 dev-user-0002 소유입니다.',
    status: 'ANSWERED',
    answerContent: '이 답변은 다른 사용자에게만 보여야 합니다.',
    createdAt: '2026-07-20T00:00:00.000Z',
    answeredAt: '2026-07-21T00:00:00.000Z',
  },
]
let nextTicketSeq = 4

const faqArticles = [
  {
    faqId: 'faq-1',
    category: '주간 계획',
    question: '주차를 이동해도 이전 주 계획이 사라지나요?',
    answer: '아니요. 각 주는 독립적으로 저장되며 언제든 이전 주로 돌아가 확인할 수 있습니다.',
  },
  {
    faqId: 'faq-2',
    category: '주간 계획',
    question: '가용 시간과 24시간 모드의 차이는 무엇인가요?',
    answer: '가용 시간 모드는 설정한 가용 구간만 표시하고, 24시간 모드는 하루 전체를 보여주며 가용 경계선을 함께 표시합니다.',
  },
  {
    faqId: 'faq-3',
    category: '태스크·프로젝트',
    question: '태스크를 완료 처리하면 통계에 바로 반영되나요?',
    answer: '실제 수행 시간을 함께 기록하면 통계 화면의 편차·완료율에 반영됩니다.',
  },
  {
    faqId: 'faq-4',
    category: '설정',
    question: '캘린더 연동을 해제하면 기존에 가져온 일정은 어떻게 되나요?',
    answer: '연동 해제 이후로는 더 이상 동기화되지 않지만, 이미 가져온 일정 자체가 삭제되지는 않습니다.',
  },
  {
    faqId: 'faq-5',
    category: '재계획',
    question: '재계획 대안을 적용하면 바로 저장되나요?',
    answer: '아니요. 대안을 적용해도 초안 상태이며, 검토 후 별도로 저장(확정)해야 반영됩니다.',
  },
]

let announcements = [
  {
    noticeId: 'notice-1',
    title: '7월 정기 점검 안내',
    body: '7월 마지막 주 화요일 새벽 2시~4시 사이 서비스 점검이 진행됩니다. 해당 시간에는 일시적으로 접속이 제한될 수 있습니다.',
    publishedAt: '2026-07-22T09:00:00.000Z',
  },
  {
    noticeId: 'notice-2',
    title: '재계획 대안 기능 개선',
    body: '재계획 대안 생성 속도가 개선되었고, 각 대안의 변경 근거가 더 자세히 표시됩니다.',
    publishedAt: '2026-07-18T09:00:00.000Z',
  },
  {
    noticeId: 'notice-3',
    title: '서비스 이용약관 개정 안내',
    body: '개인정보 처리방침 일부 조항이 개정되어 8월 1일부터 적용됩니다.',
    publishedAt: '2026-07-10T09:00:00.000Z',
  },
]

function notFound(label) {
  const err = new Error(`mock: unknown ${label}`)
  err.status = 404
  throw err
}

export const mockBackend = {
  // OP-HELP-LIST. 본인 문의만 — 실 서버라면 인증 토큰으로 스코프가 걸리겠지만,
  // 이 mock은 dev-auth 고정 사용자 기준으로 흉내낸다.
  async getTickets() {
    await delay(60)
    return {
      tickets: tickets
        .filter((t) => t.userId === DEV_USER_ID)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map((t) => ({ ...t })),
    }
  },

  // OP-HELP-DETAIL. 소유자 필터를 걸지 않고 그대로 돌려준다 — 소유권 검증은
  // FE 쪽 방어(HelpDetailPage, NFR-030)가 하는 것이 이 스토리의 요구사항이지,
  // mock이 서버인 척 403을 던지는 게 아니다(그러면 FE 방어 코드 자체가
  // 검증되지 않는다).
  async getTicket(ticketId) {
    await delay(60)
    const found = tickets.find((t) => t.ticketId === ticketId)
    if (!found) notFound('ticketId')
    return { ...found }
  },

  // OP-HELP-CREATE. `category`는 owner feedback #9 — 없으면 'OTHER'로 접어
  // 둔다(폼이 항상 select 기본값을 채워 보내므로 실제로는 거의 안 타는 경로).
  // `email`/`attachments`는 owner feedback #C — attachments는 mock이라 실제
  // 파일이 아니라 폼이 이미 문자열 배열(파일 이름)로 넘긴 것을 그대로 저장.
  async createTicket({ title, body, category, email, attachments }) {
    await delay()
    const ticket = {
      ticketId: `ticket-${nextTicketSeq++}`,
      userId: DEV_USER_ID,
      category: category ?? 'OTHER',
      email: email ?? null,
      attachments: attachments ?? [],
      title,
      body,
      status: 'RECEIVED',
      answerContent: null,
      createdAt: new Date().toISOString(),
      answeredAt: null,
    }
    tickets = [ticket, ...tickets]
    return { ...ticket }
  },

  // FAQ (HELP-05/06). `query`가 있으면 질문/답변 텍스트에서 대소문자 구분
  // 없이 부분 일치 검색 — 실 검색엔진 없이도 AC-3(0건 분기)을 그대로
  // 재현하기 위한 최소 구현.
  async getFaqArticles(query) {
    await delay(60)
    const q = (query ?? '').trim().toLowerCase()
    const matched = q
      ? faqArticles.filter(
          (a) => a.question.toLowerCase().includes(q) || a.answer.toLowerCase().includes(q),
        )
      : faqArticles
    return { articles: matched.map((a) => ({ ...a })) }
  },

  // 공지 (OPS-01/02).
  async getAnnouncements() {
    await delay(60)
    return {
      announcements: [...announcements]
        .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
        .map((a) => ({ ...a })),
    }
  },

  async getAnnouncement(noticeId) {
    await delay(60)
    const found = announcements.find((a) => a.noticeId === noticeId)
    if (!found) notFound('noticeId')
    return { ...found }
  },
}

export default mockBackend
