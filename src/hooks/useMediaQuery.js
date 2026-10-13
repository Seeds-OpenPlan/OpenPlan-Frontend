import { useState, useSyncExternalStore } from 'react'

/*
  Reports whether a CSS media query currently matches. Used to pick the modal
  shell for OVL-CONFLICT (centered Dialog on desktop, BottomSheet on mobile —
  ui-spec §0.3) without rendering both DOM trees.
*/
export function useMediaQuery(query) {
  return useSyncExternalStore(
    (callback) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', callback)
      return () => mql.removeEventListener('change', callback)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

// Tailwind's `md` breakpoint (>=768px) = desktop shell.
export function useIsDesktop() {
  return useMediaQuery('(min-width: 768px)')
}

/*
  폴더블 대응(D1): 열려 있는 동안에는 셸(Dialog ↔ BottomSheet 등)이 안 바뀌게
  `useIsDesktop()` 값을 "열린 시점" 값으로 고정한다.

  왜 필요한가 — 폴드 기기를 펼치고 접으면 CSS 폭이 768px 경계를 실시간으로
  넘나든다. 모달이 열려 있는 동안 `useIsDesktop()`의 실시간 값이 바뀌면,
  Dialog와 BottomSheet는 서로 다른 포털/DOM 구조라 그 모달을 통째로
  마운트 해제 후 재마운트한다 — 안에 입력 중이던 폼의 로컬 상태·포커스·
  스크롤 위치가 전부 날아간다.

  동작 — `open`이 false→true로 바뀌는 "열리는 순간"에만 그 시점의 실시간
  값으로 다시 고정(latch)하고, open이 true인 동안은 그 고정값만 돌려준다.
  open이 false면 그냥 실시간 값을 돌려준다(닫혀 있을 때는 고정할 이유가
  없고, 그래야 다음에 열릴 때 "그 시점"의 최신 값으로 다시 잰다).

  `open` 기본값 true — "부모가 열릴 때만 조건부로 마운트하는" 모달들
  (`{state && <Form/>}` 패턴, 이 코드베이스의 대다수)은 열려 있는 한 매번
  새로 마운트되므로 각 인스턴스의 "열리는 순간"은 곧 "마운트되는 순간"이다
  — 그런 호출부는 인자 없이 `useLockedIsDesktop()`만 쓰면 마운트 시점에
  한 번 고정되고, 그 인스턴스가 살아있는 동안(= 열려 있는 동안) 그대로
  유지된다. 닫힐 때마다 실제로 unmount되는 것이 전제이므로 "다시 열기"는
  항상 새 인스턴스 = 새 고정이다.

  구현 — "렌더 중 state를 조정"하는 React 공식 패턴(이전 렌더의 prop을
  state로 들고 있다가, 이번 렌더에서 달라졌으면 그 자리에서 setState)이다.
  useEffect로 했다면 "열리는 그 프레임"엔 아직 옛 값을 쓰고 한 프레임 뒤에야
  고정값으로 넘어가면서 깜빡였을 것 — 이 패턴은 같은 렌더에서 바로 반영되어
  깜빡임이 없다.
*/
export function useLockedIsDesktop(open = true) {
  const live = useIsDesktop()
  const [locked, setLocked] = useState(live)
  const [prevOpen, setPrevOpen] = useState(false)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setLocked(live)
  }
  return open ? locked : live
}

export default useMediaQuery
