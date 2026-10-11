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

  마지막 실행 시각(lastSyncAt)은 탭 간에 localStorage로도 공유한다(Thomas
  리뷰 SHOULD-FIX, 2026-10-11) — 모듈 스코프 변수만으로는 탭마다 따로 메모리를
  가져서, 여러 탭을 열어 두면 진입·복귀 트리거가 탭 수만큼 중복으로 나간다.
  키를 사용자별로 두는 이유는 로그아웃 뒤 다른 계정으로 들어와도 그 계정 몫의
  슬롯이 따로 있어 서로 침범하지 않기 때문이다. `resetCalendarSyncState()`는
  그 사용자별 키를 고르지 않고 접두사로 모든 슬롯을 지운다(PR #76 AI 리뷰
  Should-fix, 2026-10-11 — 아래 그 함수 헤더 참조: 로그인 onSuccess 시점엔
  세션 캐시가 아직 로그인 이전 값이라 "지금 사용자의 슬롯"을 세션에서 정확히
  골라낼 수 없다). 변경 후 트리거(디바운스)는 탭 로컬 그대로 둔다 — 실제로
  쓰기가 일어난 탭만 부르므로 공유할 "마지막 쓰기 시각"이 의미가 없다(어느
  탭의 디바운스든 그 탭에서의 마지막 쓰기로부터 3초면 된다).
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
// localStorage가 막혀 있을 때(프라이빗 모드 등)의 폴백이자, 이 탭 안에서 가장
// 최근에 실제로 확인한 값의 캐시 — getLastSyncAt/setLastSyncAt이 항상 이
// 값도 함께 갱신한다.
let lastSyncAt = 0

// 탭 간 공유 슬롯 키의 접두사. storageKey()가 사용자별 키를 만들 때,
// resetCalendarSyncState()가 "지금 사용자가 누구든" 전부 지울 때 둘 다
// 이 하나의 상수를 기준으로 삼는다(두 값이 따로 하드코딩돼 있다가 한쪽만
// 바뀌는 사고를 막는다).
const STORAGE_KEY_PREFIX = 'openplan.calendarSync.lastSyncAt.'

/**
 * 탭 간 공유 슬롯의 키. 세션 캐시(['auth','session'])에서 읽은 userId로 가른다
 * — sessionGuardLoader(router.js)가 AppLayout을 그리기 전에 그 쿼리를
 * ensureQueryData로 이미 채워 두므로, 마운트/가시성 트리거(useCalendarSyncOnActive)
 * 가 이 키를 쓸 시점엔 항상 값이 있다.
 *
 * 🔴 `resetCalendarSyncState()`는 이 함수를 쓰지 않는다(PR #76 AI 리뷰 Should-fix,
 * 2026-10-11) — useLogin의 onSuccess에서는 바로 앞의 `invalidateQueries`가
 * 비동기라, 이 함수가 읽는 세션 캐시가 아직 로그인 이전 값(대개 없음 →
 * 'anonymous')이다. 그 한 슬롯만 지우면 방금 로그인한 사용자의 실제 슬롯은
 * 그대로 남아 로그인 직후의 진입 동기화가 스킵된다. reset은 그 함수 자신의
 * 헤더가 설명하듯 세션 캐시에 의존하지 않고 접두사로 전부 지운다.
 */
function storageKey() {
  const userId = queryClient.getQueryData(['auth', 'session'])?.userId ?? 'anonymous'
  return `${STORAGE_KEY_PREFIX}${userId}`
}

/** 탭 간 공유 값을 읽는다. 실패(프라이빗 모드, 저장소 비활성화 등)하면 이
 * 탭의 메모리 값으로 조용히 대체한다 — 공유만 못 할 뿐 스로틀 자체는
 * 계속 동작한다. */
function getLastSyncAt() {
  try {
    const raw = window.localStorage.getItem(storageKey())
    const parsed = raw == null ? NaN : Number(raw)
    if (Number.isFinite(parsed)) return parsed
  } catch {
    // 아래 폴백으로 떨어진다.
  }
  return lastSyncAt
}

