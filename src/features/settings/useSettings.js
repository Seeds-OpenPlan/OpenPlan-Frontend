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
  setConnectionActive,
  replaceSelectedCalendars,
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

// --- 연동 (FIX-13~17) — Google/Apple 독립 (오너 4차 리뷰로 2차의 단일 병합 정정) ---

export const connectionsKey = () => ['connections']

export function useConnections() {
  return useQuery({ queryKey: connectionsKey(), queryFn: getConnections })
}

export function useSetConnectionActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ provider, connected }) => setConnectionActive(provider, connected),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: connectionsKey() }),
    onError: () => toast({ tone: 'error', message: systemMessages.error.writeTitle }),
  })
}

export function useReplaceSelectedCalendars() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ provider, calendarIds }) => replaceSelectedCalendars(provider, calendarIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: connectionsKey() })
      toast({ tone: 'success', message: '저장했습니다' })
    },
    onError: () => toast({ tone: 'error', message: systemMessages.error.writeTitle }),
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
