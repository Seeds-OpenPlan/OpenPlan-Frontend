// 서버 status → 화면에 그대로 보여줄 한글 라벨. 목록 행(HelpListPage)의 배지는
// AC-2가 요구하는 2-way(답변 완료/대기 중)로 collapse하지만, TicketContent의
// 자체 헤더(펼친 상세에서만 켜는)는 접수/처리중/답변완료/종료 4단계를 그대로
// 보여준다 — 두 표현이 서로 다른 이유는 각 호출부 자신의 주석 참고.
//
// Kept in its own module (not co-located in TicketContent.jsx) so that
// component file only exports components — react-refresh/only-export-
// components requires this split for Fast Refresh to keep working.
export const TICKET_STATUS_LABEL = {
  RECEIVED: '접수',
  IN_PROGRESS: '처리중',
  ANSWERED: '답변완료',
  CLOSED: '종료',
}
