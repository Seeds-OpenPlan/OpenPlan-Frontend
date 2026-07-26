import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { LoadingSkeleton } from '../components/common/LoadingSkeleton'
import { ErrorState } from '../components/common/ErrorState'
import { TicketContent } from '../components/help/TicketContent'
import { useTicket } from '../features/help/useHelp'
import { useSession } from '../features/auth/useAuth'

/*
  SCR-HELP 상세 (ST-F1-15, HELP-01~04 AC-1 · NFR-030). This is where the FE
  id-validation defense actually lives: `routePath`를 그대로 믿고 이동하는
  알림 클릭(NOTI-04)이든, 직접 타이핑한 URL이든, 이 페이지에 닿는 모든
  경로가 결국 여기서 소유권을 한 번 더 확인한다 — 서버가 이미 다른 사용자의
  티켓을 막아야 정상이지만, 그 방어가 언젠가 뚫리거나 mock 단계에서 아직
  없는 지금도 화면 레벨에서 최소한의 방어선을 갖춘다는 것이 AC-1의 요지.

  두 쿼리(세션·티켓)가 모두 settle하기 전에는 소유권을 판단하지 않는다 —
  둘 중 하나만 먼저 도착한 상태로 성급히 판단하면 아직 로딩 중인 티켓/세션을
  "불일치"로 오판해 정상 사용자를 403으로 잘못 보낼 수 있다.

  owner feedback #10 — 내 문의 목록 자체가 아코디언으로 인라인 상세를
  보여주게 됐지만(지금은 `/settings/support`의 TicketAccordionList), 이
  라우트는 그대로 유지한다: 알림 클릭(NOTI-04)의 `routePath`와 직접 URL
  접근이 여전히 여기로 오고, 소유권 방어도 여기 한 곳에서만 지켜야 하기
  때문. 본문/답변 렌더링은 TicketContent로 뽑아 아코디언 패널과 마크업을
  공유한다.
*/
function HelpDetailPage() {
  const { ticketId } = useParams()
  const navigate = useNavigate()
  const ticketQuery = useTicket(ticketId)
  const sessionQuery = useSession()

  const ticket = ticketQuery.data
  const currentUserId = sessionQuery.data?.userId
  const bothSettled = !ticketQuery.isLoading && !sessionQuery.isLoading
  const isOwner = bothSettled && ticket && currentUserId && ticket.userId === currentUserId

  useEffect(() => {
    if (!bothSettled || !ticket || !currentUserId) return
    if (ticket.userId !== currentUserId) {
      navigate('/403', { replace: true, state: { reason: '본인이 작성한 문의만 볼 수 있습니다' } })
    }
  }, [bothSettled, ticket, currentUserId, navigate])

  const backLink = (
    <button
      type="button"
      onClick={() => navigate('/settings/support')}
      className="text-label text-text-muted transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      ← 내 문의
    </button>
  )

  if (ticketQuery.isError) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-6">
        {backLink}
        <ErrorState variant="section" title="문의를 불러오지 못했습니다" onAction={() => ticketQuery.refetch()} />
      </div>
    )
  }

  // 아직 로딩 중이거나(스켈레톤), 소유자가 아님이 확인되어 위 effect가 막
  // /403으로 이동시키는 중인 프레임 — 어느 쪽이든 실제 답변 내용을 화면에
  // 잠깐이라도 그려서는 안 된다.
  if (!bothSettled || !ticket || !isOwner) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-6">
        {backLink}
        <LoadingSkeleton preset="card" />
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      {backLink}
      <TicketContent ticket={ticket} />
    </div>
  )
}

export default HelpDetailPage
