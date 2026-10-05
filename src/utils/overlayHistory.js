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
  | 뒤로 가기 | 엔트리가 소비됨 → 최상단 오버레이가 닫힘 → 남아 있으면 새로 하나 push |
  | UI 로 닫아 0개 | 우리 엔트리가 현재면 back() 한 번 |
  | UI 로 닫아 1개 이상 | 엔트리가 이미 있으므로 아무것도 안 함 |

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

let installed = false

/** 한 번만 설치된다(여러 오버레이가 각자 불러도 안전). */
export function installOverlayHistoryBridge() {
  if (installed || !hasWindow()) return
  installed = true
  subscribeOverlayStack(() => {
    const anyOpen = getOverlayStackSnapshot().length > 0
    if (anyOpen) {
      ensureOverlayEntry()
      return
    }
    // 전부 닫혔다 — UI 로 닫은 경우에만 우리 엔트리가 현재로 남아 있다.
    // 뒤로 가기로 닫혔으면 이미 소비됐고, 라우트 이동이면 현재 엔트리가 우리 것이 아니다.
    if (isOurEntry()) window.history.back()
  })
}
