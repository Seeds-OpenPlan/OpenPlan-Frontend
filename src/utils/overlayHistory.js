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
  | 0 → 1개 이상 | 엔트리 하나 push (이미 있으면 멱등, no-op) |
  | 뒤로 가기(사용자) | 엔트리가 소비됨 → 최상단 오버레이가 닫힘 → 남아 있으면 새로 하나 push |
  | UI 로 닫아 0개 | **두 프레임 뒤에 다시 확인**해서 그래도 0개 + 우리 엔트리가 아직 현재 +
  |               | 이동이 끼어들지 않았을 때만 back() 한 번 — 아래 "스택 0 판정 지연" 참고 |
  | UI 로 닫아 1개 이상 | 엔트리가 이미 있으므로 아무것도 안 함 |

  스택 0 판정 지연 (owner 리드 결정, Thomas 리뷰가 지목한 두 가지 사고를 원인에서
  제거) — "스택이 0이 됐다"를 그 자리에서 믿고 즉시 back() 하면 두 가지가 사고를 낸다.

  1. **StrictMode 스퓨리어스 back().** `{open && <Dialog/>}` 패턴은 dev StrictMode에서
     push → (시뮬레이션) 언마운트 pop → 재마운트 push가 **같은 동기 커밋 안에서** 일어난다.
     실제로는 닫힌 적이 없는데도 그 순간의 "0"을 보고 back()을 예약해 버린다.
  2. **닫고 바로 다시 열기.** 한 오버레이를 닫고 다른 오버레이를 여는 동작(예: 확인
     다이얼로그의 onConfirm이 결과 다이얼로그를 띔)도 똑같이 한순간 스택이 0을 거친다.

  두 경우 모두 **사용자 입장에서는 아무것도 닫힌 적이 없다** — 그래서 이 모듈은 "0개"를
  본 즉시 행동하지 않고, 두 번의 `requestAnimationFrame` 뒤(= 적어도 한 프레임 전체가
  지난 뒤)에 다시 확인한다. `queueMicrotask`나 `setTimeout(0)`보다 이쪽을 택한 이유는
  React가 passive effect를 플러시하는 타이밍이 마이크로태스크 큐보다 늦게 끼어들 수도
  있다는 불확실성을 없애기 위함이다 — 애니메이션 프레임을 통째로 하나 더 기다리면
  그 안에서 끝나는 어떤 동기·마이크로태스크 체인도 전부 흡수된다. 다이얼로그 자체는
  React state로 즉시 사라지므로(이 지연은 **히스토리 엔트리**에만 적용된다) 사용자가
  체감하는 지연은 없다.

  닫기와 이동의 경합 (Thomas 리뷰 사고 3) — 다이얼로그를 닫는 것과 다른 pathname으로
  `navigate()`하는 것이 겹치면(예: 로그아웃의 "닫고 이동", TUT-09의 "닫고 PATCH 성공
  뒤 이동"), 지연 없이 즉시 self-back()을 부르면 **같은 URL**로 push해 둔 우리 엔트리를
  그 back()이 먼저 소비해 버려서 진짜 이동이 되돌려진다. 그래서 지연된 재확인 시점에
  다음 세 가지를 모두 다시 검증하고, 하나라도 거짓이면 back()을 **포기**한다.
  - 스택이 여전히 0인가 (재확인 자체의 전제)
  - 우리 엔트리가 여전히 현재 엔트리인가 (아니면 이미 다른 push/replace가 덮어썼다)
  - 예약 시점 이후 `location.href`가 안 바뀌었고, react-router가 navigation 중이
    아닌가 (`setNavigationStateGetter`로 주입된 상태 — 아래 참고)
  back()을 포기하면 우리 엔트리가 "이동으로 덮인 아래층"에 하나 남는 부작용이 생길 수
  있다 — 아래 "버려진 엔트리 건너뛰기" 단락 참고.

  자기(self-initiated) back()과 사용자 back() 구분 (Thomas 리뷰 사고 1) — 위 back()은
  `history.back()`으로, 실제 트래버설은 매크로태스크로 한 번 더 미뤄진다. 그 사이 다른
  오버레이가 열릴 수 있으므로, 그 popstate가 도착했을 때 "지금 열려 있는 (전혀 무관한)
  오버레이의 사용자 뒤로 가기"로 오인해서는 안 된다. 불리언 플래그 하나로는 부족하다 —
  back() 호출이 겹치면(두 번째 self-back이 아직 플래그를 세우기 전에 첫 번째 popstate가
  플래그를 꺼버리는 경우) 두 번째 popstate가 그대로 통과해 버린다. 대신 **카운터**
  (`pendingSelfBackCount`)로 센다: self-back()을 부를 때마다 +1, 그 결과로 도착하는
  popstate를 소비할 때마다 -1 — `history.back()` 호출이 겹쳐도 각자의 popstate가
  브라우저에 **요청한 순서대로(FIFO)** 도착하므로 카운터가 어긋나지 않는다.

  소비 판정은 `stopImmediatePropagation`에 기대지 않는다 — 리스너 등록 순서에만 의존하면
  이 브리지보다 **먼저** 등록된 리스너(예: react-router 자신의 popstate 리스너는 모듈
  로드 시점에 이미 걸려 있다)는 어차피 막을 수 없고, 그걸 막겠다고 기대하는 설계는
  깨지기 쉽다. 대신 `isSelfInitiatedPopstate(event)`라는 **조회 함수**를 두고, 각
  `useOverlayBackButton` 인스턴스가 popstate를 받을 때마다 그 함수에 물어본다 — 같은
  이벤트에 대해 처음 묻는 쪽이 카운터를 소비하고 답을 그 이벤트 객체 자신에게 캐시해
  두므로, 여러 인스턴스가 같은 이벤트를 각자 들어도(리스너 등록 순서와 무관하게) 전부
  같은 답을 받는다.

  버려진 엔트리 건너뛰기 — "닫기와 이동의 경합"에서 back()을 포기하면, 우리 엔트리(마지막
  오버레이가 열렸던 URL)가 그 뒤에 이어진 진짜 이동이 쌓아 올린 엔트리 **아래**에 그대로
  남는다. 사용자가 나중에 거기까지 뒤로 가면, 아무 오버레이도 없는데 "방금 봤던 그
  화면"이 한 번 더 보이는 셈이다 — 틀린 것은 아니지만 쓸모없는 한 단계다. 그래서 이
  모듈이 설치하는 상시 popstate 리스너가 "방금 도착한 엔트리가 우리 마커이고 스택이
  비어 있다"를 보면 투명하게 한 번 더 `history.back()`해서 건너뛴다(그 시점엔 열린
  오버레이가 없으므로 어떤 `useOverlayBackButton` 리스너도 이걸 사용자 뒤로 가기로 오인할
  기회조차 없다 — 애초에 아무도 듣고 있지 않다).

  react-router 와의 공존 — 이 저장소는 데이터 라우터(`createBrowserRouter`)를 쓰고
  `useBlocker`(미저장 가드)가 걸려 있다. 그래서 두 가지를 지킨다.
  ① **같은 URL** 로만 push 한다 — 로케이션이 바뀌지 않으니 라우트 재평가·loader 재실행이
     없고(세션 가드 loader 가 매번 도는 일이 없다), 미저장 가드의 조건
     (`currentLocation.pathname !== nextLocation.pathname`)도 거짓이라 끼어들지 않는다.
  ② react-router 의 `idx` 를 **이어받아 1 증가**시킨다. 그쪽은 `history.state.idx` 로
     앞뒤를 계산하는데, 외부에서 그 필드를 빼고 push 하면 그 셈이 깨진다.
  ③ `router.state.navigation.state` (진행 중인 navigate() 여부)를 읽어야 하지만, 이
     모듈이 `app/router.js`를 직접 import 하면 순환(router.js → 페이지들 →
     Dialog/BottomSheet → useOverlayBackButton → 이 모듈)이 생긴다. 그래서 정적
     import 대신 `setNavigationStateGetter`로 **주입**받는다 — router.js가 자기
     router 인스턴스를 만든 뒤 한 줄로 이 모듈에 등록해 준다(그 파일 자신의 주석 참고).
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

