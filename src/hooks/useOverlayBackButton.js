import { useEffect } from 'react'
import { isTopmostOverlay } from '../utils/overlayStack'
import { ensureOverlayEntry, installOverlayHistoryBridge } from '../utils/overlayHistory'

/*
  안드로이드 뒤로 가기 → 최상단 오버레이 닫기.

  Esc 처리와 **같은 규칙**을 따른다(Dialog.jsx 헤더 참고) — 열려 있는 동안 모든 인스턴스가
  듣지만, `isTopmostOverlay` 인 하나만 반응하고, 실제로 닫는 것은 `onClose` 가 있을 때만이다.
  히스토리 엔트리 자체는 이 훅이 만들지 않는다(utils/overlayHistory.js 의 브리지가 스택
  전이로 관리한다) — 인스턴스마다 쌓으면 동시에 닫힐 때 어긋난다.

  `onCloseRef` 를 받는 이유도 Esc 쪽과 같다: 호출부가 매 렌더 새 화살표 함수를 넘기므로,
  ref 로 받아야 이 effect 의 deps 가 `[open, overlayId]` 로 안정된다.
*/
export function useOverlayBackButton(overlayId, open, onCloseRef) {
  useEffect(() => {
    if (!open) return undefined
    installOverlayHistoryBridge()

    const onPopState = () => {
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
