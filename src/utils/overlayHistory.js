import { getOverlayStackSnapshot, subscribeOverlayStack } from './overlayStack'

/*
  안드로이드 하드웨어 뒤로 가기로 오버레이를 닫기 위한 히스토리 브리지.

  왜 필요한가 — TWA 로 감싸면 안드로이드 뒤로 가기가 **브라우저 히스토리**에 매핑된다.
  다이얼로그·바텀시트가 히스토리에 아무 자취를 남기지 않으면, 뒤로 가기는 열려 있는
  오버레이를 무시하고 **이전 화면으로 가거나 앱을 종료**한다. 모바일에서 가장 먼저
  누르는 버튼이라 체감 결함이 크다.

  설계 — **오버레이가 하나라도 열려 있는 동안 우리 엔트리를 «정확히 하나» 유지**한다.
  인스턴스마다 엔트리를 쌓고 각자 되돌리는 방식(개수 세기)은 두 오버레이가 동시에 닫힐 때
  (예: 「나가기」 → 확인 다이얼로그와 편집 모달이 같은 동작으로 닫힘) 카운터가 어긋나기
  쉽고, 어긋나면 **필요 이상으로 뒤로 가서 화면·앱을 벗어난다.** 그 사고가 「뒤로 가기가
  한 번 먹히지 않는다」보다 훨씬 나쁘므로, 세지 않는 쪽을 택했다.

  전이표 (오버레이 스택 구독으로 구동)

  | 전이 | 하는 일 |
  |---|---|
  | 0 → 1개 이상 | 엔트리 하나 push |
  | 뒤로 가기(사용자) | 엔트리가 소비됨 → 최상단 오버레이가 닫힘 → 남아 있으면 새로 하나 push |
  | UI 로 닫아 0개 | 우리 엔트리가 현재면 back() 한 번 — 아래 "자기 back()" 참고 |
  | UI 로 닫아 1개 이상 | 엔트리가 이미 있으므로 아무것도 안 함 |

  자기(self-initiated) back() 이 "사용자 뒤로 가기"로 오인되는 사고 (owner
  버그 리포트, TUT-09 재실행 — 확인 → 킥오프가 0.1초 보였다가 사라지고
  건너뜀으로 저장됨) — 바로 위 "UI 로 닫아 0개" 의 back() 은 `history.back()`
  으로, 실제 트래버설은 매크로태스크로 미뤄진다. 그 사이 다른 비동기 작업
  (예: PATCH 성공의 프로미스 체인, 전부 마이크로태스크라 항상 이 매크로태스크
  보다 먼저 끝난다)이 새 오버레이를 열고 `navigate()`로 엔트리를 하나 더
  끼워 넣을 수 있다. 지연된 back() 이 그제서야 실제로 트래버설하면, 이미
  낡아 버린 위치로 이동하며 popstate 가 도착한다 — 이걸 보통의 "사용자가
  뒤로 가기를 눌렀다"로 해석하면 그 사이 새로 열린, 전혀 무관한 오버레이가
  (useOverlayBackButton 을 거쳐) 닫혀 버린다. `selfInitiatedBackPending`
  플래그가 이 오인을 막는다: back() 을 부르기 직전에 세워 두고, 전용
  popstate 리스너가 그다음 popstate 정확히 하나를 모든 Dialog/BottomSheet
  인스턴스의 `useOverlayBackButton` 리스너보다 먼저 `stopImmediatePropagation`
  으로 가로채 "오버레이를 닫지 않고" 소비한다 — 그 리스너들에게는 이벤트가
  도착한 적이 없는 것과 같다. 그 시점에 여전히 뭔가 열려 있으면
  `ensureOverlayEntry` 로 엔트리를 다시 확보해, 다음 진짜 뒤로 가기는 그
  오버레이를 정상적으로 닫는다. 플래그가 서 있지 않을 때 도착하는 popstate
  (진짜 하드웨어 뒤로 가기)는 이 체크를 그냥 지나쳐 각 인스턴스가 기존처럼
  처리한다 — 동시에 닫히는 두 오버레이, 라우트 이동 등 기존에 지켜지던
  경우는 그대로다(이 리스너는 "자기 back()" 하나만 추가로 가로챌 뿐, 그
  외의 경우는 즉시 return 한다).

  react-router 와의 공존 — 이 저장소는 데이터 라우터(`createBrowserRouter`)를 쓰고
  `useBlocker`(미저장 가드)가 걸려 있다. 그래서 두 가지를 지킨다.
  ① **같은 URL** 로만 push 한다 — 로케이션이 바뀌지 않으니 라우트 재평가·loader 재실행이
     없고(세션 가드 loader 가 매번 도는 일이 없다), 미저장 가드의 조건
     (`currentLocation.pathname !== nextLocation.pathname`)도 거짓이라 끼어들지 않는다.
  ② react-router 의 `idx` 를 **이어받아 1 증가**시킨다. 그쪽은 `history.state.idx` 로
     앞뒤를 계산하는데, 외부에서 그 필드를 빼고 push 하면 그 셈이 깨진다.
*/