/** 탭 간 공유 값을 쓴다. 메모리 값은 항상 갱신하고(이 탭의 폴백), localStorage
 * 쓰기는 실패해도 무시한다 — 어차피 메모리 값이 이 탭 자신의 다음 판단에는
 * 쓰인다. */
function setLastSyncAt(value) {
  lastSyncAt = value
  try {
    window.localStorage.setItem(storageKey(), String(value))
  } catch {
    // 쓰기 실패 — 이 탭 안에서는 메모리 값으로 계속 동작하되, 다른 탭과는
    // 더는 공유되지 않는다(허용 가능한 성능 저하일 뿐 정확성 문제는 아니다).
  }
}

/**
 * 실제 푸시. ACTIVE(API 어휘로는 CONNECTED — ConnectionStatus.java 참조, DB의
 * ACTIVE/INACTIVE와 API의 CONNECTED/DISABLED가 다르다) 연동마다 GET을 한 번씩
 * 부르고 결과는 버린다. 절대 reject하지 않는다 — 연동 조회 자체(getConnections)의
 * 실패든 개별 연동의 실패든, 이 동기화는 화면에 아무 흔적도 남기지 않는다
 * (토스트 없음, 개발 콘솔 경고만). 백엔드가 외부 제공자 실패로 조회를 깨지
 * 않는다는 같은 원칙(ExternalCalendarService.listEvents)을 프론트 쪽 트리거에도
 * 적용한 것이다.
 *
 * 여러 트리거가 겹쳐 같은 GET을 반복해도 안전하다(PR #76 AI 재리뷰 확인 사항,
 * 2026-10-11) — `ExternalCalendarService.synchronize`(origin/main :509-568)가
 * `externalEventId` 기준 `existing` 맵으로 이미 있는 CANDIDATE 행을 그 자리에서
 * resync()하지, 매번 새로 insert하지 않는다. 동시에 같은 연동을 두 번 조회해도
 * 그 저장 경합은 DataIntegrityViolationException으로 흡수된다(같은 파일 :613·621).
 * 즉 이 GET은 몇 번을 겹쳐 불러도 CANDIDATE가 중복으로 쌓이지 않는다 — in-flight
 * 가드는 순전히 불필요한 네트워크 왕복을 줄이기 위한 것이고, 정합성을 위해
 * 필수인 건 아니다.
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
      // 어차피 그 호출 없이는 알 수 없다). localStorage에도 같이 써서 다른
      // 탭의 스로틀도 같이 늦춘다.
      setLastSyncAt(Date.now())

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
      //
      // `['fixedSchedules']`는 더 없다(main #70 BE-90 머지 — PR #76 재리뷰
      // Should-fix, 2026-10-11) — 고정 일정은 이제 주간 계획 응답(`weekPlan`)에
      // 함께 실려 오고, 그 전용 쿼리 키 자체가 사라졌다(usePlanData.js의
      // `useFixedSchedules`가 `weekPlanKey`를 `select`로 좁혀 읽는 것을 참조).
      // 그래서 그 키를 invalidate하던 줄은 더는 아무 쿼리와도 매칭되지 않는
      // no-op이라 지웠다 — `['weekPlan']`이 이미 그 데이터를 포함한다.
      queryClient.invalidateQueries({ queryKey: ['weekPlan'] })
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
    // 저장소 관례(src/api/client.js의 `typeof window !== 'undefined'` 가드 등) —
    // 이 모듈은 항상 브라우저에서만 쓰이지만, document가 없는 런타임에서도
    // 조용히 아무 일도 안 하게 방어한다.
    if (typeof document === 'undefined') return undefined

    const maybeSync = () => {
      if (Date.now() - getLastSyncAt() >= THROTTLE_MS) runSync()
    }

    maybeSync() // 마운트(최초 로드·재로그인 직후 재마운트) 트리거

    const onVisibility = () => {
      if (document.visibilityState === 'visible') maybeSync()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [expired])
}

/**
 * 로그아웃 시작(useLogout의 onMutate)과 로그인 성공(useLogin의 onSuccess) 양쪽
 * 모두에서 호출한다(Thomas 리뷰 SHOULD-FIX, 2026-10-11 / PR #76 AI 리뷰
 * Should-fix, 2026-10-11 두 차례 수정됨).
 *
 * 문제: lastSyncAt이 메모리/localStorage 어디에도 리셋되는 자리가 없으면,
 * 로그아웃 직후 5분 안에 (같은 계정이든 다른 계정이든) 다시 로그인했을 때
 * 진입 트리거가 "최근에 돈 적 있다"로 읽혀 스킵된다 — 그 계정의 큐는 로그아웃과
 * 무관하게 서버에 그대로 남아 있으므로, 로그인 직후 한 번은 반드시 돌아야 한다.
 *
 * 🔴 세션 캐시로 "지금 지울 슬롯"을 고르지 않는다(PR #76 수정) — 처음엔
 * `storageKey()`(세션 캐시의 userId 기반)로 딱 한 슬롯만 지웠는데,
 * useLogin의 onSuccess에서는 바로 앞 줄의 `invalidateQueries(['auth',
 * 'session'])`가 비동기라 이 함수가 실행되는 시점에 그 캐시가 아직 로그인
 * **이전** 값이다(새 탭·재인증 경로에서는 `undefined` → 'anonymous'로
 * 떨어진다). 그러면 방금 로그인한 사용자의 실제 슬롯(`...lastSyncAt.<그
 * 사용자의 userId>`)은 전혀 건드리지 못하고 엉뚱한 슬롯만 지워, 로그인 직후
 * 진입 동기화가 조용히 스킵됐다.
 *
 * 대안으로 로그인 응답의 userId를 인자로 받는 방법도 검토했으나(②), 로그인
 * 쪽만 그 인자가 생기고 로그아웃 쪽(이미 세션이 있던 사용자)은 여전히 세션
 * 캐시를 읽어야 해 호출부 두 곳의 모양이 비대칭으로 갈린다. 대신(①) "이
 * 접두사로 시작하는 슬롯을 전부 지운다"로 단순화했다 — 이 브라우저에 남아
 * 있는 다른 사용자의 슬롯까지 함께 지워져도 무해하다(그 사용자가 다음에
 * 로그인하면 자기 슬롯을 처음부터 다시 쓴다), 그리고 로그인·로그아웃
 * 호출부 양쪽이 세션 캐시 상태와 무관하게 항상 정확하다.
 *
 * 대기 중인 디바운스 타이머만 취소한다 — 이미 날아간 GET(inFlight)은 그대로
 * 끝까지 간다(응답은 버려지고 캐시 invalidate만 일어날 뿐, 다음 계정에
 * 해를 주지 않는다. queryClient.clear()가 useLogout의 onSettled에서 그 뒤에
 * 캐시를 통째로 비우기도 한다).
 */
export function resetCalendarSyncState() {
  clearTimeout(debounceTimer)
  debounceTimer = null
  trailingRequested = false
  lastSyncAt = 0
  try {
    // localStorage.key(i)는 삭제할 때마다 뒤 인덱스가 앞으로 밀리므로, 뒤에서
    // 앞으로 순회해야 건너뛰는 키 없이 전부 지울 수 있다.
    for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
      const key = window.localStorage.key(i)
      if (key?.startsWith(STORAGE_KEY_PREFIX)) window.localStorage.removeItem(key)
    }
  } catch {
    // 메모리 값(lastSyncAt=0)만으로도 이 탭의 다음 진입 트리거는 즉시 동기화를
    // 실행한다 — localStorage가 막혀 있어도 정확성에 문제는 없다.
  }
}
