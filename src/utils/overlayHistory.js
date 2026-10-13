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
  다음 네 가지를 모두 다시 검증하고, 하나라도 거짓이면 back()을 **포기**한다.
  - (억제) 호출부가 `suppressPendingSelfBack()`으로 "곧 이동한다"고 미리 알리지 않았는가
    (아래 "명시적 억제" 단락 참고 — PR 리뷰 S2)
  - 스택이 여전히 0인가 (재확인 자체의 전제)
  - 우리 엔트리가 여전히 현재 엔트리인가 (아니면 이미 다른 push/replace가 덮어썼다)
  - 예약 시점 이후 `location.href`가 안 바뀌었고, react-router가 navigation 중이
    아닌가 (`setNavigationStateGetter`로 주입된 상태 — 아래 참고)
  back()을 포기하면 우리 엔트리가 "이동으로 덮인 아래층"에 하나 남는 부작용이 생길 수
  있다 — 아래 "버려진 엔트리 건너뛰기" 단락 참고.

  명시적 억제 (owner 리뷰 S2, PLAUSIBLE) — 위 재검증은 "예약 시점 이후 바뀐 게 있는가"
  만 보는데, 호출부의 비동기 작업(실제 네트워크 요청 등)이 더블 rAF 재확인 창(수십ms)
  보다 오래 걸리면 재검증을 전부 통과한 뒤에야 그 작업이 끝나 navigate()가 도착한다 —
  즉 self-back()이 이미 불려 버린 뒤다. 이건 재확인 창을 늘리는 것으로 해결할 수
  없다(호출부마다, 매번 길이가 다르다). 그래서 "닫으면서 이동할 것"을 아는 호출부가
  **직접** `suppressPendingSelfBack()`을 navigate() 바로 앞에서 불러 알린다 — 다음
  재확인(아직 실행되지 않았다면)이 back()을 포기하게 만든다. 이미 self-back()이
  불려서 popstate가 날아가는 중이라면 이 호출로도 그 트래버설 자체를 물릴 수는
  없다(알려진 한계 — 호출부가 오버레이를 닫는 상태 갱신보다 먼저 이 함수를 부르게 하면
  재확인이 아직 스케줄조차 되지 않은 시점이라 실제로는 발생하지 않는다. 실제 호출부
  배선은 그 파일들 자신의 주석 참고).

  자기(self-initiated) back()과 사용자 back() 구분, idx 기반 (Thomas 리뷰 사고 1,
  PR 리뷰 B1 교정) — 위 self-back()은 `history.back()`으로, 실제 트래버설은
  매크로태스크로 한 번 더 미뤄진다. 그 사이 다른 오버레이가 열릴 수 있으므로, 그
  popstate가 도착했을 때 "지금 열려 있는 (전혀 무관한) 오버레이의 사용자 뒤로 가기"로
  오인해서는 안 된다.

  [B1, 리뷰 교정] 처음 버전은 불리언 대신 카운터(`pendingSelfBackCount`)를 썼지만,
  그 카운터를 **소비(−1)하는 쪽이 `useOverlayBackButton`뿐**이었다 — 그 리스너는
  오버레이가 열려 있을 때만 붙는다. self-back()은 정의상 **스택이 0일 때만** 불리므로
  그 결과로 도착하는 popstate를 소비할 인스턴스 리스너가 하나도 없고, 카운터가 UI로
  닫을 때마다 영구히 쌓였다 — 다음에 진짜 뒤로 가기로 다른 다이얼로그를 닫으려 하면
  그 카운터가 남아 있어 "이것도 self-back이다"로 오판정, 닫히지 않는 사고(사고 1의
  역방향)가 재도입됐다.

  고친 설계는 **카운터를 전혀 세지 않는다.** self-back()을 부르기 "직전"에 "이 back()이
  도착할 것으로 기대하는 엔트리의 `idx`"(= 현재 `history.state.idx − 1`, back()은
  항상 한 칸만 움직인다)를 `pendingSelfBackTargets`(idx → 기록 시각)에 기록해 둔다.
  **판정과 소비는 전용 인스턴스가 아니라, 이 모듈이 설치하는 상시 전역 popstate
  리스너가 모든 popstate에 대해** 수행한다 — 도착한 `event.state.idx`가 그 Map에
  있으면 self-initiated로 판정하고 그 즉시 Map에서 지운다(소비). 그 결과를 이벤트
  객체 자신에게 캐시해 두고, `isSelfInitiatedPopstate(event)`는 **그 캐시를 읽기만**
  한다 — 오버레이가 열려 있는지와 전혀 무관하게 항상 소비되므로 더는 새지 않는다.

  만료 — 기대한 popstate가 영영 오지 않을 수도 있다(탭이 백그라운드로 가서 트래버설이
  지연되거나, 그 사이 사용자가 다른 이동을 해서 이 idx 자체가 다시는 안 쓰이는 경우).
  기록을 영구히 들고 있으면, 나중에 idx가 재사용되는 완전히 무관한 트래버설을 잘못
  self-initiated로 판정할 수 있다. 그래서 각 기록에 타임스탬프를 같이 두고
  (`SELF_BACK_EXPIRY_MS`, 5초), 그 시간 안에 도착하지 않은 기록은 (소비 시점에) 만료된
  것으로 보고 무시한다 — `history.back()`의 실제 트래버설은 보통 한 매크로태스크
  안에 끝나므로 5초는 아주 넉넉한 여유다.

  소비 판정은 `stopImmediatePropagation`에 기대지 않는다 — 리스너 등록 순서에만 의존하면
  이 브리지보다 **먼저** 등록된 리스너(예: react-router 자신의 popstate 리스너는 모듈
  로드 시점에 이미 걸려 있다)는 어차피 막을 수 없고, 그걸 막겠다고 기대하는 설계는
  깨지기 쉽다. 대신 조회 함수를 두고 각 `useOverlayBackButton` 인스턴스가 캐시된 답만
  읽는다 — 리스너 등록 순서와 무관하게 전부 같은 답을 받는다(위 단락).

  버려진 엔트리 건너뛰기, 방향 인지 (owner 리뷰 S1 교정) — "닫기와 이동의 경합"에서
  back()을 포기하면, 우리 엔트리(마지막 오버레이가 열렸던 URL)가 그 뒤에 이어진 진짜
  이동이 쌓아 올린 엔트리 **아래**에 그대로 남는다. 사용자가 나중에 거기까지 **뒤로**
  가면, 아무 오버레이도 없는데 "방금 봤던 그 화면"이 한 번 더 보이는 셈이다 — 틀린
  것은 아니지만 쓸모없는 한 단계라, 상시 전역 리스너가 "방금 도착한 엔트리가 우리
  마커이고 스택이 비어 있다"를 보면 한 번 더 `history.back()`해서 건너뛴다.

  [S1, 리뷰 교정] 처음 버전은 이동 방향을 보지 않고 "마커 + 스택 0"이면 무조건
  건너뛰었다 — 그런데 사용자가 뒤로 여러 번 가서 이 마커를 지나친 뒤 **앞으로**
  돌아와 이 마커에 다시 도착하는 경로도 같은 조건을 만족해, forward 의도를 거슬러 또
  back()을 불러 버렸다. 고친 버전은 매 popstate마다 `lastKnownIdx`(마지막으로 확인한
  현재 idx)와 이번 `event.state.idx`를 비교해 **더 작아졌을 때(= 뒤로 이동해서
  도착했을 때)만** 건너뛴다. 앞으로 이동해서 도착했다면 그대로 둔다 — 마커 엔트리에
  머물러도(스택이 비어 있으니 어떤 오버레이도 안 보인다) 무해하므로, forward()로
  한 번 더 트래버설을 일으키는 복잡함을 피하는 쪽을 택했다.

  react-router 와의 공존 — 이 저장소는 데이터 라우터(`createBrowserRouter`)를 쓰고
  `useBlocker`(미저장 가드)가 걸려 있다. 그래서 두 가지를 지킨다.
  ① **같은 URL** 로만 push 한다 — 로케이션이 바뀌지 않으니 라우트 재평가·loader 재실행이
     없고(세션 가드 loader 가 매번 도는 일이 없다), 미저장 가드의 조건
     (`currentLocation.pathname !== nextLocation.pathname`)도 거짓이라 끼어들지 않는다.
  ② react-router 의 `idx` 를 **이어받아 1 증가**시킨다. 그쪽은 `history.state.idx` 로
     앞뒤를 계산하는데, 외부에서 그 필드를 빼고 push 하면 그 셈이 깨진다. 이 모듈 자신의
     self-back 판정(위)도 이제 이 같은 `idx` 를 식별자로 재사용한다.
  ③ `router.state.navigation.state` (진행 중인 navigate() 여부)를 읽어야 하지만, 이
     모듈이 `app/router.js`를 직접 import 하면 순환(router.js → 페이지들 →
     Dialog/BottomSheet → useOverlayBackButton → 이 모듈)이 생긴다. 그래서 정적
     import 대신 `setNavigationStateGetter`로 **주입**받는다 — router.js가 자기
     router 인스턴스를 만든 뒤 한 줄로 이 모듈에 등록해 준다(그 파일 자신의 주석 참고).

  HMR (dev 전용) — 이 모듈의 `installed` 가드와 전역 `popstate` 리스너는 모듈 전체가
  다시 평가되는 걸 전제한다. Vite HMR로 이 파일(또는 이 파일을 참조하는 체인)이
  하나라도 바뀌면 **새 모듈 인스턴스**가 만들어지는데, 예전 인스턴스가 걸어 둔
  `window` 리스너·스택 구독은 아무도 정리해 주지 않아 쌓인다(새로고침 없이 이 파일을
  여러 번 고치며 저장하면 popstate 하나에 리스너가 여러 번 불리는 사고로 이어진다).
  `import.meta.hot.dispose`로 정리한다 — 프로덕션 빌드에는 `import.meta.hot`이 없으므로
  이 블록 자체가 트리셰이킹된다.
