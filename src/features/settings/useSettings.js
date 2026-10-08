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
import { useRef } from 'react'
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
  setWriteCalendar,
  disconnectConnection,
  createAppleConnection,
  createGoogleConnection,
  getExternalEvents,
  applyExternalEvent,
  getAccount,
  updateAccount,
  deactivateAccount,
  reactivateAccount,
  getNotificationSettings,
  saveNotificationSettings,
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
      // W6: 가용 시간·기본값은 이제 같은 서버 리소스(/users/me/preferences)를
      // 공유한다(settingsApi.js 헤더 참조) — 이 캐시(weeklyAvailableMinutesKey)만
      // 갱신하면 기본값 화면이 이미 열어 둔 preferencesKey 캐시는 이 쓰기를
      // 모른 채 stale하게 남는다. invalidate로 그 화면이 다음에 읽을 때 최신
      // 세 필드를 다시 받게 한다(즉시 반영이 급한 화면이 아니라 setQueryData
      // 대신 invalidate로 충분하다).
      queryClient.invalidateQueries({ queryKey: preferencesKey() })
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
      // W6: 반대 방향 무효화 — 위 useUpdateWeeklyAvailableMinutes의 같은 주석 참조.
      queryClient.invalidateQueries({ queryKey: weeklyAvailableMinutesKey() })
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
    // `selections`: `[{externalCalendarId, name}]` — settingsApi.replaceSelectedCalendars
    // 자신의 헤더 참고(계약이 요구하는 모양, id 배열이 아니다).
    mutationFn: ({ connectionId, selections }) => replaceSelectedCalendars(connectionId, selections),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: connectionsKey() })
      toast({ tone: 'success', message: '저장했습니다' })
    },
    onError: () => toast({ tone: 'error', message: systemMessages.error.writeTitle }),
  })
}

/**
 * PUT write-calendar — 내보낼 대상 캘린더 지정/해제(이슈 #69).
 *
 * 성공 토스트를 «지정/해제»로 갈라 띄운다: 해제도 사용자가 의도적으로 하는
 * 동작인데 "저장했습니다"만 뜨면 무엇이 저장됐는지가 화면에서 사라진다.
 */
export function useSetWriteCalendar() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ connectionId, externalCalendarId }) =>
      setWriteCalendar(connectionId, externalCalendarId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: connectionsKey() })
      toast({
        tone: 'success',
        message: variables?.externalCalendarId
          ? '내보낼 캘린더를 지정했습니다'
          : '내보내기를 끄고 대상을 해제했습니다',
      })
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

/**
 * 후보 일정을 가져와 한 번에 반영한다 (ONB-08 → ONB-09 일괄).
 *
 * 두 API를 한 동작으로 묶는 이유: 사용자에게 "외부 일정을 주간 계획에 넣는다"는
 * 한 가지 일인데 계약은 조회(=동기화)와 반영을 나눠 두었다. 화면이 그 둘을 따로
 * 노출하면 "가져오기만 하고 반영은 안 한" 상태가 생기는데, 그 상태는 화면에서
 * **아무것도 안 가져온 상태와 구별되지 않는다** — 둘 다 주간 계획이 비어 있다.
 *
 * 반영은 순차로 돈다. 병렬로 쏘면 같은 연동의 동기화·반영이 겹쳐 서버가 막아
 * 놓은 경합 경로(409·UQ 위반 흡수)를 불필요하게 두드린다.
 *
 * 409는 실패로 세지 않는다 — 서버가 중복 반영을 막아 준 것이고 사용자 관점에서는
 * 이미 반영된 것이다(settingsApi.applyExternalEvent 헤더 참조).
 */
