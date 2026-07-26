import { useState } from 'react'
import { ChevronRightIcon } from './helpIcons'
import { TicketContent } from './TicketContent'
import { TICKET_STATUS_LABEL } from '../../features/help/ticketStatus'
import { AccordionRow } from '../common/AccordionRow'
import { Badge } from '../common/Badge'
import { LoadingSkeleton } from '../common/LoadingSkeleton'
import { ErrorState } from '../common/ErrorState'
import { EmptyState } from '../common/EmptyState'
import { useTickets } from '../../features/help/useHelp'
import { formatDateKO } from '../../utils/formatDate'

/*
  내 문의 아코디언 목록 (SCR-HELP 콘텐츠, HELP-01~04). Originally
  HelpListPage.jsx's own body; extracted so `/settings/support`(owner feedback
  #D)의 "내 문의" 탭이 같은 마크업을 그린다 — 지금은 SettingsSupportPage
  하나만 이 컴포넌트를 렌더한다(최상위 `/help` 목록은 그리로 리다이렉트,
  router.js 참고). 본인 문의만 나열되는 것(helpApi.getTickets 자신의 필터)과
  `/help/:ticketId` 상세 라우트가 AC-1 소유권 방어를 계속 소유한다는 것은
  변하지 않는다 — TicketContent.jsx 자신의 헤더 참고.

  ACCORDION (owner feedback #10): rows expand INLINE instead of navigating to
  `/help/:ticketId` — same single-open shell components/common/AccordionRow.jsx
  extracted from ProjectAccordionRow.

  AC-2/NFR-017: each row's answer state is a Badge whose LABEL TEXT is the
  carrier ("답변 완료"/"대기 중"), not the tone color alone — CLOSED/RECEIVED/
  IN_PROGRESS all collapse to "대기 중" in the ROW (the AC only asks for a
  two-way split); the expanded panel reuses TicketContent with its OWN header
  turned off (`showHeader={false}`) so the status badge isn't drawn twice.

  `onCreateNew` (owner feedback 3차 #2 — 문의 작성이 모달로 바뀜): 빈 상태의
  [문의 작성] 액션은 더 이상 `/help/new`로 navigate하지 않는다 — 그 라우트는
  이제 `/settings/support`로 redirect만 하는 자리표시자다(router.js). 호출자
  (SettingsSupportPage)가 이 콜백으로 자신이 띄우는 TicketCreateForm 모달을
  열게 한다.
*/
export function TicketAccordionList({ onCreateNew }) {
  const query = useTickets()
  const [expandedId, setExpandedId] = useState(null)

  if (query.isError) {
    return (
      <ErrorState variant="section" title="문의 목록을 불러오지 못했습니다" onAction={() => query.refetch()} />
    )
  }

  if (query.isLoading) {
    return <LoadingSkeleton preset="listRow" count={4} />
  }

  const tickets = query.data ?? []

  if (tickets.length === 0) {
    return (
      <EmptyState
        title="아직 문의한 내역이 없습니다"
        description="궁금한 점이나 불편한 점이 있다면 문의를 남겨 주세요"
        actionLabel="문의 작성"
        onAction={onCreateNew}
      />
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {tickets.map((ticket) => {
        const expanded = expandedId === ticket.ticketId
        const answered = ticket.status === 'ANSWERED'
        const panelId = `ticket-panel-${ticket.ticketId}`
        return (
          <AccordionRow
            key={ticket.ticketId}
            expanded={expanded}
            onToggle={() => setExpandedId(expanded ? null : ticket.ticketId)}
            ariaLabel={`${ticket.title}, ${TICKET_STATUS_LABEL[ticket.status] ?? ticket.status}, ${
              expanded ? '접기' : '펼치기'
            }`}
            panelId={panelId}
            header={
              <div className="flex min-w-0 items-center gap-2">
                <ChevronRightIcon
                  className={[
                    'shrink-0 text-text-muted motion-safe:transition-transform motion-safe:duration-fast',
                    expanded ? 'rotate-90' : '',
                  ].join(' ')}
                />
                <Badge tone={answered ? 'success' : 'neutral'} label={answered ? '답변 완료' : '대기 중'} />
                <span className="min-w-0 truncate text-label font-medium text-text">{ticket.title}</span>
              </div>
            }
            summary={<p className="text-caption text-text-muted">{formatDateKO(ticket.createdAt)}</p>}
            panel={<TicketContent ticket={ticket} showHeader={false} />}
          />
        )
      })}
    </ul>
  )
}

export default TicketAccordionList
