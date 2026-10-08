/*
  Pointer-drag engine for plan blocks (PLAN-19 move, PLAN-20 week-boundary).

  Native Pointer Events only — no DnD library. A block is dragged by a delta from
  where it was grabbed; the vertical delta becomes a 5-minute-snapped time change
  and the horizontal delta becomes a whole-day column change. Dragging past the
  first/last column marks a week-boundary move instead of clamping.

  The listeners for a drag are created inside pointerdown and removed on release,
  so their identities always match (no leaked/duplicate listeners even though
  dragState re-renders mid-drag). Current range/onCommit are read through refs so
  a drag commits with up-to-date values without re-binding. The hook owns only
  transient drag state (ghost + tooltip); it never touches the query cache — the
  page performs the optimistic move + history record on commit.

  터치 전용 분기 (모바일 레이아웃 작업, A1/A2): 마우스/펜은 위 설명대로 4px만
  움직이면 즉시 드래그가 시작된다 — 그대로 둔다. 터치는 그렇게 두면 그리드를
  스크롤하려는 스와이프가 전부 블록 이동으로 가로채인다(PlanBlock이 touchAction
  을 pan-x pan-y로 바꿔 평소엔 네이티브 스크롤을 허용하므로, 이 훅이 먼저
  "이동"으로 단정하지 않아야 그 스크롤이 실제로 일어난다). 그래서 터치는:
    - 누른 채 LONG_PRESS_MS 동안 TOUCH_CANCEL_PX 이상 움직이지 않으면 → 드래그
      활성화(이때부터 네이티브 스크롤을 막아야 하므로 non-passive touchmove로
      preventDefault — touch-action은 제스처 시작 시점에 고정되어 중간에 못
      바꾸므로, "되돌리는" 대신 "그 뒤로 막는" 쪽을 쓴다).
    - 그 전에 손가락이 움직이면 → 스크롤 의도로 보고 조용히 포기(네이티브
      스크롤이 이미 진행 중이라면 곧 pointercancel이 와서 같은 정리를 한다).
    - 그 전에 손을 떼면(많이 움직이지 않은 채) → "탭"이다. 드래그로 치지 않고
      onTap으로 알려 PLAN-09 액션 메뉴를 열게 한다(마우스는 우클릭, 터치는 탭).
*/

import { useCallback, useEffect, useRef, useState } from 'react'
import { PX_PER_MIN } from './planGeometry'
import { MINUTES_PER_DAY, snapMinutes } from './planTime'

const DRAG_THRESHOLD_PX = 4
const LONG_PRESS_MS = 450
// 롱프레스 타이머가 끝나기 전, 이 거리 이상 움직이면 "스크롤하려는 스와이프"로
// 보고 드래그 활성화를 포기한다. 타이머가 끝난 뒤 release된 경우(탭 판정)에도
// 같은 값으로 "많이 안 움직였다"를 판정한다.
const TOUCH_CANCEL_PX = 10

/**
 * @param {Object} opts
 * @param {React.RefObject<HTMLElement>} opts.gridRef  grid BODY element (7 cols, excludes ruler)
 * @param {{startMinutes:number,endMinutes:number}} opts.range
 * @param {(target:{planBlockId:string,boundary:('prev'|'next'|null),dayIndex:number,startMin:number,endMin:number})=>void} opts.onCommit
 * @param {number} [opts.pxPerMin]  현재 세로 축척. 그리드가 그릴 때 쓴 값과 같아야
 *   드래그한 거리와 블록이 실제로 옮겨 가는 시간이 일치한다.
 * @param {boolean} [opts.disabled]
 * @param {(block:object, point:{x:number,y:number})=>void} [opts.onTap]  터치로
 *   블록을 "탭"했을 때(드래그로 이어지지 않고 금방 뗀 경우) 호출 — PLAN-09 액션
 *   메뉴를 그 위치에 연다. 마우스/펜은 이미 우클릭/Enter·Space 경로가 있으므로
 *   여기서는 호출하지 않는다.
 */
