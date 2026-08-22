/*
  TanStack Query wiring for every ST-F1-12 설정 screen. 가용 시간 범위(요일별
  patterns) 자체는 usePlanData.useAvailability/useSaveAvailability를 그대로
  재사용한다(real, already-built contract) — 여기서 다시 선언하지 않는다. 이
  파일이 다루는 "가용 시간"은 그것과는 다른, phase 1에서 새로 추가된 사용자
  입력 주간 목표치([가정-확장] — settingsApi.js 헤더) 하나뿐이다.

  Server state (TanStack Query) only; local drafts (a form's in-progress
  title/time before it is submitted) stay in the page's own useState, same
  split every other feature in this codebase follows (design-handoff §3).
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getAllFixedSchedules,
  createFixedSchedule,
  updateFixedSchedule,
  deleteFixedSchedule,
  previewFixedScheduleConflicts,
} from '../plan/fixedScheduleApi'
import {
  getWeeklyAvailableMinutes,
  updateWeeklyAvailableMinutes,
  getPreferences,
  updatePreferences,
  getSuggestion,
  getConnections,
  getAvailableCalendars,
  setConnectionStatus,
  replaceSelectedCalendars,
  disconnectConnection,
  createAppleConnection,
  createGoogleConnection,
  getAccount,
  updateAccount,
  deactivateAccount,
  reactivateAccount,
  getNotificationSettings,
  patchNotificationSetting,
} from './settingsApi'
import { toast } from '../../hooks/useToasts'
import { systemMessages } from '../../constants/systemMessages'

// --- 가용 시간 (사용자 입력, phase 1) ------------------------------------------------

export const weeklyAvailableMinutesKey = () => ['weeklyAvailableMinutes']

export function useWeeklyAvailableMinutes() {
  return useQuery({ queryKey: weeklyAvailableMinutesKey(), queryFn: getWeeklyAvailableMinutes })
}

export function useUpdateWeeklyAvailableMinutes() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateWeeklyAvailableMinutes,
    onSuccess: (data) => {
      queryClient.setQueryData(weeklyAvailableMinutesKey(), data)
      toast({ tone: 'success', message: '가용 시간을 저장했습니다' })
    },
    onError: () => toast({ tone: 'error', message: systemMessages.error.writeTitle }),
  })
}

// --- 고정 일정 관리 (FIX-04~09) ----------------------------------------------------

export const fixedSchedulesAllKey = () => ['fixedSchedulesAll']

/** Week-agnostic list for the settings screen (distinct from the plan-grid's
 * week-scoped `fixedSchedulesKey` in usePlanData.js). */
export function useAllFixedSchedules() {
  return useQuery({
    queryKey: fixedSchedulesAllKey(),
    queryFn: getAllFixedSchedules,
  })
}

// Both keys below are invalidated together on every mutation: `fixedSchedulesAllKey`
// (['fixedSchedulesAll']) is this settings screen's own week-agnostic list, while
// `['fixedSchedules']` is a PREFIX match on the plan-grid's per-week query key
// (usePlanData.js's `fixedSchedulesKey`, `['fixedSchedules', weekStartISO]`).
// TanStack Query's default `invalidateQueries` matching is prefix-based, so this
// one call marks every cached week stale regardless of which week is open — a
// CRUD here used to only invalidate the settings-list key, leaving the grid
// showing a stale fixed schedule for up to its own 5-minute staleTime.
const gridFixedSchedulesKeyPrefix = () => ['fixedSchedules']

export function useCreateFixedSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createFixedSchedule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fixedSchedulesAllKey() })
      queryClient.invalidateQueries({ queryKey: gridFixedSchedulesKeyPrefix() })
      toast({ tone: 'success', message: '고정 일정을 추가했습니다' })
    },
    onError: () => toast({ tone: 'error', message: systemMessages.error.writeTitle }),
  })
}

