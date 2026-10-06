import { useRef } from 'react'
import { formatMinutesLabel } from '../../features/plan/planTime'
import { LockIcon } from '../common/statusIcons'

// A2: 터치는 우클릭이 없으므로 "탭"으로 메뉴를 연다. 이 블록은 드래그가 없어
// (헤더 주석 참고) PlanBlock처럼 롱프레스와 탭을 가를 필요가 없다 — 많이 안
// 움직이고 뗐으면 그냥 탭이다.
const TAP_MOVE_PX = 10

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
  const touchStartRef = useRef(null)
  // 리드 셀프리뷰 지적: 안드로이드 Chrome(TWA 포함)은 터치를 ~500ms 누르고
  // 있으면 네이티브 contextmenu를 자체적으로 쏜다. 이 블록은 손을 떼는
  // 순간(onPointerUp, 위)이 메뉴를 여는 정본 경로이므로 — 길게 눌렀다 떼도
  // 결국 pointerup이 열어 준다 — contextmenu가 또 열면 같은 메뉴가 중복으로
  // 열린다. pointerType을 기억해 그 경로만 막는다(마우스 우클릭은 통과).
  const lastPointerTypeRef = useRef('mouse')

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
        lastPointerTypeRef.current = e.pointerType
        if (disabled || e.pointerType !== 'touch') return
        touchStartRef.current = { x: e.clientX, y: e.clientY }
      }}
      onPointerUp={(e) => {
        const start = touchStartRef.current
        touchStartRef.current = null
        if (disabled || !start || e.pointerType !== 'touch') return
        const moved = Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y)
        if (moved < TAP_MOVE_PX) openMenuFromEvent(e)
      }}
      onPointerCancel={() => {
        touchStartRef.current = null
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        // Same reasoning as PlanBlock: keep this on the block, not the grid's
        // empty-slot placement menu (ST-F1-03 PLAN-07) underneath it.
        e.stopPropagation()
        // 터치 롱프레스가 일으킨 contextmenu는 메뉴를 열지 않는다 — 위
        // onPointerUp이 손을 떼는 순간 이미 연다(또는 열 것이다). 여기서도
        // 열면 중복이다. preventDefault/stopPropagation은 그대로 해 둬서
        // iOS 콜아웃·네이티브 메뉴는 여전히 막는다.
        const pointerType = e.nativeEvent?.pointerType || lastPointerTypeRef.current
        if (pointerType === 'touch') return
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
