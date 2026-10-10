import { useEffect } from 'react'
import { queryClient } from '../../app/queryClient'
import { CONNECTION_STATUS, getConnections, getExternalEvents } from '../settings/settingsApi'
import { useSessionStore } from '../auth/sessionStore'

/*
  구글로 내보내지지 않던 버그의 수정 (2026-10-11). `getExternalEvents`
  (settingsApi.js 자신의 헤더 — GET /external-calendar-connections/{id}/events)가
  대기열(OutboundCalendarQueue)을 실제로 구글에 밀어내는 **유일한** 경로인데,
  이전에는 설정 화면의 "일정 가져와 반영"(useApplyCandidateEvents) 버튼을 눌러야만
  호출됐다 — 주간 계획에서 일정을 만들거나 옮겨도 대기열에 적히기만 하고 아무도
  그 GET을 부르지 않아 구글로 나가지 않았다.

  이 모듈이 그 GET을 자동으로 호출하는 유일한 자리다. **반영(apply)은 절대 하지
  않는다** — 응답은 버린다. 그 방향은 useApplyCandidateEvents(설정·온보딩)의
  몫으로 남아 있고, 이 모듈이 그 역할을 침범하면 사용자가 모르는 사이 CANDIDATE
  일정이 고정 일정으로 반영되는 사고가 난다.

  두 종류의 트리거가 하나의 실행(runSync)으로 모인다:
    1. scheduleCalendarSync() — 대기열에 무언가를 적는 쓰기(일정·SCHEDULE
       블록·고정 일정 CRUD)가 성공한 뒤 호출된다. 3초 디바운스: 드래그 연속
       이동이나 토글 연타가 호출 하나로 뭉친다.
    2. useCalendarSyncOnActive() — AppLayout에 한 번만 마운트해, 마운트 시점과
       탭이 다시 보일 때(visibilitychange) 마지막 실행으로부터 5분이 지났으면
       돈다. 드래그 직후 디바운스가 끝나기 전에 탭을 닫아도, 다음에 돌아왔을 때
       결국 한 번은 나간다.
  두 트리거 모두 같은 runSync()를 부르므로 동시성 가드(in-flight + trailing)가
  하나로 공유된다 — 디바운스가 끝나는 순간과 탭 재진입이 겹쳐도 GET이 두 벌
  나가지 않는다.
*/

// 3초 — 변경 직후 트리거(연타·드래그 연속 이동을 한 번으로 묶는다).
const DEBOUNCE_MS = 3000
// 5분 — 진입·탭 복귀 트리거. 너무 짧으면 포커스를 잃고 돌아올 때마다 구글
// API를 두드리고, 너무 길면 "들어왔는데도 안 나간다"는 체감이 생긴다.
const THROTTLE_MS = 5 * 60 * 1000

// 모듈 스코프 상태 — useToasts.js의 모듈 싱글턴과 같은 이유다: 디바운스
// 트리거(여러 mutation의 onSuccess 각각)와 마운트/가시성 트리거가 서로 다른
// 호출자인데도 같은 in-flight/타이머를 공유해야 동시 실행을 막을 수 있다.
let debounceTimer = null
let inFlight = null
let trailingRequested = false
let lastSyncAt = 0

/**
 * 실제 푸시. ACTIVE(API 어휘로는 CONNECTED — ConnectionStatus.java 참조, DB의
 * ACTIVE/INACTIVE와 API의 CONNECTED/DISABLED가 다르다) 연동마다 GET을 한 번씩
 * 부르고 결과는 버린다. 절대 reject하지 않는다 — 연동 조회 자체(getConnections)의
 * 실패든 개별 연동의 실패든, 이 동기화는 화면에 아무 흔적도 남기지 않는다
 * (토스트 없음, 개발 콘솔 경고만). 백엔드가 외부 제공자 실패로 조회를 깨지
 * 않는다는 같은 원칙(ExternalCalendarService.listEvents)을 프론트 쪽 트리거에도
 * 적용한 것이다.
 */