// ---- 자기 back() 추적 (설계 헤더 "자기(self-initiated) back()" 단락) ----

// self-back()을 부를 때마다 +1, 그 결과로 도착한 popstate를 소비할 때마다 -1.
// 불리언이 아니라 카운터인 이유는 위 헤더에 있다(back() 호출이 겹치는 경우).
let pendingSelfBackCount = 0

// 이벤트 객체 자신에게 판정을 캐시하는 키 — 여러 `useOverlayBackButton` 인스턴스가
// 같은 popstate 이벤트를 각자 들어도 전부 같은 답을 받게 하기 위함(위 헤더 참고).
const SELF_INITIATED_FLAG = '__openplanSelfInitiatedPopstate'

/**
 * 이 popstate가 우리가 스스로 부른 `history.back()`의 결과인가(사용자가 누른 것이
 * 아니라)? 같은 이벤트에 대한 첫 호출만 카운터를 소비하고, 그 답을 이벤트 자신에게
 * 캐시한다 — 이후 같은 이벤트에 대한 호출은(다른 오버레이 인스턴스가 물어도) 캐시된
 * 답을 그대로 돌려준다.
 */
export function isSelfInitiatedPopstate(event) {
  if (!event) return false
  if (SELF_INITIATED_FLAG in event) return event[SELF_INITIATED_FLAG]
  const result = pendingSelfBackCount > 0
  if (result) pendingSelfBackCount -= 1
  // non-enumerable — 네이티브 Event를 순회·직렬화하는 다른 코드(devtools 등)가
  // 우리만의 부기용 필드를 보지 않게 한다.
  Object.defineProperty(event, SELF_INITIATED_FLAG, { value: result })
  return result
}

