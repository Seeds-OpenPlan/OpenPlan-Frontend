import { useRef } from 'react'
import { formatMinutesLabel } from '../../features/plan/planTime'
import { LockIcon } from '../common/statusIcons'

// A2: 터치는 우클릭이 없으므로 "탭"으로 메뉴를 연다. 이 블록은 드래그가 없어
// (헤더 주석 참고) PlanBlock처럼 롱프레스와 탭을 가를 필요가 없다 — 많이 안
// 움직이고 뗐으면 그냥 탭이다.
const TAP_MOVE_PX = 10
// Thomas 리뷰 HIGH(PlanBlock/CalendarGrid와 같은 수정) — 키보드 contextmenu
// 오판 방지용 "최근 터치" 판정 창.
const TOUCH_GESTURE_WINDOW_MS = 1000

/*
  A recurring fixed schedule (ST-F1-06 — PLAN-33/34), positioned by the caller
  from its weekday + start/end minutes rather than a specific day. Deliberately a
  SEPARATE component from PlanBlock, not a PlanBlock variant: a fixed schedule is
  "고정적이고 반복되어 다른 일을 할 수 없는 일정" (ONB-05) — it never drags, resizes,
  or deletes here (그 편집은 ST-F1-12 소관), so this component simply has no
  onPointerDown/onResizeStart to wire up, rather than a disabled one PlanBlock
  would need extra branches to suppress. Its only affordance is the block-action
  menu (이번 주만 비활성화 / 다시 활성화), opened the same way PlanBlock's is
  (right-click / long-press-as-contextmenu / Enter·Space) so a screen-reader or
  keyboard user finds it in the expected place.

  Visually it uses the neutral scale (bg-neutral-100/border-neutral-400), never
  the brand tint (TASK) or the plain white bordered card (SCHEDULE) — the "고정"
  chip + lock glyph reinforce that it is a different KIND of thing, not just a
  differently-colored block, so it can't be right-clicked expecting an edit/
  delete menu that isn't there.
*/

// A week exception (activeThisWeek=false) reads as a GHOST: translucent + a
// dashed border (never color alone — the "이번 주 제외" chip below carries the
// actual meaning, per NFR-017).
const GHOST_CLASS = 'border-dashed opacity-55'