async function runSync() {
  if (inFlight) {
    // 이미 도는 중이면 새로 또 시작하지 않고, 지금 도는 것이 끝난 뒤 한 번만
    // 더 돌게 요청만 남긴다(trailing edge) — 겹쳐 쏘지 않는다.
    trailingRequested = true
    return inFlight
  }

  inFlight = (async () => {
    try {
      const connections = await getConnections()
      // 시도 자체를 "동기화"로 셈는다 — 연동이 없는 사용자가 탭을 들락거릴
      // 때마다 getConnections만 계속 불리는 것도 막는다(활성 연동이 있는지는
      // 어차피 그 호출 없이는 알 수 없다).
      lastSyncAt = Date.now()

      const active = connections.filter((c) => c.status === CONNECTION_STATUS.CONNECTED)
      if (active.length === 0) return // 연동이 없거나 전부 비활성 — 할 일이 없다.

      await Promise.all(
        active.map((c) =>
          getExternalEvents(c.connectionId).catch((error) => {
            // 조용히 무시 — 토스트 금지(오너 지시). 개발 중 추적용 경고만 남긴다.
            console.warn('[calendar-sync] 연동', c.connectionId, '동기화 실패', error)
          }),
        ),
      )

      // 구글 쪽 변경(삭제·수정)이 방금 이 GET으로 들어왔을 수 있다 — 주간 계획과
      // 고정 일정 캐시를 무효화해 다음에 열 때 최신을 보게 한다. `invalidateQueries`는
      // 활성 observer가 있는 쿼리만 즉시 백그라운드로 다시 받고 나머지는 stale
      // 표시만 하므로, 드래그 중인 블록을 이 호출이 직접 덮어쓰지는 않는다 — 혹시
      // 겹쳐 랜딩하더라도 각 블록 mutation(useMoveBlock 등)이 자신의 optimistic
      // 쓰기 직전에 거는 cancelQueries가 그 시점의 모든 in-flight 요청(이 호출이
      // 띄운 것 포함)을 먼저 끊어 둔다 — usePlanData.js useMoveBlock의 헤더가
      // 설명하는 그 경합 방지 관례를 그대로 올라탄다.
      queryClient.invalidateQueries({ queryKey: ['weekPlan'] })
      queryClient.invalidateQueries({ queryKey: ['fixedSchedules'] })
      queryClient.invalidateQueries({ queryKey: ['fixedSchedulesAll'] })
    } catch (error) {
      console.warn('[calendar-sync] 동기화 실패', error)
    } finally {
      inFlight = null
      if (trailingRequested) {
        trailingRequested = false
        runSync()
      }
    }
  })()

  return inFlight
}

/**
 * 변경 후 트리거. 대기열에 무언가를 적는 쓰기가 **성공한 뒤**에만 불러야 한다
 * (실패한 쓰기는 대기열에 아무것도 남기지 않으므로 동기화할 이유가 없다) —
 * 호출부(usePlanData.js/useSettings.js의 각 mutation onSuccess) 참조.
 */
export function scheduleCalendarSync() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(runSync, DEBOUNCE_MS)
}

/**
 * AppLayout에 한 번만 마운트한다(Toaster/SessionExpiredOverlay와 같은 자리).
 * 마운트 시점 + 탭이 다시 보일 때, 마지막 실행으로부터 5분이 지났으면 돈다.
 *
 * `expired`(OVL-SESSION)를 직접 확인하는 이유: AppLayout은 세션이 만료돼도
 * 언마운트되지 않는다(NFR-019, SessionExpiredOverlay가 배경 위에 겹쳐 뜰 뿐) —
 * 그래서 "마운트돼 있다"는 사실만으로는 로그인 상태를 보장하지 못한다. 로그아웃
 * 화면(AuthLayout)은 이 레이아웃 트리 밖이라 별도 처리가 필요 없다.
 */
export function useCalendarSyncOnActive() {
  const expired = useSessionStore((s) => s.expired)

  useEffect(() => {
    if (expired) return undefined

    const maybeSync = () => {
      if (Date.now() - lastSyncAt >= THROTTLE_MS) runSync()
    }

    maybeSync() // 마운트(최초 로드·재로그인 직후 재마운트) 트리거

    const onVisibility = () => {
      if (document.visibilityState === 'visible') maybeSync()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [expired])
}