*/

const MARK = '__openplanOverlayEntry'

function hasWindow() {
  return typeof window !== 'undefined' && typeof window.history !== 'undefined'
}

function isOurEntry() {
  return Boolean(hasWindow() && window.history.state?.[MARK])
}

// 마지막으로 확인한 "현재" idx — S1의 방향 판정(뒤로/앞으로)에 쓴다. popstate뿐 아니라
// 우리가 직접 pushState 하는 pushEntry()도 매번 갱신한다(그래야 바로 다음 popstate의
// 방향 비교 기준이 최신 상태를 가리킨다). install 시점에 한 번 현재 idx로 맞춘다.
let lastKnownIdx = null

function pushEntry() {
  const current = window.history.state
  const idx = (current?.idx ?? 0) + 1
  // 같은 URL(두 번째 인자 '', 세 번째 생략) + idx 승계 — 위 헤더 ①②.
  window.history.pushState({ ...(current ?? {}), idx, [MARK]: true }, '')
  lastKnownIdx = idx
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

// ---- 자기 back() 추적, idx 기반 (설계 헤더 "자기(self-initiated) back()..." 단락) ----

// self-back()이 도착할 것으로 기대하는 idx → 기록 시각(ms). 판정·소비는 전역 popstate
// 리스너(handleGlobalPopstate)만 한다 — 그래야 오버레이가 열려 있는지와 무관하게 항상
// 소비되어 B1(카운터 누수)이 재발하지 않는다.
const pendingSelfBackTargets = new Map()

// 기대한 popstate가 이 시간 안에 오지 않으면 만료된 것으로 보고 무시한다(위 헤더 "만료"
// 단락) — idx 재사용으로 인한 오판정을 막기 위한 안전장치.
const SELF_BACK_EXPIRY_MS = 5000

// 이벤트 객체 자신에게 판정을 캐시하는 키 — 여러 `useOverlayBackButton` 인스턴스가
// 같은 popstate 이벤트를 각자 들어도 전부 같은 답을 받게 하기 위함(위 헤더 참고).
const SELF_INITIATED_FLAG = '__openplanSelfInitiatedPopstate'

/** self-back()을 부르기 "직전"에 호출 — 그 결과로 도착할 것으로 기대하는 엔트리의
 * idx(현재 idx − 1, back()은 항상 한 칸만 움직인다)를 기록한다. */
function recordExpectedSelfBackTarget() {
  const fromIdx = window.history.state?.idx ?? 0
  pendingSelfBackTargets.set(fromIdx - 1, Date.now())
}

/**
 * 이 popstate가 우리가 스스로 부른 `history.back()`의 결과인가(사용자가 누른 것이
 * 아니라)? 판정 자체는 하지 않는다 — `handleGlobalPopstate`(상시 전역 리스너)가 모든
 * popstate에 대해 이미 내려 이벤트 자신에게 캐시해 둔 값을 읽기만 한다. 그 리스너가
 * `useOverlayBackButton`의 리스너보다 항상 먼저 걸리므로(설치 시점 보장, 이 파일
 * `installOverlayHistoryBridge` 참고) 캐시는 호출 시점에 이미 존재한다.
 */
export function isSelfInitiatedPopstate(event) {
  if (!event) return false
  return event[SELF_INITIATED_FLAG] === true
}

// ---- 명시적 억제 (설계 헤더 "명시적 억제" 단락, owner 리뷰 S2) ----

// 호출부가 "곧 이동한다"고 알려온 시각(ms) — null이면 억제 중이 아니다.
let selfBackSuppressedAt = null

// 호출부가 suppressPendingSelfBack()을 불러 놓고 실제로는 (어떤 이유로든) 재확인이
// 한참 뒤에야 실행되는 경우를 대비한 상한선 — 더블 rAF 재확인 창(수십ms)보다 훨씬
// 넉넉하게 잡아, 정상 경로에서는 절대 걸리지 않게 한다.
const SELF_BACK_SUPPRESS_TTL_MS = 2000

/**
 * 계약: **실제로 오버레이 스택에 등록된(Dialog/BottomSheet) 오버레이를 닫으면서,
 * 그 결과로 반드시 다른 화면으로 이동할** 호출부만, 그 navigate() 바로 앞에서 불러야
 * 한다 — "곧 이동할 테니, 지연 재확인이 (아직 실행되지 않았다면) self-back()을
 * 포기하게" 알리는 신호다.
 *
 * 이 플래그는 **오버레이 단위가 아니라 모듈 전역**이고 TTL(`SELF_BACK_SUPPRESS_TTL_MS`,
 * 2초) 동안 유지된다 — 그래서 위 계약의 두 조건을 둘 다 반드시 지켜야 한다(Thomas
 * 재리뷰 S2-a/S2-b로 드러난 사고):
 * - **오버레이 스택에 등록되지 않은 UI**(예: 데스크톱의 비모달 드롭다운처럼
 *   `useOverlayBackButton`을 쓰지 않는 패널)를 닫으며 부르면, 그 TTL 창 안에 실제로
 *   "닫아서 self-back이 필요한" **전혀 무관한 다른** 오버레이가 하나라도 닫히면 그
 *   self-back까지 이 호출이 빼앗아 버린다 — "호출해도 무해하다"는 가정은 틀렸다.
 *   호출부가 데스크톱/모바일처럼 셸에 따라 오버레이 등록 여부가 달라진다면(예:
 *   `NotificationBell.jsx`), 실제로 모달로 열렸는지를 가리는 값(`isDesktop` 등)으로
 *   직접 가드해야 한다.
 * - **이동이 실제로 일어나는 경로에서만** 불러야 한다 — 조건부 navigate()(예:
 *   `if (notification.routePath) navigate(...)`) 앞이 아니라 **그 조건 블록 안**,
 *   navigate() 바로 앞에서 불러야 한다. 이동이 끝내 일어나지 않는데도 미리 불러
 *   버리면 역시 같은 방식으로 무관한 self-back을 억제한다.
 *
 * 실제 사용 예시는 `SettingsAccountPage.jsx`(로그아웃)·`SessionExpiredOverlay.jsx`
 * (재로그인)·`useTutorialRestart.jsx`(재시작 확인)·`NotificationBell.jsx`(알림
 * 클릭/설정 이동, 모바일 한정) 등 이 파일을 호출하는 쪽의 주석을 참고. 앞으로 "닫고
 * 이동"하는 새 호출부(예: #78 튜토리얼 개편이 추가할 코치마크 종료 흐름)를 만들 때도
 * 위 계약(실제로 등록된 오버레이 + 이동이 반드시 일어나는 지점)을 지키며, 오버레이를
 * 닫는 상태 갱신 직후·navigate() 직전에서 이 함수를 부르면 된다.
 */
export function suppressPendingSelfBack() {
  selfBackSuppressedAt = Date.now()
}

/** 억제 플래그를 한 번 읽고 리셋한다(소비) — 다음 닫기에는 다시 걸리지 않는다. */
function consumeSelfBackSuppression() {
  if (selfBackSuppressedAt == null) return false
  const withinTtl = Date.now() - selfBackSuppressedAt <= SELF_BACK_SUPPRESS_TTL_MS
  selfBackSuppressedAt = null
  return withinTtl
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
    if (consumeSelfBackSuppression()) return // 호출부가 "곧 이동한다"고 미리 알렸다 — S2
    if (getOverlayStackSnapshot().length > 0) return // StrictMode 재마운트·즉시 재오픈 — 애초에 안 닫혔다
    if (!isOurEntry()) return // 이미 다른 push/replace가 우리 엔트리를 덮었다
    if (window.location.href !== hrefAtSchedule) return // 이동이 이미 커밋됐다
    if (isNavigationInFlight()) return // 이동이 지금 진행 중이다 — 커밋이 이겨야 한다
    recordExpectedSelfBackTarget()
    window.history.back()
  })
}

