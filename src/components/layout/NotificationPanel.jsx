import { LoadingSkeleton } from '../common/LoadingSkeleton'
import { ErrorState } from '../common/ErrorState'
import { EmptyState } from '../common/EmptyState'
import { formatDateTimeKO } from '../../utils/formatDate'

/*
  PNL-NOTI body (NOTI-02~04). Shared verbatim by NotificationBell's two shells
  (desktop dropdown / mobile BottomSheet — see that file's own header) so the
  list/empty/loading/error logic is written exactly once.

  Each row is a single <button> (native, not a div+onClick) carrying the
  notification's full text — unread state is conveyed by BOTH a leading dot
  AND a visually-hidden "(읽지 않음)" prefix read by screen readers, never by
  color/weight alone (NFR-017). Clicking a row marks it read (if not already)
  and hands the routePath up to the caller, which owns the actual navigation
  (NotificationBell) since only it knows how to also close the panel first.
*/
export function NotificationPanel({ notifications, isLoading, isError, onRetry, onItemClick }) {
  if (isError) {
    return (
      <ErrorState variant="section" title="알림을 불러오지 못했습니다" onAction={onRetry} />
    )
  }

  if (isLoading) {
    return <LoadingSkeleton preset="listRow" count={4} />
  }

  if (!notifications || notifications.length === 0) {
    return <EmptyState title="새로운 알림이 없습니다" />
  }

  return (
    <ul className="flex flex-col gap-1">
      {notifications.map((n) => {
        const unread = !n.readAt
        return (
          <li key={n.notificationId}>
            <button
              type="button"
              onClick={() => onItemClick(n)}
              className={[
                'flex w-full items-start gap-2 rounded-control px-3 py-2.5 text-left transition-colors',
                'hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus-ring',
                unread ? 'bg-brand-50/60' : '',
              ].join(' ')}
            >
              {/* Decorative unread dot — the sr-only prefix below is the real
                  carrier of the state for screen readers, this is a purely
                  visual accent (never the sole signal, R5). */}
              <span
                aria-hidden="true"
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unread ? 'bg-brand-600' : 'bg-transparent'}`}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={`text-label ${unread ? 'font-semibold text-text' : 'font-medium text-text-muted'}`}>
                  {unread && <span className="sr-only">(읽지 않음) </span>}
                  {n.title}
                </span>
                <span className="truncate text-caption text-text-muted">{n.body}</span>
                <span className="text-caption text-text-disabled">{formatDateTimeKO(n.createdAt)}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export default NotificationPanel