export function useUpdateFixedSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ fixedScheduleId, patch }) => updateFixedSchedule(fixedScheduleId, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fixedSchedulesAllKey() })
      queryClient.invalidateQueries({ queryKey: gridFixedSchedulesKeyPrefix() })
      toast({ tone: 'success', message: '저장했습니다' })
    },
    // NOTE: E-COM-006 (version conflict) is surfaced to the caller via the
    // rejected promise (the mutation's own onError below only toasts a generic
    // failure) — the fixed-schedule FORM catches the specific code itself to
    // drive ConflictOverlay, same split ProjectManageForm's mutation call uses.
    onError: (error) => {
      if (error?.code === 'E-COM-006') return
      toast({ tone: 'error', message: systemMessages.error.writeTitle })
    },
  })
}

export function useDeleteFixedSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (fixedScheduleId) => deleteFixedSchedule(fixedScheduleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fixedSchedulesAllKey() })
      queryClient.invalidateQueries({ queryKey: gridFixedSchedulesKeyPrefix() })
      toast({ tone: 'success', message: '고정 일정을 삭제했습니다' })
    },
    onError: () => toast({ tone: 'error', message: systemMessages.error.writeTitle }),
  })
}

/**
 * Dry-run conflict preview (FIX-08). A mutation, not a query — it fires
 * on-demand right before a create/update submit, never in the background, and
 * its result is transient (shown once in the form, never cached).
 */
export function usePreviewFixedScheduleConflicts() {
  return useMutation({ mutationFn: previewFixedScheduleConflicts })
}

// --- 기본값 (FIX-10~12) ------------------------------------------------------------

export const preferencesKey = () => ['preferences']
export const suggestionKey = () => ['preferences', 'suggestion']

export function usePreferences() {
  return useQuery({ queryKey: preferencesKey(), queryFn: getPreferences })
}

/** RB-FIX-01 제안 칩. Independent query — the chip must render even before the
 * preferences read settles, and a failure here should never block the radios. */
export function useSuggestion() {
  return useQuery({ queryKey: suggestionKey(), queryFn: getSuggestion, staleTime: 5 * 60 * 1000 })
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updatePreferences,
    onSuccess: (data) => {
      queryClient.setQueryData(preferencesKey(), data)
      toast({ tone: 'success', message: '기본값을 저장했습니다' })
    },
    onError: () => toast({ tone: 'error', message: systemMessages.error.writeTitle }),
  })
}

// --- 연동 (FIX-13~17 + 신규 연동 생성) — connectionId 기준 (W6 계약 정합) -------

export const connectionsKey = () => ['connections']
export const availableCalendarsKey = (connectionId) => ['connections', connectionId, 'calendars']

export function useConnections() {
  return useQuery({ queryKey: connectionsKey(), queryFn: getConnections })
}

/** 캘린더 선택 다이얼로그가 열릴 때만 조회 — connectionId가 없으면(다이얼로그
 * 닫힘) 아예 요청을 보내지 않는다. */
export function useAvailableCalendars(connectionId) {
  return useQuery({
    queryKey: availableCalendarsKey(connectionId),
    queryFn: () => getAvailableCalendars(connectionId),
    enabled: Boolean(connectionId),
  })
}

/** PATCH status — 일시 정지/재개(비파괴적). 확인창 없이 Toggle에서 즉시
 * 호출된다(연동 해제와 다른 동작이라는 설명은 settingsApi.js 참조). */
export function useSetConnectionStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ connectionId, status }) => setConnectionStatus(connectionId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: connectionsKey() }),
    onError: () => toast({ tone: 'error', message: systemMessages.error.writeTitle }),
  })
}

export function useReplaceSelectedCalendars() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ connectionId, calendarIds }) => replaceSelectedCalendars(connectionId, calendarIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: connectionsKey() })
      toast({ tone: 'success', message: '저장했습니다' })
    },
    onError: () => toast({ tone: 'error', message: systemMessages.error.writeTitle }),
  })
}

/** DELETE — 완전한 연동 해제(FIX-17). 호출부(CalendarConnectionSection)가
 * 확인 다이얼로그 뒤에서만 mutate한다. */