export function FixedScheduleBlock({ schedule, style, disabled = false, onOpenMenu }) {
  const timeLabel = `${formatMinutesLabel(schedule.startMinutes)} - ${formatMinutesLabel(schedule.endMinutes)}`
  const inactive = schedule.activeThisWeek === false

  const openMenuFromEvent = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    onOpenMenu?.({ x: e.clientX || rect.right, y: e.clientY || rect.top })
  }

  // A2: 터치 탭 추적 — pointerdown 지점을 적어 두고, pointerup이 거기서 많이
  // 안 움직인 채 왔으면 탭으로 보고 메뉴를 연다. 드래그가 없는 블록이라
  // PlanBlock의 롱프레스 분기(usePlanDrag)는 필요 없다.
  //
  // Thomas 리뷰 BLOCKER(usePlanDrag/CalendarGrid와 같은 수정) — pointerId도
  // 같이 적어 둔다. 손가락 A로 탭을 추적하는 중에 손가락 B가 같은 블록을
  // 짚으면 start가 B의 좌표로 덮어써지고, A가 손을 뗄 때 그 오염된 좌표와
  // 비교해 "많이 움직였다/안 움직였다"를 잘못 판정한다.
  const touchStartRef = useRef(null) // { x, y, pointerId } | null
  // 리드 셀프리뷰 지적 + Thomas 리뷰 HIGH: 안드로이드 Chrome(TWA 포함)은
  // 터치를 ~500ms 누르고 있으면 네이티브 contextmenu를 자체적으로 쏜다.
  // 이 블록은 손을 떼는 순간(onPointerUp, 위)이 메뉴를 여는 정본 경로이므로
  // — 길게 눌렀다 떼도 결국 pointerup이 열어 준다 — contextmenu가 또 열면
  // 같은 메뉴가 중복으로 열린다. "최근 터치가 있었는가"(시간 창)로 그
  // 경로만 막는다 — 영구 ref라면 몇 분 전 터치가 지금의 키보드(Shift+F10/
  // 메뉴 키) contextmenu까지 막아 버린다(마우스 우클릭은 pointerType이
  // 'mouse'로 명시되므로 애초에 이 폴백을 안 탄다).
  const touchGestureUntilRef = useRef(0)

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={`${schedule.title}, ${timeLabel}, 고정 일정${inactive ? ', 이번 주 제외' : ''}${disabled ? ', 읽기 전용' : ''}`}
      aria-disabled={disabled || undefined}
      // 리드 셀프리뷰 지적 2: select-none(아래 className)은 텍스트 선택만
      // 막고 iOS의 콜아웃(길게 눌렀을 때 뜨는 복사/공유 팝업)은 안 막는다 —
      // 별도로 끈다.
      style={{ ...style, WebkitTouchCallout: 'none' }}
      onPointerDown={(e) => {
        if (e.pointerType === 'touch') {
          touchGestureUntilRef.current = Date.now() + TOUCH_GESTURE_WINDOW_MS
        }
        if (disabled || e.pointerType !== 'touch') return
        // 멀티터치 가드 — 이미 다른 손가락이 탭을 추적 중이면 새 pointerdown
        // 은 무시한다(두 손가락이 겹쳐 좌표가 섞이지 않게).
        if (touchStartRef.current != null) return
        touchStartRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId }
      }}
      onPointerUp={(e) => {
        const start = touchStartRef.current
        if (disabled || !start || e.pointerType !== 'touch' || e.pointerId !== start.pointerId) {
          return
        }
        touchStartRef.current = null
        const moved = Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y)
        if (moved < TAP_MOVE_PX) openMenuFromEvent(e)
      }}
      onPointerCancel={(e) => {
        if (touchStartRef.current?.pointerId === e.pointerId) touchStartRef.current = null
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        // Same reasoning as PlanBlock: keep this on the block, not the grid's
        // empty-slot placement menu (ST-F1-03 PLAN-07) underneath it.
        e.stopPropagation()
        // 터치 롱프레스가 일으킨 contextmenu는 메뉴를 열지 않는다 — 위
        // onPointerUp이 손을 떼는 순간 이미 연다(또는 열 것이다). 여기서도
        // 열면 중복이다. preventDefault/stopPropagation은 그대로 해 둬서
        // iOS 콜아웃·네이티브 메뉴는 여전히 막는다. 판별은 PlanBlock과 동일
        // (nativeEvent.pointerType 우선, 없을 때만 "최근 터치" 폴백).
        const pointerType = e.nativeEvent?.pointerType
        const touchRecently = Date.now() < touchGestureUntilRef.current
        if (pointerType === 'touch' || (!pointerType && touchRecently)) return
        if (disabled) return
        openMenuFromEvent(e)
      }}
      onKeyDown={(e) => {
        if (disabled) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openMenuFromEvent(e)
        }
      }}
      className={[
        'absolute z-[5] overflow-hidden rounded-control border border-neutral-400 bg-neutral-100 p-1.5 text-caption text-neutral-700',
        'select-none cursor-default focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring',
        inactive ? GHOST_CLASS : '',
      ].join(' ')}
    >
      <span className="flex items-center gap-1 leading-tight text-[0.65rem] opacity-80">
        <LockIcon size={10} />
        <span className="truncate">{timeLabel}</span>
      </span>
      <span className="mt-0.5 font-medium leading-tight">
        <span className="line-clamp-2">{schedule.title}</span>
      </span>
      {inactive && (
        <span className="mt-1 inline-flex items-center rounded-chip bg-neutral-300 px-1.5 py-px text-[0.6rem] font-bold text-neutral-700">
          이번 주 제외
        </span>
      )}
    </div>
  )
}

export default FixedScheduleBlock
