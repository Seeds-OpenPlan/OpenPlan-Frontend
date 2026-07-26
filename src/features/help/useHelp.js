/*
  TanStack Query wiring for ST-F1-15's 문의·FAQ·공지 screens. Server state
  only — TicketCreateForm's in-progress form fields stay in that component's
  own useState (design-handoff §3 split), same as every other create form here.
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getTickets, getTicket, createTicket, getFaqArticles, getAnnouncements, getAnnouncement } from './helpApi'
import { toast } from '../../hooks/useToasts'
import { systemMessages } from '../../constants/systemMessages'

// --- 문의 --------------------------------------------------------------------------

export const ticketsKey = () => ['supportTickets']
export const ticketKey = (ticketId) => ['supportTickets', ticketId]

export function useTickets() {
  return useQuery({ queryKey: ticketsKey(), queryFn: getTickets })
}

/** enabled: false 없음 — ticketId는 라우트 파라미터라 항상 존재. 소유권 검증
 * (본인 것이 아니면 SCR-403)은 이 훅이 아니라 호출자(HelpDetailPage)의 몫 —
 * 이 훅은 순수하게 "이 id의 티켓을 가져온다"만 책임진다. */
export function useTicket(ticketId) {
  return useQuery({ queryKey: ticketKey(ticketId), queryFn: () => getTicket(ticketId) })
}

export function useCreateTicket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createTicket,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ticketsKey() })
    },
    onError: () => toast({ tone: 'error', message: systemMessages.error.writeTitle }),
  })
}

// --- FAQ ---------------------------------------------------------------------------

export const faqArticlesKey = (query) => ['faqArticles', query ?? '']

// staleTime 5분 — FAQ는 자주 바뀌는 데이터가 아니고(RB-FIX-01 제안 칩처럼),
// 검색어를 지웠다 다시 입력하는 짧은 왕복마다 재요청하는 것도 낭비.
export function useFaqArticles(query) {
  return useQuery({
    queryKey: faqArticlesKey(query),
    queryFn: () => getFaqArticles(query),
    staleTime: 5 * 60 * 1000,
  })
}

// --- 공지 --------------------------------------------------------------------------

export const announcementsKey = () => ['announcements']
export const announcementKey = (noticeId) => ['announcements', noticeId]

export function useAnnouncements() {
  return useQuery({ queryKey: announcementsKey(), queryFn: getAnnouncements })
}

export function useAnnouncement(noticeId) {
  return useQuery({ queryKey: announcementKey(noticeId), queryFn: () => getAnnouncement(noticeId) })
}