export function useDisconnectConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (connectionId) => disconnectConnection(connectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: connectionsKey() })
      toast({ tone: 'success', message: '연동을 해제했습니다' })
    },
    onError: () => toast({ tone: 'error', message: systemMessages.error.writeTitle }),
  })
}

/**
 * 신규 애플 연동 생성. onError에서 공통 토스트를 띄우지 않는다 —
 * AppleConnectDialog가 422(폼 재표시)/502(재시도 버튼)/409(이미 연결됨)를
 * 서로 다른 화면 상태로 직접 분기해야 하므로, 여기서 토스트 하나로 뭉개면
 * 그 구분이 사라진다(팀장 지시의 핵심 요구사항).
 */
export function useCreateAppleConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createAppleConnection,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: connectionsKey() }),
  })
}

/** 신규 구글 연동 생성(OAuth 콜백 착지점 전용 — GoogleCalendarCallbackPage).
 * 위 애플 훅과 같은 이유로 onError 토스트를 걸지 않는다. */
export function useCreateGoogleConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createGoogleConnection,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: connectionsKey() }),
  })
}

// --- 계정 (ACCT-01/02) --------------------------------------------------------------

export const accountKey = () => ['account']

export function useAccount() {
  return useQuery({ queryKey: accountKey(), queryFn: getAccount })
}

// 이름 변경 (오너 리뷰 3차, item 5). 성공 응답을 캐시에 바로 반영 — 별도
// invalidate 왕복 없이 화면이 새 이름을 즉시 보여준다.
export function useUpdateAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateAccount,
    onSuccess: (data) => queryClient.setQueryData(accountKey(), data),
    onError: () => toast({ tone: 'error', message: systemMessages.error.writeTitle }),
  })
}

export function useDeactivateAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deactivateAccount,
    onSuccess: (data) => {
      queryClient.setQueryData(accountKey(), data)
      toast({ tone: 'info', message: '계정을 비활성화했습니다' })
    },
    onError: () => toast({ tone: 'error', message: systemMessages.error.writeTitle }),
  })
}

export function useReactivateAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: reactivateAccount,
    onSuccess: (data) => {
      queryClient.setQueryData(accountKey(), data)
      toast({ tone: 'success', message: '계정을 재활성화했습니다' })
    },
    onError: () => toast({ tone: 'error', message: systemMessages.error.writeTitle }),
  })
}

// --- 알림 (NOTI-01) -------------------------------------------------------------------

export const notificationSettingsKey = () => ['notificationSettings']

export function useNotificationSettings() {
  return useQuery({ queryKey: notificationSettingsKey(), queryFn: getNotificationSettings })
}

/**
 * Each toggle saves itself immediately (AC "5종 토글 즉시 저장") — optimistic,
 * same shape as useSaveAvailability: write the flipped value synchronously so
 * the switch never visibly lags behind the click, roll back on failure.
 *
 * Thomas 리뷰 MEDIUM fix: rollback restores ONLY the failed toggle's OWN key,
 * not the whole cached object. The previous version snapshotted the entire
 * notificationSettings object in onMutate and restored that whole snapshot on
 * error — two toggles flipped quickly (both optimistic, both landed in the
 * cache) where the SECOND one fails would restore the pre-FIRST-toggle
 * snapshot, silently reverting the first toggle's already-succeeded change
 * too. Snapshotting just `prevValue = curr?.[key]` and restoring only that
 * one field makes each toggle's rollback independent of any other toggle's
 * concurrent mutation.
 */
export function usePatchNotificationSetting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ key, enabled }) => patchNotificationSetting(key, enabled),
    onMutate: ({ key, enabled }) => {
      const prevValue = queryClient.getQueryData(notificationSettingsKey())?.[key]
      queryClient.setQueryData(notificationSettingsKey(), (curr) => ({ ...curr, [key]: enabled }))
      return { key, prevValue }
    },
    onError: (_err, _vars, context) => {
      if (context) {
        queryClient.setQueryData(notificationSettingsKey(), (curr) => ({
          ...curr,
          [context.key]: context.prevValue,
        }))
      }
      toast({ tone: 'error', message: systemMessages.error.writeTitle })
    },
  })
}