// ---- 상시 전역 popstate 리스너 — self-initiated 판정·소비 + 버려진 엔트리 skip ----
// (설계 헤더 "idx 기반"·"버려진 엔트리 건너뛰기, 방향 인지" 단락)

function handleGlobalPopstate(event) {
  const idx = event.state?.idx
  const recordedAt = typeof idx === 'number' ? pendingSelfBackTargets.get(idx) : undefined
  // 기록은 찾는 즉시 지운다(소비) — 만료돼서 무시하는 경우도 다시 쓸 일이 없으므로
  // 똑같이 지운다(위 헤더 "만료" 참고).
  if (recordedAt !== undefined) pendingSelfBackTargets.delete(idx)
  const selfInitiated = recordedAt !== undefined && Date.now() - recordedAt <= SELF_BACK_EXPIRY_MS
  // non-enumerable — 네이티브 Event를 순회·직렬화하는 다른 코드(devtools 등)가
  // 우리만의 부기용 필드를 보지 않게 한다.
  Object.defineProperty(event, SELF_INITIATED_FLAG, { value: selfInitiated })

  // 버려진 엔트리 건너뛰기 — "뒤로 이동해서"(idx가 작아져서) 우리 마커에 도착했고,
  // 그 시점에 열린 오버레이가 하나도 없을 때만. 앞으로 이동해서 도착한 경우(S1)는
  // 그대로 둔다 — 마커 엔트리에 머물러도 무해하다(위 헤더 참고).
  const movedBackward = typeof idx === 'number' && typeof lastKnownIdx === 'number' && idx < lastKnownIdx
  if (event.state?.[MARK] && movedBackward && getOverlayStackSnapshot().length === 0) {
    recordExpectedSelfBackTarget()
    window.history.back()
  }

  if (typeof idx === 'number') lastKnownIdx = idx
}