// ---- react-router navigation 상태 주입 (설계 헤더 ③) ----

// 기본값 'idle' — 아직 주입되지 않은 상태(예: 이 모듈만 단독으로 쓰는 테스트)에서도
// "이동 중이 아니다"로 안전하게 동작하게 한다.
let getNavigationState = () => 'idle'

/**
 * router.js가 자기 router 인스턴스를 만든 뒤 한 번 호출해 연결한다 — 정적 import로
 * 순환을 만들지 않기 위한 의존성 주입(설계 헤더 ③, router.js 자신의 호출부 주석도
 * 참고).
 */
export function setNavigationStateGetter(getter) {
  getNavigationState = getter
}

function isNavigationInFlight() {
  return getNavigationState() !== 'idle'
}

// ---- 스택 0 판정 지연 (설계 헤더 "스택 0 판정 지연"·"닫기와 이동의 경합") ----

function afterNextTwoFrames(callback) {
  // 더블 rAF — 왜 queueMicrotask/setTimeout(0)이 아니라 이쪽인지는 파일 헤더 참고.
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => window.requestAnimationFrame(callback))
    return
  }
  // rAF가 없는 환경(헤드리스 테스트 러너 등) 대비 — 매크로태스크 두 번이 가장 가까운
  // 동급(지금까지 큐에 쌓인 건 전부 비운다는 보장).
  setTimeout(() => setTimeout(callback, 0), 0)
}

// 중복 예약 방지 — 이미 하나 기다리는 중이면 또 예약하지 않는다(실행 시점에 항상
// "그 순간의" 스택/위치를 다시 읽으므로, 그사이 몇 번을 더 열고 닫았는지는 중요하지
// 않다).
let emptyStackRecheckScheduled = false

function scheduleEmptyStackRecheck() {
  if (emptyStackRecheckScheduled) return
  emptyStackRecheckScheduled = true
  // 예약 시점의 URL — 재확인 시점에 바뀌어 있으면 그 사이 진짜 이동이 끼어든
  // 것이다(아래 재검증 참고).
  const hrefAtSchedule = window.location.href
  afterNextTwoFrames(() => {
    emptyStackRecheckScheduled = false
    if (getOverlayStackSnapshot().length > 0) return // StrictMode 재마운트·즉시 재오픈 — 애초에 안 닫혔다
    if (!isOurEntry()) return // 이미 다른 push/replace가 우리 엔트리를 덮었다
    if (window.location.href !== hrefAtSchedule) return // 이동이 이미 커밋됐다
    if (isNavigationInFlight()) return // 이동이 지금 진행 중이다 — 커밋이 이겨야 한다
    pendingSelfBackCount += 1
    window.history.back()
  })
}

let installed = false

/** 한 번만 설치된다(여러 오버레이가 각자 불러도 안전). */
export function installOverlayHistoryBridge() {
  if (installed || !hasWindow()) return
  installed = true

  // 버려진 엔트리 건너뛰기(설계 헤더 참고) — 특정 오버레이 인스턴스에 속하지 않는
  // 상시 리스너다. "이동이 self-back을 이겨서 우리 엔트리가 아래층에 남는" 경우에만
  // 발동한다 — 그 외에는 도착한 엔트리가 우리 마커를 들고 있을 일이 없다(마커 엔트리는
  // 항상 실제 엔트리 바로 위에 하나만 존재하고, 정상적인 self-back/사용자 back은 전부
  // 그 "실제 엔트리"로 내려가지 마커로 "올라가지" 않는다).
  window.addEventListener('popstate', (event) => {
    if (event.state?.[MARK] && getOverlayStackSnapshot().length === 0) {
      pendingSelfBackCount += 1
      window.history.back()
    }
  })

  subscribeOverlayStack(() => {
    const anyOpen = getOverlayStackSnapshot().length > 0
    if (anyOpen) {
      ensureOverlayEntry()
      return
    }
    // 전부 닫혔다 — 즉시 믿지 않고 두 프레임 뒤에 다시 확인한다(설계 헤더 참고).
    scheduleEmptyStackRecheck()
  })
}
