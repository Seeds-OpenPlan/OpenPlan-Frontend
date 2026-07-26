import { useState } from 'react'
import { ChevronRightIcon } from './helpIcons'
import { AnnouncementContent } from './AnnouncementContent'
import { AccordionRow } from '../common/AccordionRow'
import { LoadingSkeleton } from '../common/LoadingSkeleton'
import { ErrorState } from '../common/ErrorState'
import { EmptyState } from '../common/EmptyState'
import { useAnnouncements } from '../../features/help/useHelp'
import { formatDateKO } from '../../utils/formatDate'

/*
  공지 아코디언 목록 (SCR-OPS 콘텐츠, OPS-01). Originally AnnouncementsPage.jsx's
  own body; extracted so `/settings/notices`(owner feedback #D)가 같은
  마크업을 그린다 — 최상위 `/notices` 목록은 그리로 리다이렉트(router.js).
  `/notices/:noticeId` 상세 라우트는 그대로 유지(알림 routePath/직접 URL).

  ACCORDION (owner feedback #11) — same single-open shell HelpListPage's own
  ticket rows use (components/common/AccordionRow.jsx, extracted from
  ProjectAccordionRow).
*/
export function AnnouncementAccordionList() {
  const query = useAnnouncements()
  const [expandedId, setExpandedId] = useState(null)

  if (query.isError) {
    return <ErrorState variant="section" title="공지를 불러오지 못했습니다" onAction={() => query.refetch()} />
  }

  if (query.isLoading) {
    return <LoadingSkeleton preset="listRow" count={4} />
  }

  const announcements = query.data ?? []

  if (announcements.length === 0) {
    return <EmptyState title="등록된 공지가 없습니다" />
  }

  return (
    <ul className="flex flex-col gap-3">
      {announcements.map((notice) => {
        const expanded = expandedId === notice.noticeId
        const panelId = `notice-panel-${notice.noticeId}`
        return (
          <AccordionRow
            key={notice.noticeId}
            expanded={expanded}
            onToggle={() => setExpandedId(expanded ? null : notice.noticeId)}
            ariaLabel={`${notice.title}, ${expanded ? '접기' : '펼치기'}`}
            panelId={panelId}
            header={
              <div className="flex min-w-0 items-center gap-2">
                <ChevronRightIcon
                  className={[
                    'shrink-0 text-text-muted motion-safe:transition-transform motion-safe:duration-fast',
                    expanded ? 'rotate-90' : '',
                  ].join(' ')}
                />
                <span className="min-w-0 truncate text-label font-medium text-text">{notice.title}</span>
              </div>
            }
            summary={<p className="text-caption text-text-muted">{formatDateKO(notice.publishedAt)}</p>}
            panel={<AnnouncementContent notice={notice} showHeader={false} />}
          />
        )
      })}
    </ul>
  )
}

export default AnnouncementAccordionList
