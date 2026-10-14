import { useEffect } from 'react'
import { isTopmostOverlay } from '../utils/overlayStack'
import {
  ensureOverlayEntry,
  installOverlayHistoryBridge,
  isSelfInitiatedPopstate,
} from '../utils/overlayHistory'

/*
  안드로이드 뒤로 가기 → 최상단 오버레이 닫기.

  Esc 처리와 **같은 규칙**을 따른다(Dialog.jsx 헤더 참고) — 열려 있는 동안 모든 인스턴스가
  듣지만, `isTopmostOverlay` 인 하나만 반응하고, 실제로 닫는 것은 `onClose` 가 있을 때만이다.
  히스토리 엔트리 자체는 이 훅이 만들지 않는다(utils/overlayHistory.js 의 브리지가 스택
  전이로 관리한다) — 인스턴스마다 쌓으면 동시에 닫힐 때 어긋난다.

  `onCloseRef` 를 받는 이유도 Esc 쪽과 같다: 호출부가 매 렌더 새 화살표 함수를 넘기므로,
  ref 로 받아야 이 effect 의 deps 가 `[open, overlayId]` 로 안정된다.

  자기(self-initiated) back() 무시 — 브리지가 마지막 오버레이를 UI로 닫을 때 스스로
  `history.back()`을 부르는 경우가 있다(overlayHistory.js 헤더의 "스택 0 판정 지연"
  참고). 그 popstate가 이 리스너에 도착했을 때 "사용자가 뒤로 가기를 눌렀다"로 오인하면
  전혀 무관하게 그 사이 열린 다른 오버레이를 닫아 버린다 — `isSelfInitiatedPopstate`가
  바로 그 구분이다. 판정 자체(idx 매칭·소비)는 이 훅이 아니라 overlayHistory.js의 상시
  전역 리스너가 **오버레이가 열려 있는지와 무관하게 모든 popstate**에 대해 내린다
  (PR 리뷰 B1 — 예전에는 이 훅의 리스너가 판정을 "소비"했는데, 그 리스너는 오버레이가
  열려 있을 때만 붙어 있어서 스택이 0일 때 도착하는 self-back popstate를 아무도 소비하지
  못해 판정이 영구히 샜다). 이 훅은 그 전역 리스너가 이벤트 자신에게 캐시해 둔 답을
  **읽기만** 한다 — 리스너 등록 순서와 무관하게 항상 같은 답을 받는다(그 파일 자신의
  헤더가 `stopImmediatePropagation` 대신 이 방식을 택한 이유도 설명한다).
*/
export function useOverlayBackButton(overlayId, open, onCloseRef) {
  useEffect(() => {
    if (!open) return undefined
    installOverlayHistoryBridge()

    const onPopState = (event) => {
      if (isSelfInitiatedPopstate(event)) return // 우리 자신의 back() — 사용자 제스처가 아니다
      if (!isTopmostOverlay(overlayId)) return
      if (!onCloseRef.current) {
        // 닫을 수 없는 오버레이 — 소비된 엔트리를 되돌려 놓는다(overlayHistory 헤더 참고).
        ensureOverlayEntry()
        return
      }
      onCloseRef.current()
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [open, overlayId, onCloseRef])
}

export default useOverlayBackButton