let installed = false
let stackUnsubscribe = null

/** 한 번만 설치된다(여러 오버레이가 각자 불러도 안전). */
export function installOverlayHistoryBridge() {
  if (installed || !hasWindow()) return
  installed = true
  lastKnownIdx = window.history.state?.idx ?? 0
  window.addEventListener('popstate', handleGlobalPopstate)
  stackUnsubscribe = subscribeOverlayStack(() => {
    const anyOpen = getOverlayStackSnapshot().length > 0
    if (anyOpen) {
      ensureOverlayEntry()
      return
    }
    // 전부 닫혔다 — 즉시 믿지 않고 두 프레임 뒤에 다시 확인한다(설계 헤더 참고).
    scheduleEmptyStackRecheck()
  })
}

// dev 전용 HMR 정리 (설계 헤더 "HMR" 단락, N1) — 이 모듈이 다시 평가되기 전에 이전
// 인스턴스가 걸어 둔 전역 리스너·구독을 반드시 떼어 낸다. 프로덕션 빌드에는
// `import.meta.hot`이 없어 이 블록 전체가 번들에서 빠진다(데드코드 제거).
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (hasWindow()) window.removeEventListener('popstate', handleGlobalPopstate)
    stackUnsubscribe?.()
    stackUnsubscribe = null
    installed = false
    lastKnownIdx = null
    pendingSelfBackTargets.clear()
    selfBackSuppressedAt = null
    emptyStackRecheckScheduled = false
  })
}