export function usePlanDrag({
  gridRef,
  range,
  pxPerMin = PX_PER_MIN,
  onCommit,
  onDropOutside,
  onTap,
  disabled,
}) {
  const [dragState, setDragState] = useState(null)
  // The visible band, read through a ref so an in-flight drag clamps against the
  // current range without re-binding its window listeners.
  const rangeRef = useRef(range)
  // 축척도 range와 같은 이유로 ref를 거쳐 읽는다 — 드래그 도중 확대/축소가
  // 일어나도 진행 중인 드래그가 옛 축척으로 계산하지 않도록.
  const pxPerMinRef = useRef(pxPerMin)
  // Thomas 리뷰 BLOCKER: 멀티터치 가드. onBlockPointerDown은 블록마다 독립된
  // 클로저(s)와 window 리스너를 등록하므로, 손가락 A로 제스처가 진행되는
  // 중에 손가락 B가 다른 블록을 누르면 두 번째 호출이 "또 하나의" window
  // 리스너 세트를 등록해 버린다 — 이후 A/B 어느 쪽 pointermove가 와도 두
  // 세트가 전부 반응해 좌표가 서로 오염된다. 훅 레벨(블록 호출 전체가 공유)
  // 에서 "지금 어느 pointerId가 이 제스처를 쥐고 있는가"를 추적해, 그 밖의
  // pointerdown은 통째로 무시하고, 리스너 안에서도 매번 pointerId를 대조한다.
  const activePointerIdRef = useRef(null)
  // 언마운트 시 진행 중인 제스처를 정리하기 위한 자리(요구사항 4) — 매
  // onBlockPointerDown 호출이 자신의 cleanup을 여기 심어 두고, 끝나면(cleanup
  // 자신이) 비운다.
  const activeCleanupRef = useRef(null)
  useEffect(() => {
    return () => {
      activeCleanupRef.current?.()
    }
  }, [])

  // Commit through a ref so a drag that started earlier still calls the latest
  // handler without re-binding the window listeners mid-drag. Drag math is
  // delta-based from the block's grabbed position, so the visible range is not
  // needed here.
  const onCommitRef = useRef(onCommit)
  const onDropOutsideRef = useRef(onDropOutside)
  const onTapRef = useRef(onTap)
  useEffect(() => {
    onCommitRef.current = onCommit
    onDropOutsideRef.current = onDropOutside
    onTapRef.current = onTap
    rangeRef.current = range
    pxPerMinRef.current = pxPerMin
  }, [onCommit, onDropOutside, onTap, range, pxPerMin])

  const onBlockPointerDown = useCallback(
    (e, block, dayIndex, startMin) => {
      // Left button only (터치는 button이 0으로 보고되므로 이 체크를 그대로
      // 통과한다); `disabled` (a read-only past week, or — plan-polish fix G —
      // an auto-place draft under review) disables dragging entirely.
      if (disabled || e.button !== 0) return
      // 멀티터치 가드: 이미 다른 pointerId가 제스처를 쥐고 있으면 새
      // pointerdown은 무시한다 — 손가락 B로 다른 블록을 눌러도 A의 드래그가
      // 끝나기 전까진 아무 일도 일어나지 않는다.
      if (activePointerIdRef.current != null) return

      const isTouch = e.pointerType === 'touch'
      const pointerId = e.pointerId
      activePointerIdRef.current = pointerId
      // 가능하면 즉시 포인터를 캡처한다 — window 리스너가 주 경로라 캡처
      // 없이도 동작하지만, 캡처가 걸리면 이 포인터의 move/up/cancel이 중간에
      // 다른 요소로 새지 않아 더 견고하다. 실패해도(미지원/이미 해제된
      // 포인터 등) 조용히 넘어간다 — window 리스너가 어차피 주 경로다.
      try {
        e.currentTarget?.setPointerCapture?.(pointerId)
      } catch {
        /* no-op — window 리스너가 대신한다 */
      }
      const duration = (new Date(block.endAt) - new Date(block.startAt)) / 60000
      const s = {
        planBlockId: block.planBlockId,
        pointerId,
        clientX0: e.clientX,
        clientY0: e.clientY,
        // 롱프레스 타이머가 끝날 때 쓸 "최신 위치" — 타이머가 끝날 때까지는
        // TOUCH_CANCEL_PX 미만의 떨림만 허용되므로 clientX0/Y0과 크게 다르지
        // 않지만, 약간의 오차 없이 그 시점 좌표로 고스트를 그리기 위해 매
        // pointermove에서 갱신해 둔다(터치 분기에서만 의미가 있다).
        lastX: e.clientX,
        lastY: e.clientY,
        dayIndex0: dayIndex,
        startMin0: startMin,
        duration,
        active: false,
        longPressTimer: null,
        blockScrollWhileDragging: null,
      }

      const compute = (clientX, clientY) => {
        const rect = gridRef.current.getBoundingClientRect()
        const colWidth = rect.width / 7

        const dMin = (clientY - s.clientY0) / pxPerMinRef.current
        let start = snapMinutes(s.startMin0 + dMin)
        // Clamp to the VISIBLE band, not just the whole day: in focus mode the
        // grid starts at ~08:00, so a day-clamped start could sit above the body
        // and paint the block over the sticky day-header row. Read through a ref
        // so a mode toggle mid-drag uses the current range.
        const r = rangeRef.current
        const floor = r ? r.startMinutes : 0
        const ceil = (r ? r.endMinutes : MINUTES_PER_DAY) - s.duration
        start = Math.max(floor, Math.min(start, Math.max(floor, ceil)))

        const dCol = Math.round((clientX - s.clientX0) / colWidth)
        const rawDay = s.dayIndex0 + dCol
        let boundary = null
        if (rawDay < 0) boundary = 'prev'
        else if (rawDay > 6) boundary = 'next'
        const day = Math.max(0, Math.min(6, rawDay))

        return {
          planBlockId: s.planBlockId,
          boundary,
          dayIndex: day,
          startMin: start,
          endMin: start + s.duration,
        }
      }

      const cleanup = () => {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
        window.removeEventListener('pointercancel', handleCancel)
        if (s.longPressTimer != null) clearTimeout(s.longPressTimer)
        if (s.blockScrollWhileDragging) {
          window.removeEventListener('touchmove', s.blockScrollWhileDragging)
        }
        // 이 제스처가 쥐고 있던 슬롯/정리 핸들을 비운다 — 다른 pointerId의
        // 새 pointerdown이 다시 시작할 수 있게 되는 지점이다. 두 체크 모두
        // "지금 비우는 게 바로 나인지"를 확인한다 — 이론상 겹칠 일은 없지만
        // (한 번에 한 제스처만 활성화되므로) 방어적으로 둔다.
        if (activePointerIdRef.current === pointerId) activePointerIdRef.current = null
        if (activeCleanupRef.current === cleanup) activeCleanupRef.current = null
      }
      // 언마운트 시 정리용(요구사항 4) — 지금 막 등록한 이 cleanup이 "현재
      // 진행 중인 제스처"가 된다.
      activeCleanupRef.current = cleanup
      // 롱프레스가 끝났을 때(터치) 드래그를 실제로 켠다 — 고스트가 그 즉시
      // 나타나는 것 자체가 "지금부터 이동 모드"라는 시각 신호다(요구사항의
      // "살짝 들림" 피드백을 새 CSS 없이 기존 dragging 스타일 재사용으로
      // 충족). 짧은 진동으로 한 번 더 확인해 준다(미지원 기기에서는 조용히
      // 무시된다).
      const activateTouchDrag = () => {
        s.active = true
        s.longPressTimer = null
        if (navigator.vibrate) navigator.vibrate(10)
        setDragState(compute(s.lastX, s.lastY))
      }
      const handleMove = (ev) => {
        // Thomas 리뷰 BLOCKER: 다른 손가락/포인터의 move는 무시한다 — 안
        // 그러면 손가락 B가 움직일 때마다 A의 드래그 좌표가 B의 위치로
        // 덮어써진다.
        if (ev.pointerId !== pointerId) return
        if (!s.active) {
          if (isTouch) {
            // 터치는 움직임만으로 활성화하지 않는다(그러면 스크롤과 구분이
            // 안 된다) — 롱프레스 타이머(activateTouchDrag)만이 활성화한다.
            // 여기서 하는 일은 딱 하나: 타이머가 끝나기 전에 너무 많이
            // 움직이면 "스크롤하려는 스와이프"로 보고 포기하는 것.
            s.lastX = ev.clientX
            s.lastY = ev.clientY
            const moved =
              Math.abs(ev.clientX - s.clientX0) + Math.abs(ev.clientY - s.clientY0)
            if (moved >= TOUCH_CANCEL_PX) cleanup()
            return
          }
          const moved =
            Math.abs(ev.clientX - s.clientX0) + Math.abs(ev.clientY - s.clientY0)
          if (moved < DRAG_THRESHOLD_PX) return
          s.active = true
        }
        setDragState(compute(ev.clientX, ev.clientY))
      }
      const handleUp = (ev) => {
        // 다른 포인터의 up은 이 제스처와 무관하다 — 무시(이 포인터가 끝날 때
        // 까지 cleanup도, 커밋도 하지 않는다).
        if (ev.pointerId !== pointerId) return
        cleanup()
        // Commit FIRST (applies the optimistic cache move synchronously), THEN
        // clear the ghost — both land in the same React batch, so the block never
        // renders for a frame at its old cache position before the move applies.
        if (s.active) {
          // A drop over the unplaced panel unplaces instead of moving (A3). The
          // page hit-tests the point and returns true when it consumed the drop.
          const point = { x: ev.clientX, y: ev.clientY }
          const consumed = onDropOutsideRef.current?.(s.planBlockId, point)
          if (!consumed) onCommitRef.current(compute(ev.clientX, ev.clientY))
        } else if (isTouch) {
          // 롱프레스가 끝나기 전에 뗐고 많이 움직이지도 않았다 — "탭"이다
          // (PLAN-09: 터치는 탭으로 액션 메뉴를 연다. 많이 움직였다면 이미
          // handleMove가 cleanup을 호출해 여기까지 오지 않는다).
          const moved = Math.abs(ev.clientX - s.clientX0) + Math.abs(ev.clientY - s.clientY0)
          if (moved < TOUCH_CANCEL_PX) {
            onTapRef.current?.(block, { x: ev.clientX, y: ev.clientY })
          }
        }
        setDragState(null)
      }
      const handleCancel = (ev) => {
        // Thomas 리뷰 BLOCKER: 손가락 B가 스크롤로 전환되며 받는
        // pointercancel이 A의 드래그까지 취소해 버리던 것 — 이 포인터가
        // 아니면 무시한다.
        if (ev.pointerId !== pointerId) return
        cleanup()
        setDragState(null)
      }

      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
      window.addEventListener('pointercancel', handleCancel)

      if (isTouch) {
        s.longPressTimer = setTimeout(activateTouchDrag, LONG_PRESS_MS)
        // touch-action 자체는 제스처가 시작된 뒤 바꿔도 적용되지 않으므로
        // (PlanBlock은 평소 pan-x pan-y로 둬 스크롤을 그대로 허용한다),
        // 네이티브 스크롤을 막는 유일한 방법은 non-passive touchmove에서
        // 직접 preventDefault하는 것이다. 드래그가 아직 `active`가 아닐
        // 때는 호출하지 않으므로 롱프레스 전 스와이프는 평소처럼 스크롤된다.
        s.blockScrollWhileDragging = (ev) => {
          // 네이티브 TouchEvent에는 pointerId가 없어(touches[].identifier로
          // 다른 체계) 이 포인터만 골라낼 수 없다 — 최선의 방어로, 터치가
          // 동시에 두 개 이상이면(두 번째 손가락이 내려온 상태) 막지 않는다.
          // 그래야 A가 드래그 중이어도 B가 화면을 두 손가락으로 조작하려는
          // 시도를 가로채지 않는다. 터치가 하나뿐일 때만(=A 자신일 가능성이
          // 가장 높을 때) 막는다.
          if (s.active && ev.touches.length <= 1) ev.preventDefault()
        }
        window.addEventListener('touchmove', s.blockScrollWhileDragging, { passive: false })
      }
    },
    [disabled, gridRef],
  )

  return { dragState, onBlockPointerDown }
}

export default usePlanDrag
