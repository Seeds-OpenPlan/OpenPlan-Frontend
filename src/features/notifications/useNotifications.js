/*
  TanStack Query wiring for PNL-NOTI. Server state only — the panel's own
  open/closed flag is local UI state owned by NotificationBell (design-handoff
  §3 split), not written here.
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getNotifications, markNotificationRead } from './notificationsApi'
import { toast } from '../../hooks/useToasts'
import { systemMessages } from '../../constants/systemMessages'

export const notificationsKey = () => ['notifications']

export function useNotifications() {
  return useQuery({ queryKey: notificationsKey(), queryFn: getNotifications })
}

/** Unread count derived from the SAME list query the panel renders — never a
 * second independent count endpoint, so the badge and the list can never
 * disagree with each other. */
export function useUnreadNotificationCount() {
  const query = useNotifications()
  return (query.data ?? []).filter((n) => !n.readAt).length
}

/**
 * NOTI-03 읽음 처리. Optimistic — clicking an item marks it read in the
 * cache immediately (AC-4 "미확인 배지 수 즉시 갱신"), same rollback shape
 * usePatchNotificationSetting already uses: snapshot only THIS item's own
 * prior readAt, not the whole list, so two reads firing close together can
 * never roll back each other's already-succeeded write.
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: markNotificationRead,
    onMutate: (notificationId) => {
      const prevList = queryClient.getQueryData(notificationsKey())
      const prevReadAt = prevList?.find((n) => n.notificationId === notificationId)?.readAt
      queryClient.setQueryData(notificationsKey(), (curr) =>
        (curr ?? []).map((n) =>
          n.notificationId === notificationId && !n.readAt
            ? { ...n, readAt: new Date().toISOString() }
            : n,
        ),
      )
      return { notificationId, prevReadAt }
    },
    onError: (_err, _vars, context) => {
      if (!context) return
      queryClient.setQueryData(notificationsKey(), (curr) =>
        (curr ?? []).map((n) =>
          n.notificationId === context.notificationId ? { ...n, readAt: context.prevReadAt } : n,
        ),
      )
      toast({ tone: 'error', message: systemMessages.error.writeTitle })
    },
  })
}