const MARK = '__openplanOverlayEntry'

function hasWindow() {
  return typeof window !== 'undefined' && typeof window.history !== 'undefined'
}

function isOurEntry() {
  return Boolean(hasWindow() && window.history.state?.[MARK])
}

function pushEntry() {
  const current = window.history.state
  // 같은 URL(두 번째 인자 '', 세 번째 생략) + idx 승계 — 위 헤더 ①②.
  window.history.pushState(
    { ...(current ?? {}), idx: (current?.idx ?? 0) + 1, [MARK]: true },
    '',
  )
}

/**
 * 우리 엔트리가 없으면 하나 만든다(멱등).
 *
 * <p>브리지가 스택 전이로 알아서 관리하므로 보통은 부를 필요가 없다. 예외는 **닫을 수 없는
 * 오버레이**(onClose 없는 ConflictOverlay 류)다 — 뒤로 가기로 엔트리가 소비됐는데 아무것도
 * 닫히지 않으면 스택이 그대로여서 브리지가 깨어나지 않는다. 그 자리에서 다시 넣어
 * **뒤로 가기로 빠져나가지 못하게** 한다("선택만이 유일한 출구").
 */
export function ensureOverlayEntry() {
  if (!hasWindow()) return
  if (!isOurEntry()) pushEntry()
}

// true 인 동안 "우리가 스스로 부른 back()" 의 결과로 도착할 다음 popstate
// 하나를 기다리는 중이다 — 위 헤더의 "자기 back()" 단락 참고.
let selfInitiatedBackPending = false

/**
 * 전용 popstate 리스너 — 모든 Dialog/BottomSheet 의 `useOverlayBackButton`
 * 리스너보다 먼저 등록돼야 한다(아래 `installOverlayHistoryBridge` 에서,
 * 오버레이 스택 구독보다도 먼저 `addEventListener` 한다). 플래그가 서
 * 있지 않으면 즉시 return — 진짜 사용자 뒤로 가기는 손대지 않고 그대로
 * 각 인스턴스에게 전달한다.
 */
function onPossiblySelfInitiatedPopState(event) {
  if (!selfInitiatedBackPending) return
  selfInitiatedBackPending = false
  // 이 popstate 가 등록 순서상 더 뒤에 있는 모든 리스너(각 Dialog/BottomSheet
  // 의 useOverlayBackButton)에 도달하지 못하게 한다 — "소비하되 닫지 않는다"
  // 가 바로 이것이다. 이 이벤트가 전혀 발생한 적이 없는 것처럼 만든다.
  event.stopImmediatePropagation()
  // 우리 back() 과 이 popstate 가 실제로 도착하는 사이, 새 오버레이가 열렸을
  // 수 있다(TUT-09 가 바로 이 경우) — 열려 있는 게 있다면 엔트리를 다시
  // 확보해서, 다음 "진짜" 뒤로 가기가 여전히 그 오버레이를 닫게 한다.
  if (getOverlayStackSnapshot().length > 0) ensureOverlayEntry()
}

let installed = false

/** 한 번만 설치된다(여러 오버레이가 각자 불러도 안전). */
export function installOverlayHistoryBridge() {
  if (installed || !hasWindow()) return
  installed = true
  // 오버레이 스택 구독(아래)보다 먼저 등록한다 — 둘 다 결국 각 Dialog/
  // BottomSheet 인스턴스의 popstate 리스너보다 먼저 걸리기만 하면 되고,
  // 이 함수가 그 두 가지 등록을 전부 담당하는 유일한 지점이라 순서가
  // 저절로 보장된다.
  window.addEventListener('popstate', onPossiblySelfInitiatedPopState)
  subscribeOverlayStack(() => {
    const anyOpen = getOverlayStackSnapshot().length > 0
    if (anyOpen) {
      ensureOverlayEntry()
      return
    }
    // 전부 닫혔다 — UI 로 닫은 경우에만 우리 엔트리가 현재로 남아 있다.
    // 뒤로 가기로 닫혔으면 이미 소비됐고, 라우트 이동이면 현재 엔트리가 우리 것이 아니다.
    if (isOurEntry()) {
      // back() 자체는 비동기(매크로태스크)다 — 위 플래그를 반드시 호출
      // "직전"에 세워서, 이 사이 어떤 동기 코드도 끼어들 수 없게 한다.
      selfInitiatedBackPending = true
      window.history.back()
    }
  })
}
