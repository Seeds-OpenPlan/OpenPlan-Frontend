import { Badge } from '../common/Badge'
import { formatDateKO } from '../../utils/formatDate'
import { ticketCategoryLabel } from '../../features/help/ticketCategories'
import { TICKET_STATUS_LABEL } from '../../features/help/ticketStatus'

/*
  문의 본문 + 답변 블록 — HelpDetailPage(직접 링크로 도착하는 단독 라우트,
  NOTI-04/알림 클릭이 여전히 여기로 온다)와 HelpListPage의 아코디언 패널
  (owner feedback #10) 양쪽이 똑같은 마크업을 그린다. 소유권 검증은 이
  컴포넌트의 일이 아니다 — 목록 쪽은 애초에 본인 티켓만 나열되어 있고
  (helpFixtures.getTickets 자신의 필터), 직접 라우트 쪽은 HelpDetailPage 자신이
  이미 검증을 끝낸 뒤에만 이 컴포넌트를 렌더한다.

  `showHeader`: HelpDetailPage는 이 헤더(상태 배지+날짜+제목)가 페이지의
  유일한 제목 표시라 필요(true, 기본값)하지만, 아코디언 패널 쪽은 같은 정보를
  이미 행 헤더(AccordionRow의 `header`)에서 보여준 다음이라 다시 그리면
  중복이라 꺼둔다(false).
*/
export function TicketContent({ ticket, showHeader = true }) {
  return (
    <div className="flex flex-col gap-4">
      {showHeader && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Badge
              tone={ticket.status === 'ANSWERED' ? 'success' : 'neutral'}
              label={TICKET_STATUS_LABEL[ticket.status] ?? ticket.status}
            />
            {ticket.category && (
              <span className="text-caption text-text-muted">{ticketCategoryLabel(ticket.category)}</span>
            )}
            <span className="text-caption text-text-muted">{formatDateKO(ticket.createdAt)}</span>
          </div>
          <h1 className="text-2xl font-bold text-text">{ticket.title}</h1>
        </div>
      )}

      <div className="rounded-card border border-border bg-surface p-4">
        <p className="whitespace-pre-wrap text-body text-text">{ticket.body}</p>
      </div>

      {/* owner feedback #C — 회신 이메일 + 첨부파일. 둘 다 ticket 콘텐츠 자체의
          일부라 showHeader 여부와 무관하게(아코디언 패널에서도) 보여준다 —
          답변자 입장에서 "어디로 회신할지"·"첨부가 뭔지"는 상태 배지처럼
          행 헤더에 이미 나온 정보가 아니다. */}
      {(ticket.email || (ticket.attachments && ticket.attachments.length > 0)) && (
        <div className="flex flex-col gap-1 text-caption text-text-muted">
          {ticket.email && <p>회신 이메일: {ticket.email}</p>}
          {ticket.attachments && ticket.attachments.length > 0 && (
            <p>첨부파일: {ticket.attachments.join(', ')}</p>
          )}
        </div>
      )}

      {/* HELP-02 답변 — 있으면 그대로, 없으면 "대기 중" 상태를 텍스트로 명시
          (빈 화면으로 남겨 답변이 없는 건지 로딩이 덜 된 건지 헷갈리지 않게). */}
      {ticket.answerContent ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-caption font-medium text-text-muted">답변</h3>
          <div className="rounded-card border border-brand-100 bg-brand-50 p-4">
            <p className="whitespace-pre-wrap text-body text-text">{ticket.answerContent}</p>
            {ticket.answeredAt && (
              <p className="mt-2 text-caption text-text-muted">{formatDateKO(ticket.answeredAt)} 답변</p>
            )}
          </div>
        </div>
      ) : (
        <p className="rounded-card border border-dashed border-border px-4 py-6 text-center text-label text-text-muted">
          아직 답변이 등록되지 않았습니다
        </p>
      )}
    </div>
  )
}

export default TicketContent
