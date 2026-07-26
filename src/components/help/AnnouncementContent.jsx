import { formatDateKO } from '../../utils/formatDate'

/*
  공지 본문 블록 — AnnouncementDetailPage(직접 라우트, notification routePath가
  여전히 여기로 올 수 있다)와 AnnouncementsPage의 아코디언 패널(owner feedback
  #11) 양쪽이 재사용. TicketContent.jsx와 같은 `showHeader` 분리 이유: 아코디언
  패널은 이미 행 헤더에서 제목/날짜를 보여준 다음이라 다시 그리면 중복.
*/
export function AnnouncementContent({ notice, showHeader = true }) {
  return (
    <div className="flex flex-col gap-4">
      {showHeader && (
        <div className="flex flex-col gap-2">
          <span className="text-caption text-text-muted">{formatDateKO(notice.publishedAt)}</span>
          <h1 className="text-2xl font-bold text-text">{notice.title}</h1>
        </div>
      )}
      <div className="rounded-card border border-border bg-surface p-4">
        <p className="whitespace-pre-wrap text-body text-text">{notice.body}</p>
      </div>
    </div>
  )
}

export default AnnouncementContent
