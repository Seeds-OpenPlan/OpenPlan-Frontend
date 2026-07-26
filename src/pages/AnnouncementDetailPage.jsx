import { useNavigate, useParams } from 'react-router-dom'
import { LoadingSkeleton } from '../components/common/LoadingSkeleton'
import { ErrorState } from '../components/common/ErrorState'
import { AnnouncementContent } from '../components/help/AnnouncementContent'
import { useAnnouncement } from '../features/help/useHelp'

// SCR-OPS 상세 (OPS-02). No ownership check here — announcements are public
// to every signed-in user (unlike HelpDetailPage's ticket), so a 404 (mock:
// unknown noticeId) is the only failure mode worth handling specially.
//
// owner feedback #11 — AnnouncementsPage 자체가 아코디언으로 인라인 상세를
// 보여주게 됐지만(지금은 `/settings/notices`의 AnnouncementAccordionList),
// 이 라우트는 그대로 유지한다: 알림 클릭(공지 알림의 routePath)과 직접 URL
// 접근이 여전히 여기로 온다. 본문 렌더링은 AnnouncementContent로 뽑아
// 아코디언 패널과 마크업을 공유한다.
function AnnouncementDetailPage() {
  const { noticeId } = useParams()
  const navigate = useNavigate()
  const query = useAnnouncement(noticeId)

  const backLink = (
    <button
      type="button"
      onClick={() => navigate('/settings/notices')}
      className="text-label text-text-muted transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      ← 공지사항
    </button>
  )

  if (query.isError) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-6">
        {backLink}
        <ErrorState variant="section" title="공지를 불러오지 못했습니다" onAction={() => query.refetch()} />
      </div>
    )
  }

  if (query.isLoading) {
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
      <AnnouncementContent notice={query.data} />
    </div>
  )
}

export default AnnouncementDetailPage