export function useApplyCandidateEvents() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (connectionId) => {
      const events = await getExternalEvents(connectionId, 'CANDIDATE')
      let applied = 0
      let already = 0
      let failed = 0
      for (const event of events) {
        try {
          await applyExternalEvent(event.externalCalendarEventId, 'AS_IS')
          applied += 1
        } catch (error) {
          if (error?.status === 409) already += 1
          else failed += 1
        }
      }
      return { fetched: events.length, applied, already, failed }
    },
    onSuccess: ({ fetched, applied, already, failed }) => {
      // 고정 일정이 새로 생겼다 — 주간 계획·고정 일정 화면이 모두 그것을 읽는다.
      // 주차별로 키가 갈리므로 접두사로 한 번에 무효화한다.
      queryClient.invalidateQueries({ queryKey: ['fixedSchedules'] })
      queryClient.invalidateQueries({ queryKey: fixedSchedulesAllKey() })
      queryClient.invalidateQueries({ queryKey: ['weekPlan'] })

      if (fetched === 0) {
        // 🔴 "일정이 없다"로 단정하지 않는다. 가져올 캘린더를 안 골랐어도 빈 목록이
        //    온다(settingsApi.getExternalEvents 헤더) — 두 원인을 한 문장에 담는다.
        toast({ tone: 'info', message: '반영할 새 일정이 없습니다. 가져올 캘린더를 선택했는지 확인해 주세요' })
        return
      }
      if (failed > 0) {
        toast({ tone: 'error', message: `${applied}개 반영, ${failed}개 실패했습니다` })
        return
      }
      toast({
        tone: 'success',
        message: already > 0 ? `${applied}개 반영했습니다 (${already}개는 이미 반영됨)` : `${applied}개 반영했습니다`,
      })
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

/**
 * W6 PATH CORRECTION (settingsApi.deactivateAccount 자신의 헤더 참고): 실
 * DELETE /users/me는 `{ recoverableUntil }` 하나만 돌려준다 — mock(DEV
 * fallback)은 여전히 `{ ...account, status, deactivatedAt }` 전체를 돌려준다.
 * 두 모양이 다르므로 응답을 캐시에 그대로 덮어쓰지 않고(예전엔 그렇게
 * 했었다 — 실서버로 붙는 순간 name/email 등 나머지 계정 필드가 통째로
 * 사라졌을 것이다) 기존 캐시 위에 안전하게 병합한다. `status`/
 * `deactivatedAt`은 UserProfile 계약 자체에 없는 필드라([가정-확장] 그대로,
 * settingsApi.js 주석 참조) 실서버 응답에 그 키가 없으면 여기서 직접
 * 채워 넣는다.
 */
export function useDeactivateAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deactivateAccount,
    onSuccess: (data) => {
      queryClient.setQueryData(accountKey(), (curr) => ({
        ...curr,
        ...data,
        status: data?.status ?? 'DEACTIVATED',
        deactivatedAt: data?.deactivatedAt ?? curr?.deactivatedAt ?? new Date().toISOString(),
      }))
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

// --- 알림 (NOTI-01, 확정 계약) --------------------------------------------------------

export const notificationSettingsKey = () => ['notificationSettings']

export function useNotificationSettings() {
  return useQuery({ queryKey: notificationSettingsKey(), queryFn: getNotificationSettings })
}

/**
 * Each toggle saves itself immediately (AC "5종 토글 즉시 저장") — optimistic,
 * same shape as useSaveAvailability: write the flipped value(s) synchronously
 * so the switch never visibly lags behind the click, roll back on failure.
 *
 * `changes`는 `{ type, enabled }` 배열이다. 개별 토글은 원소 1개로 호출하고,
 * 마스터 토글(화면 전용 편의 기능 — SettingsNotificationsPage 헤더 참고)은
 * 5개를 한 번에 묶어 호출한다 — 계약 자체가 배열 저장(PUT `{settings:[...]}`)
 * 이라 이 배열이 그대로 요청 모양이 된다(별도 "마스터 전용" 엔드포인트 없음).
 *
 * 2026-10-08 계약 수정에서도 롤백 범위는 이전 usePatchNotificationSetting의
 * Thomas 리뷰 MEDIUM fix를 그대로 지킨다: 이 호출이 "바꾼 유형들만" 각자의
 * 이전 값으로 되돌리고, 캐시 전체를 스냅샷/복원하지 않는다. 두 호출이 겹쳐
 * 들어와도(토글 연타, 또는 마스터+개별 동시) 먼저 성공한 호출의 결과를 나중
 * 실패한 호출의 롤백이 덮어쓰는 사고를 막는다 — 각 호출은 자기가 만진 키만
 * 책임진다.
 *
 * Thomas PR 리뷰 SHOULD-FIX #1 (onSuccess 누락): PUT 응답은 서버가 부분
 * 저장을 적용한 뒤 돌려주는 5종 전체 최신값이다 — 그런데 onSuccess가 없어서
 * 그 값을 그냥 버리고 있었다. 지금은 캐시에 반영한다. `requestId` 순번
 * 가드를 같이 두는 이유: SettingsNotificationsPage가 `save.isPending` 동안
 * 토글 전체를 disabled로 막아 겹쳐 보내는 경로 자체를 없앴지만(SHOULD-FIX
 * #2), 그 disabled 반영은 React 상태 갱신을 한 번 거쳐야 DOM에 닿는다 — 같은
 * 틱에서 더블클릭처럼 `onMutate`가 두 번 연속 돈 뒤에야 `isPending`이
 * true로 보이는 극히 짧은 틈이 이론상 남는다. 그 틈에 먼저 보낸 요청의
 * 응답이 나중에 보낸 요청보다 늦게 도착하면, 가드 없이는 "가장 최근에
 * 보낸" 낙관적 상태를 "더 오래된" 서버 응답이 덮어써 화면이 거꾸로 간다.
 * `latestRequestId`와 다르면 onSuccess가 그 응답을 조용히 버려 항상 "가장
 * 마지막으로 보낸 요청"만 캐시에 반영되게 한다.
 *
 * PR #69 AI 리뷰 Blocking 수정: `saveNotificationSettings`(settingsApi.js
 * `parseSavedSettings`)는 이제 "알려진 5종을 전부 포함한 배열"일 때만 값을
 * 주고, 그렇지 않으면(계약이 PUT 200 응답 본문을 보장하지 않는다 — 빈
 * 본문·일부 누락 전부 가능) `null`을 준다. `data`가 `null`이면 캐시를
 * 섣불리 덮어쓰지 않는다 — 이미 반영된 낙관적 값(onMutate가 쓴 값)을 그대로
 * 둔 채 GET을 invalidate해 다음 조회가 서버 진실값으로 수렴하게 한다. 이
 * 분기를 두지 않고 `null`을 그대로 캐시에 썼다면 이후 모든 `settings[type]`
 * 읽기가 TypeError로 깨졌을 것이고, 빈 배열을 "켜짐 기본값"으로 메웠다면
 * (이전 버전의 실수) 방금 끈 토글이 저장 성공 직후 다시 켜진 것처럼 보였을
 * 것이다.
 */
export function useSaveNotificationSettings() {
  const queryClient = useQueryClient()
  const latestRequestId = useRef(0)
  return useMutation({
    mutationFn: (changes) => saveNotificationSettings(changes),
    onMutate: (changes) => {
      const requestId = ++latestRequestId.current
      const prev = queryClient.getQueryData(notificationSettingsKey())
      const prevEntries = changes.map(({ type }) => [type, prev?.[type]])
      queryClient.setQueryData(notificationSettingsKey(), (curr) => {
        const next = { ...curr }
        for (const { type, enabled } of changes) next[type] = enabled
        return next
      })
      return { prevEntries, requestId }
    },
    onSuccess: (data, _vars, context) => {
      // 더 최근 요청이 이미 나갔다면 이 응답(더 오래된 요청의 응답)은 버린다
      // — 위 헤더 주석의 순번 가드.
      if (context?.requestId !== latestRequestId.current) return
      if (data == null) {
        // 계약이 보장하지 않는 응답(빈 본문 등) — 낙관적 값을 그대로 두고
        // 서버 진실값을 다시 받아온다. setQueryData로 덮어쓰지 않는다.
        queryClient.invalidateQueries({ queryKey: notificationSettingsKey() })
        return
      }
      queryClient.setQueryData(notificationSettingsKey(), data)
    },
    onError: (_err, _vars, context) => {
      if (context) {
        queryClient.setQueryData(notificationSettingsKey(), (curr) => {
          const next = { ...curr }
          for (const [type, value] of context.prevEntries) next[type] = value
          return next
        })
      }
      toast({ tone: 'error', message: systemMessages.error.writeTitle })
    },
  })
}
