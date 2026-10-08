import { useEffect, useRef, useState } from 'react'
import { Button } from '../common/Button'
import { SkeletonBlock } from '../common/Skeleton'
import { EmptyState } from '../common/EmptyState'
import { ErrorState } from '../common/ErrorState'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import {
  addDaysISO,
  formatISODate,
  parseISODate,
  WEEKDAY_LABELS_KO,
  WEEKEND_COLUMN_INDICES,
} from '../../features/plan/planTime'
import { barRectDays, clampRange, diffDaysISO, wbsDayRange } from '../../features/project/planWbs'
import { toast } from '../../hooks/useToasts'
import { systemMessages } from '../../constants/systemMessages'

/*
  계획 탭 · WBS 바 (ui-spec §PROJ.3, PROJ-13/14, AC-6). Day-granularity drag —
  NOT the weekly calendar's 5-minute snap — so this owns its own geometry
  (features/project/planWbs.js) rather than reusing planGeometry.js.

  Drag commits are debounced 500ms past the LAST pointer/keyboard change
  before the PATCH fires (§PROJ.3 키보드 — "연속 입력은 500ms 디바운스 후 1회
  PATCH"), applied to both the mouse drag (committed once on pointerup, so
  the debounce mainly matters for rapid re-drags) and the keyboard path
  (where every arrow press would otherwise fire its own request).
*/

const COMMIT_DEBOUNCE_MS = 500

/*
  B2: WBS 바·리사이즈 손잡이·마감선 손잡이 셋 다 pointerdown에서 즉시
  setPointerCapture하고 드래그를 시작했다(아래 startDrag/startDeadlineDrag).
  터치에서는 이게 문제다 — 이 타임라인은 `overflow-x-auto`로 가로 스크롤하는
  화면인데(아래 timelineRef), 손가락이 스크롤하려고 살짝 움직이는 순간에도
  이미 "드래그"로 캡처돼 있어서 브라우저의 가로 패닝이 끼어들며
  pointercancel로 끊긴다 — 스크롤하려던 스와이프가 매번 날짜 드래그로
  가로채이는, weekly 그리드(usePlanDrag.js)와 똑같은 증상이다.

  해법도 같다: 마우스/펜은 즉시 시작하고(behavior 그대로), 터치만 롱프레스
  (LONG_PRESS_MS) 뒤에야 시작한다 — 그 전에 CANCEL_PX 이상 움직이면 스크롤
  의도로 보고 조용히 포기해 네이티브 스크롤이 그대로 일어나게 둔다. 세 손잡이
  모두 겪는 문제라 한 번만 구현해 공유한다(usePlanDrag는 윈도우 리스너 +
  자체 delta 계산을 갖는 더 큰 구조라 그대로 재사용하지 않고, 여기 맞는
  작은 형태로 따로 둔다).

  AI 리뷰 Blocking (#68, e597ea3 기준): 위 문단은 "해법도 같다"고 적었지만
  틀렸다 — usePlanDrag.js는 활성화(activate) 뒤에도 non-passive touchmove에서
  직접 preventDefault하는 `blockScrollWhileDragging`이 있는데, 이 파일엔 그
  대응물이 없었다(이 파일 전체에 touchmove 리스너가 0건). 롱프레스로
  "활성화"는 됐지만 각 손잡이 엘리먼트의 CSS `touchAction: 'pan-x pan-y'`는
  활성화 후에도 그대로 남아 있어(touch-action은 제스처가 이미 시작된 뒤
  바꿔도 적용되지 않으므로, 평소엔 스크롤을 허용해야 하는 이 요소들이 애초에
  `pan-x pan-y`로 선언돼 있다), 타임라인이 가로 스크롤(`overflow-x-auto`)인
  이 화면에서는 드래그 축과 스크롤 축이 겹쳐 손가락을 옆으로 움직이는 순간
  브라우저가 그대로 가로 패닝으로 해석해 pointercancel을 쏘아 버린다 —
  활성화된 드래그가 실제로는 단 1px도 못 움직이고 번번이 취소되거나, 반대로
  타임라인 자체가 스크롤돼 버리는 증상이었다. 아래 `startTouchScrollBlock`/
  `stopTouchScrollBlock`이 usePlanDrag의 그 패턴을 그대로 가져온다 — 터치
  드래그가 실제로 활성화되는 시점(startDrag/startDeadlineDrag)에만 등록해,
  롱프레스 대기 중의 스와이프는 여전히 평소처럼 스크롤되게 둔다(마우스/펜
  경로는 이 등록 자체를 건너뛴다).
*/
const LONG_PRESS_MS = 450
const LONG_PRESS_CANCEL_PX = 10

// Thomas 리뷰 BLOCKER: 이 파일 안의 모든 WbsBar/마감선 손잡이가 같은
// withLongPressGate 함수를 쓰고, 그 안의 window 리스너는 pointerId를 대조하지
// 않았다 — 손가락 A로 하나를 롱프레스하는 중에 손가락 B가 움직이면 A의
// 취소 판정이 B의 움직임으로 오염되고(cleanup이 잘못 불려 드래그가 시작 안
// 되거나), B의 pointercancel이 A의 대기까지 취소했다. 모듈 레벨 변수로
// "지금 대기 중인 롱프레스가 있는가"를 추적한다 — 이 파일 안의 바가 여러
// 개 동시에 렌더돼 있어도(프로젝트에 태스크가 많을 때) 대기 단계는 전체
// 타임라인에서 하나만 유효해야 손가락 B의 새 pointerdown이 A를 방해하지
// 않는다.
//
// AI 리뷰 Should-fix (#68): 위 주석은 "활성화 뒤의 실제 드래그는 이 가드
// 범위 밖"이라고 적었지만 틀렸다 — 활성화 후 pendingLongPressPointerId는
// 비워지므로, 그 다음부터는 각 바/손잡이 자신의 onPointerMove/Up/Cancel이
// e.pointerId를 전혀 보지 않고 동작했다. 롱프레스로 드래그 A가 켜진 채로
// 손가락 B가 같은 바를 짚었다 떼면 B의 pointerup이 A의 드래그를 끝내며 그
// 순간 preview를 커밋해 버렸다(pointercancel도 동일). activeDragPointerId를
// 추가해 "대기 중이거나 이미 활성화된 드래그가 있는가"를 하나로 묶어
// 추적한다 — 이 때문에 서로 다른 바를 각각 다른 손가락으로 동시에 드래그하는
// 것은 이제 더 이상 허용되지 않는다(전체 타임라인에 한 번에 하나의 터치
// 드래그만), pointerId 격리 정확성을 우선한 의도적인 트레이드오프다. 실제
// 활성화 시점의 pointerId는 각 드래그 ref(dragRef.current.pointerId /
// deadlineDragRef.current.pointerId)에도 저장해, move/up/cancel 핸들러가
// "이 이벤트가 정말 이 드래그를 쥔 손가락에서 온 것인지"를 매번 다시
// 확인한다 — 모듈 변수 하나만으로는 "지금 활성 드래그가 있다"만 알 수 있지,
// "이 특정 핸들러 인스턴스가 쥔 게 맞는지"는 알 수 없기 때문이다.
let pendingLongPressPointerId = null
let activeDragPointerId = null

// react-hooks/globals (eslint) flags any reassignment of a module-scope
// variable found lexically inside a component/hook function body, even from
// inside an event handler closure — it can't tell that these only ever run
// on a real pointer event, never during render. `pendingLongPressPointerId`
// above dodges this because every reassignment already lives in a plain
// function declared OUTSIDE the component (withLongPressGate / its
// cleanup). `activeDragPointerId` needs the same indirection since its
// call sites (startDrag/startDeadlineDrag and their up/cancel handlers)
// are defined INSIDE WbsTimeline/WbsBar — these two setters are the only
// place that actually touches the variable, so everything downstream of a
// real pointerdown/up/cancel still mutates it, just through here.
function setActiveDragPointer(pointerId) {
  activeDragPointerId = pointerId
}
function clearActiveDragPointer(pointerId) {
  if (activeDragPointerId === pointerId) activeDragPointerId = null
}

// AI 리뷰 Blocking (#68): usePlanDrag.js의 `blockScrollWhileDragging`과 같은
// 패턴 — CSS `touchAction`은 제스처가 이미 시작된 뒤 바꿔도 소용없으므로,
// 활성화된 터치 드래그 중 브라우저의 가로 스크롤을 막는 유일한 방법은
// non-passive `touchmove`에서 직접 preventDefault하는 것뿐이다. 호출자
// (startDrag/startDeadlineDrag)가 실제 활성화 시점에만 등록하므로, 롱프레스
// 대기 중의 스와이프는 이 블로커가 아직 없어 평소처럼 스크롤된다.
function startTouchScrollBlock() {
  const blocker = (ev) => {
    // 네이티브 TouchEvent에는 pointerId가 없어(touches[].identifier로 다른
    // 체계) "내 손가락"만 골라낼 수 없다 — usePlanDrag와 같은 방어로, 터치가
    // 둘 이상이면(두 번째 손가락이 내려와 있으면) 막지 않는다. 그래야 이
    // 드래그가 진행 중이어도 다른 손가락으로 화면을 두 손가락 조작하려는
    // 시도까지 가로채지 않는다.
    if (ev.touches.length <= 1) ev.preventDefault()
  }
  window.addEventListener('touchmove', blocker, { passive: false })
  return blocker
}
function stopTouchScrollBlock(blocker) {
  if (blocker) window.removeEventListener('touchmove', blocker)
}

// `activate(shim)`을 마우스/펜은 즉시, 터치는 롱프레스 뒤에만 호출하는
// pointerdown 래퍼. `shim`은 원본 이벤트에서 꺼낸 { clientX, pointerId,
// currentTarget, pointerType }뿐이다 — 450ms 뒤에 실행될 수도 있어 리액트
// 합성 이벤트 객체 자체가 아니라 필요한 값만 복사해 넘긴다. `pointerType`은
// AI 리뷰 Blocking(#68) 수정분 — startDrag/startDeadlineDrag가 "터치일
// 때만" 스크롤 차단 리스너를 등록해야 하므로(마우스/펜은 영향 없어야 함)
// 필요해졌다.
function withLongPressGate(activate) {
  return (e) => {
    const shim = {
      clientX: e.clientX,
      pointerId: e.pointerId,
      currentTarget: e.currentTarget,
      pointerType: e.pointerType,
    }
    if (e.pointerType !== 'touch') {
      activate(shim)
      return
    }
    // 이미 다른 포인터가 대기 중이거나, 이미 활성화된 드래그가 진행 중이면
    // (AI 리뷰 Should-fix, #68) 이 pointerdown은 무시한다 — activate 뒤에도
    // 같은 변수로 계속 추적되므로, 손가락 B가 활성 드래그 도중 새 대기
    // 롱프레스를 시작하는 경로 자체가 막힌다.
    if (pendingLongPressPointerId != null || activeDragPointerId != null) return
    const pointerId = e.pointerId
    pendingLongPressPointerId = pointerId
    const x0 = e.clientX
    const y0 = e.clientY
    let timer = null
    // window 레벨로 듣는다(요소 자체가 아니라) — 손잡이는 24~44px로 작아서,
    // 활성화 전(아직 pointer capture 전) 손가락이 그 경계를 살짝만 넘어가도
    // 이후 move/up/cancel의 실제 타깃이 다른 엘리먼트로 바뀐다. 요소에만
    // 리스너를 달면 그 순간부터 이벤트를 영영 못 받아 취소 판정도, 정리도
    // 멈춘다 — usePlanDrag.js(A1)가 같은 이유로 window를 쓰는 것과 동일.
    const cleanup = () => {
      clearTimeout(timer)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      if (pendingLongPressPointerId === pointerId) pendingLongPressPointerId = null
    }
    // 세 리스너 모두 이 pointerId가 아니면 무시 — 다른 손가락의 move/up/
    // cancel이 이 대기 중인 제스처를 건드리지 않는다.
    const onMove = (ev) => {
      if (ev.pointerId !== pointerId) return
      const moved = Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0)
      if (moved >= LONG_PRESS_CANCEL_PX) cleanup()
    }
    const onUp = (ev) => {
      if (ev.pointerId !== pointerId) return
      cleanup()
    }
    const onCancel = (ev) => {
      if (ev.pointerId !== pointerId) return
      cleanup()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    timer = setTimeout(() => {
      cleanup()
      activate(shim)
    }, LONG_PRESS_MS)
  }
}

/*
  Zoom (accordion restructure, owner spec: "WBS 기간 +/− 버튼으로 확대/축소 —
  WbsTimeline의 하루 칸 픽셀 폭에 스케일 상태 추가"). A discrete step INDEX into
  this fixed table, not a free float multiplier — every resulting `dayPx` is a
  whole pixel value with no sub-pixel column drift, and the +/− buttons get a
  natural disabled boundary at either end instead of an arbitrary min/max
  check on a continuous number. Index 2 (1×) reproduces the exact pre-zoom
  desktop/mobile baseline unchanged.
*/
const ZOOM_STEPS = [0.6, 0.8, 1, 1.25, 1.5, 1.75, 2]
const DEFAULT_ZOOM_INDEX = 2

/*
  F-5 (owner review 2026-07-23): the axis used to render "M/D 요일" as ONE
  inline string. "5/16 화" (double-digit day) is a different character count
  than "5/6 화" (single-digit day), so at a fixed column width some days'
  text fit on one line and others wrapped the weekday onto a second —
  columns visibly jumped height depending on which dates happened to be
  showing. Fixed-width `MM/DD` (zero-padded, always 5 chars) plus rendering
  the weekday on its OWN line unconditionally (never "if it fits") means
  every column is the same two-line shape regardless of date, so nothing
  can wrap differently from its neighbor.
*/
function dayAxisParts(dateISO) {
  const d = parseISODate(dateISO)
  const weekdayIndex = (d.getDay() + 6) % 7 // Monday-first, matches WEEKDAY_LABELS_KO
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return { date: `${mm}/${dd}`, weekday: WEEKDAY_LABELS_KO[weekdayIndex] }
}

function monthDayKO(dateISO) {
  const d = parseISODate(dateISO)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

export function WbsTimeline({
  project,
  nodes,
  isLoading,
  isError,
  onRetry,
  disabled = false,
  disabledReason,
  onCommitRange,
  onCommitDeadline,
  onOpenTaskTab,
}) {
  const isDesktop = useIsDesktop()
  // F-5 widened from 32/40 to 40/48; G-8 widens again — every day now shows
  // its own full label (no more thinning), so the extra room keeps that
  // from feeling cramped, and the owner explicitly accepts more horizontal
  // scroll on long ranges as the trade-off. That fixed 48/56 is now the
  // ZOOM baseline (`ZOOM_STEPS` index 2 = 1×) rather than the final value —
  // see `zoomIndex` below.
  const baseDayPx = isDesktop ? 48 : 56
  const timelineRef = useRef(null)
  // Declared before the early returns below (Rules of Hooks, same reasoning
  // `deadlineDrag`'s own comment gives) even though a loading/error/empty
  // WBS has nothing to zoom yet — every hook must run on every render
  // regardless of which branch actually paints.
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX)

  // F-6 (owner review 2026-07-24): the deadline line's own drag state.
  // Unlike a WBS bar's `preview` (local to ONE row's own WbsBar instance),
  // this lives up HERE because the effective deadline it produces feeds
  // several siblings at once — the line, the region shading, the flag
  // chip, AND every WbsBar's own `pastDeadline` check below — so lifting it
  // is a real requirement, not just a style choice. Declared before the
  // early returns (Rules of Hooks — every hook always runs, no matter which
  // branch below actually renders).
  const [deadlineDrag, setDeadlineDrag] = useState(null) // { previewISO } | null
  // G-10 (owner review 2026-07-24, bug fix): same split as WbsBar's own
  // `isDragging` — `deadlineDrag` has to stay set until `commitDeadline`'s
  // PATCH actually settles (this is what keeps the line/region/flag from
  // snapping back to the stale `project.dueDate` mid-write, since — unlike
  // the WBS bar's own mutation — `useUpdateProject` has no optimistic cache
  // patch of its own to paper over that gap). The tooltip's visible window
  // is shorter and independent: it should vanish the instant the pointer is
  // released (or a keyboard nudge's brief flash ends), not linger for
  // however long the write takes.
  const [deadlineTooltipVisible, setDeadlineTooltipVisible] = useState(false)
  const deadlineDragRef = useRef(null) // { originX, originISO }
  const deadlineDebounceRef = useRef(null)
  const deadlineTooltipFlashRef = useRef(null)
  // MAJOR bug fix (Thomas code review): the latest NOT-YET-SENT deadline
  // drag/keyboard-nudge value, so the unmount cleanup below can FLUSH it
  // instead of silently discarding it — see that cleanup's own comment.
  const pendingDeadlineCommitRef = useRef(null) // ISO string | null
  // Ref-indirection (same pattern as Dialog.jsx's own onCloseRef): the
  // cleanup effect below must keep an EMPTY deps array (it should only fire
  // on TRUE unmount, not re-run on every render — a re-run would flush a
  // perfectly healthy in-progress debounce early), so it reads the CURRENT
  // onCommitDeadline through a ref rather than closing over whichever
  // render happened to be active when this effect was first set up.
  const onCommitDeadlineRef = useRef(onCommitDeadline)
  useEffect(() => {
    onCommitDeadlineRef.current = onCommitDeadline
  })
  useEffect(
    () => () => {
      clearTimeout(deadlineDebounceRef.current)
      clearTimeout(deadlineTooltipFlashRef.current)
      // MAJOR bug fix (Thomas code review): this used to ONLY clearTimeout
      // the pending debounced PATCH, which — when this component unmounts
      // mid-debounce (closing the drawer, switching the accordion's status
      // tab, collapsing this row, or expanding a DIFFERENT project row —
      // all within the 500ms window) — canceled the write outright with no
      // record it ever happened. A user who dragged the deadline and then
      // immediately did any of those saw the change silently vanish.
      // Flushing it here instead — firing the commit immediately on
      // teardown rather than discarding it — guarantees the last dragged/
      // nudged value is never lost. TanStack's `mutateAsync` runs through
      // the QueryClient, not this component, so it still fires and
      // invalidates correctly even after this component is gone; `toast`
      // is a global singleton (mounted once in AppLayout), safe to call
      // from a teardown path with nothing left to show it in place of.
      if (pendingDeadlineCommitRef.current) {
        const iso = pendingDeadlineCommitRef.current
        pendingDeadlineCommitRef.current = null
        onCommitDeadlineRef
          .current(iso)
          .catch(() => toast({ tone: 'error', message: systemMessages.error.writeTitle }))
      }
      // 리드 셀프리뷰 지적: 터치 드래그 도중 이 컴포넌트가 언마운트되면(행
      // 접기/다른 행 펼치기/탭 전환/드로어 닫기/리페치로 인한 키 변경)
      // onDeadlinePointerUp·onDeadlinePointerCancel은 더 이상 오지 않는다 —
      // 그 둘이 유일하게 activeDragPointerId를 지우는 자리였으므로, 지우지
      // 않으면 withLongPressGate가 그 뒤의 모든 새 터치 pointerdown을 영원히
      // 무시해 새로고침 전까지 WBS 터치 드래그 전체가 막힌다. 언마운트 시점에
      // 진행 중인 드래그가 있었다면 여기서 대신 지운다.
      //
      // AI 리뷰 Blocking (#68): 같은 이유로 스크롤 차단 리스너도 먼저
      // 해제한다 — 안 그러면 이 행이 사라져도 window에 걸린 non-passive
      // touchmove 리스너가 그대로 남아 타임라인 가로 스크롤을 계속 막는다.
      if (deadlineDragRef.current) {
        stopTouchScrollBlock(deadlineDragRef.current.touchScrollBlocker)
        clearActiveDragPointer(deadlineDragRef.current.pointerId)
      }
    },
    [],
  )

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <SkeletonBlock height="1.5rem" />
        <SkeletonBlock height="1.75rem" />
        <SkeletonBlock height="1.75rem" />
      </div>
    )
  }
  if (isError) {
    return <ErrorState variant="section" onAction={onRetry} />
  }
  if (!nodes || nodes.length === 0) {
    return (
      <EmptyState
        title="태스크를 먼저 만들면 기간을 계획할 수 있습니다"
        actionLabel="태스크 목록으로"
        onAction={onOpenTaskTab}
      />
    )
  }

  const dayPx = Math.round(baseDayPx * ZOOM_STEPS[zoomIndex])
  const range = wbsDayRange(project, nodes)
  const todayISO = formatISODate(new Date())
  // F-6: while a drag is in progress, EVERYTHING that depends on "where is
  // the deadline" (the line, the flag, the past-deadline region, and each
  // WbsBar's own pastDeadline flag below) reads the in-progress preview
  // instead of the last-saved `project.dueDate` — otherwise the line would
  // visually snap back to its old spot on every pointermove and only jump
  // to the new spot once the debounced PATCH resolves, which would look
  // broken rather than like a drag.
  const effectiveDueDateISO = deadlineDrag?.previewISO ?? project.dueDate
  const deadlineIndex = effectiveDueDateISO ? diffDaysISO(range.startISO, effectiveDueDateISO) : null
  // G-8 (owner review 2026-07-24): F-5's every-other-day thinning past 21
  // days is GONE — the owner traced a perceived "bar doesn't line up with
  // the date ticks" bug to it directly. The bars were always geometrically
  // correct (same day-unit × dayPx math the header itself uses), but with
  // only every OTHER tick labeled, a person has no text anchor for half the
  // grid lines, so matching a bar's edge to an actual date reads as
  // misaligned even though it isn't. Showing every day removes that
  // ambiguity outright; the column width increase below is the accepted
  // trade-off (more horizontal scroll on long ranges, explicitly fine per
  // the owner).

  // F-6 originally warned when a candidate deadline fell before
  // `range.startISO`, using that as a stand-in for "프로젝트 시작일". Removed
  // (owner review 2026-07-24, ②, confirmed by the lead against the ERD):
  // projects have no start-date field at all — `range.startISO` is this
  // component's OWN chart-rendering boundary (earliest planned task start,
  // or just "this week's Monday" as a fallback when nothing is scheduled
  // yet), not a real project attribute, so a warning phrased as "earlier
  // than the start date" was describing something that doesn't exist. There
  // is no accurate substitute wording for an internal rendering detail, so
  // the warning is gone rather than relabeled — dragging the deadline
  // anywhere within the visible range is now allowed with no caption either
  // way (still can't drag it off the rendered edge — see clampToVisibleRange
  // below, that clamp is a UI limit, not a business-rule warning).

  // A candidate date can't be dragged off the edge of the rendered range —
  // there's nothing to snap it TO past either end (mirrors WbsBar's own
  // clampRange "can't invert" guard, same idea applied to a single point
  // instead of a pair).
  const clampToVisibleRange = (iso) => {
    if (iso < range.startISO) return range.startISO
    if (iso > range.endISO) return range.endISO
    return iso
  }

  const commitDeadline = (nextISO) => {
    clearTimeout(deadlineDebounceRef.current)
    // Recorded so an unmount BEFORE this timer fires can flush it — see the
    // cleanup effect above for the bug this fixes.
    pendingDeadlineCommitRef.current = nextISO
    deadlineDebounceRef.current = setTimeout(() => {
      pendingDeadlineCommitRef.current = null
      onCommitDeadline(nextISO)
        // F-6 "저장 실패 시 롤백이 시각적으로 드러나야 합니다(선이 원위치로)":
        // this component never optimistically wrote project.dueDate into any
        // cache — the drag's candidate value only ever lived in `deadlineDrag`
        // — so clearing it here (both on success AND failure) is enough to
        // make the line fall back to the last-confirmed `project.dueDate`.
        // The difference a person actually SEES is the toast: silent on
        // success (the line was already sitting at the right spot), an error
        // message on failure (same shape as useUpdateTaskSchedule's own
        // onError for a WBS bar's PATCH).
        .catch(() => toast({ tone: 'error', message: systemMessages.error.writeTitle }))
        .finally(() => setDeadlineDrag(null))
    }, COMMIT_DEBOUNCE_MS)
  }

  // B2: shim = { clientX, pointerId, currentTarget, pointerType } —
  // withLongPressGate may call this well after the original pointerdown
  // event, so it never reads a raw event here.
  const startDeadlineDrag = ({ clientX, pointerId, currentTarget, pointerType }) => {
    if (disabled) return
    currentTarget.setPointerCapture(pointerId)
    // AI 리뷰 Should-fix (#68): pointerId를 ref에 저장해 둔다 — 아래
    // move/up/cancel이 "이 이벤트가 정말 이 손가락에서 왔는지"를 매번
    // 대조할 수 있어야, 활성화 이후 두 번째 손가락의 pointerup/cancel이
    // 이 드래그를 대신 끝내는 사고를 막을 수 있다. 모듈 변수에도 기록해
    // withLongPressGate가 "이미 활성 드래그가 있다"로 보고 다른 대기
    // 롱프레스의 시작을 막는다.
    //
    // AI 리뷰 Blocking (#68): 터치로 활성화된 경우에만 스크롤 차단 리스너를
    // 등록한다(마우스/펜은 애초에 이 핸들을 가로 스크롤과 동시에 움직일 일이
    // 없고, 요구사항상 마우스 경로에 영향이 없어야 한다). 이 ref 객체 하나에
    // 묶어 두면 up/cancel/unmount 어느 정리 경로에서도 pointerId와 함께 같은
    // 자리에서 해제할 수 있다.
    deadlineDragRef.current = {
      originX: clientX,
      originISO: effectiveDueDateISO,
      pointerId,
      touchScrollBlocker: pointerType === 'touch' ? startTouchScrollBlock() : null,
    }
    setActiveDragPointer(pointerId)
    setDeadlineTooltipVisible(true)
  }

  const onDeadlinePointerMove = (e) => {
    if (!deadlineDragRef.current) return
    // 이 드래그를 쥔 손가락이 아니면 무시 — 다른 포인터의 move가 좌표를
    // 오염시키지 않는다.
    if (e.pointerId !== deadlineDragRef.current.pointerId) return
    const { originX, originISO } = deadlineDragRef.current
    const dayDelta = Math.round((e.clientX - originX) / dayPx)
    if (dayDelta === 0) return
    setDeadlineDrag({ previewISO: clampToVisibleRange(addDaysISO(originISO, dayDelta)) })
  }

  // AI 리뷰 Should-fix (#68): 이벤트 인자를 받아야 pointerId를 대조할 수
  // 있다 — 원래 인자 없이 호출돼, 드래그 활성 중 다른 손가락의 pointerup이
  // 와도 무조건 "지금 preview를 커밋"했다.
  const onDeadlinePointerUp = (e) => {
    if (!deadlineDragRef.current) return
    if (e.pointerId !== deadlineDragRef.current.pointerId) return
    // AI 리뷰 Blocking (#68): dragRef를 비우기 전에 스크롤 차단 리스너부터
    // 해제한다 — 안 그러면 드래그가 끝난 뒤에도 타임라인 가로 스크롤이
    // 계속 막힌 채로 남는다.
    stopTouchScrollBlock(deadlineDragRef.current.touchScrollBlocker)
    deadlineDragRef.current = null
    clearActiveDragPointer(e.pointerId)
    if (deadlineDrag) commitDeadline(deadlineDrag.previewISO)
    setDeadlineTooltipVisible(false)
  }

  // B2: a touch drag the browser itself interrupted (it decided to scroll
  // instead) must NOT commit — unlike pointerup, there's no real "release at
  // this date" intent here, only an aborted gesture. Falls back to the last
  // committed `project.dueDate` by simply dropping the uncommitted preview.
  //
  // AI 리뷰 Should-fix (#68): 같은 이유로 pointerId를 대조한다 — 다른
  // 손가락의 cancel이 이 드래그까지 끝내지 않도록.
  const onDeadlinePointerCancel = (e) => {
    if (!deadlineDragRef.current) return
    if (e.pointerId !== deadlineDragRef.current.pointerId) return
    // AI 리뷰 Blocking (#68): 같은 이유로, cancel/lostpointercapture 경로도
    // 비우기 전에 리스너를 해제한다.
    stopTouchScrollBlock(deadlineDragRef.current.touchScrollBlocker)
    deadlineDragRef.current = null
    clearActiveDragPointer(e.pointerId)
    setDeadlineDrag(null)
    setDeadlineTooltipVisible(false)
  }

  const onDeadlineKeyDown = (e) => {
    if (disabled) return
    const map = { ArrowLeft: -1, ArrowRight: 1 }
    const delta = map[e.key]
    if (delta == null) return
    e.preventDefault()
    const nextISO = clampToVisibleRange(addDaysISO(effectiveDueDateISO, delta))
    setDeadlineDrag({ previewISO: nextISO })
    commitDeadline(nextISO)
    // Keyboard nudge has no pointerup of its own to clear the tooltip on —
    // flash it briefly instead (same 600ms as WbsBar's own keyboard flash).
    setDeadlineTooltipVisible(true)
    clearTimeout(deadlineTooltipFlashRef.current)
    deadlineTooltipFlashRef.current = setTimeout(() => setDeadlineTooltipVisible(false), 600)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-caption text-text-muted">
          {disabled && disabledReason ? disabledReason : null}
        </p>
        <WbsZoomControl zoomIndex={zoomIndex} onChange={setZoomIndex} />
      </div>
      <div className="flex">
        {/* Fixed task-name column (desktop 200px per spec; full-width stack on
            mobile falls back to a narrower label column — still fixed so the
            timeline's own horizontal scroll doesn't drag it along).

            F-3 (owner review 2026-07-23): [기간 설정] used to render INSIDE
            the scrolling timeline body, in the same flow position a bar
            would occupy for that row — so it visually sat "inside the
            period" the axis represents, and its on-screen spot depended on
            the computed day range (it drifted whenever that range changed).
            Moved here, into this already-fixed column, which by definition
            never moves regardless of horizontal scroll or any bar's length.

            F-4: completion is carried as `n.status` (attached by
            ProjectWorkspacePage from the task list, see that file's own
            comment) and shown as BOTH strikethrough on the title AND a
            "완료" text badge — never strikethrough alone (NFR-017), same
            pairing as TaskRow's own completed state. */}
        <div className="w-28 shrink-0 pt-14 md:w-[200px]">
          <ul className="flex flex-col">
            {nodes.map((n) => {
              const completed = n.status === 'COMPLETED'
              const unset = !n.plannedStartDate || !n.plannedEndDate
              return (
                <li key={n.taskId} className="flex h-10 items-center gap-1.5 pr-2">
                  <span
                    className={[
                      'min-w-0 flex-1 truncate text-label text-text',
                      completed ? 'text-text-muted line-through' : '',
                    ].join(' ')}
                  >
                    {n.title}
                  </span>
                  {/* H-3 (owner review 2026-07-24): the 태스크 탭's "완료"
                      Badge is deliberately NOT repeated here — the owner
                      wants strikethrough ALONE in the 계획 탭. That's a
                      narrower visual signal than TaskRow's own (badge +
                      strikethrough), so a screen reader — which gets
                      NOTHING from a CSS text-decoration — needs its own
                      substitute: this sr-only text carries the exact same
                      "완료" meaning the removed Badge used to (NFR-017's
                      underlying point survives even when its literal
                      "don't rely on color alone" wording doesn't apply to a
                      pure line-through). */}
                  {completed && <span className="sr-only">완료</span>}
                  {!unset && (
                    // G-9 (owner review 2026-07-24): "기간설정 해제 버튼" —
                    // the counterpart to [기간 설정] below, for a row that
                    // already has one. Clears BOTH date fields through the
                    // exact same `onCommitRange`/updateTaskSchedule path a
                    // drag commits through — no new endpoint — so the WBS
                    // response reads it back as unset (`plannedStartDate:
                    // null`) exactly like a task that was never scheduled.
                    //
                    // H-2 (owner review 2026-07-24): "한눈에 안 들어옴" — 기간
                    // 설정(아래)과 이 버튼이 identical `secondary` styling
                    // made them read as equally-weighted, when 설정 is the
                    // constructive action and 해제 undoes it. `secondary`
                    // stays here (a quiet, reversible-feeling action) —
                    // explicitly NOT `danger`: this only clears a date
                    // range, nothing is deleted, and TaskRow's own 삭제
                    // button already owns danger-red on this same screen.
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={disabled}
                      onClick={() =>
                        onCommitRange(n.taskId, { plannedStartDate: null, plannedEndDate: null })
                      }
                    >
                      기간 해제
                    </Button>
                  )}
                  {unset && (
                    // H-2: `primary` — the constructive counterpart to
                    // 기간 해제's `secondary` above, same hierarchy Button's
                    // own variant scheme already encodes elsewhere (primary
                    // = the main action on a surface, secondary = a lesser
                    // one) rather than inventing a new visual distinction.
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={disabled}
                      onClick={() => {
                        const start = todayISO
                        const days = Math.max(1, Math.round((n.estimatedMinutes ?? 60) / (8 * 60)))
                        onCommitRange(n.taskId, {
                          plannedStartDate: start,
                          plannedEndDate: addDaysISO(start, days - 1),
                        })
                      }}
                    >
                      기간 설정
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>

        {/* The ONLY horizontally-scrolling container (tokens §3 — body never
            scrolls sideways). */}
        <div ref={timelineRef} className="min-w-0 flex-1 overflow-x-auto">
          <div style={{ width: range.days.length * dayPx, position: 'relative' }}>
            {/* F-5 (owner review 2026-07-23): "마감" used to sit INSIDE that
                one day's header cell, stacked under its own date text —
                easy to miss and easy to misread as belonging to the date
                rather than to the deadline boundary. This thin strip is
                dedicated ONLY to that chip, anchored to the line's exact x
                position, so it's never confused with a day's own label —
                empty (no other content) on every project without a due
                date, or on any day that isn't the deadline. */}
            <div className="relative h-5">
              {/* Decorative only (aria-hidden) — the interactive drag
                  handle below carries the real aria-label; this chip would
                  otherwise be announced a second time. */}
              {deadlineIndex != null && deadlineIndex >= 0 && deadlineIndex < range.days.length && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-control bg-danger-100 px-1.5 py-0.5 text-caption font-medium text-danger-700"
                  style={{ left: (deadlineIndex + 1) * dayPx }}
                >
                  마감
                </span>
              )}
            </div>

            {/* Day header row — two fixed lines (date, weekday) per column,
                see dayAxisParts's own comment for why NEITHER line is ever
                conditionally hidden for a single day (that's what caused the
                old wrap-jump). G-8: every column always gets its own label
                now — no more every-other-day thinning (see the comment
                above `dayPx`). */}
            <div className="flex h-9">
              {range.days.map((dateISO) => {
                const { date, weekday } = dayAxisParts(dateISO)
                const isToday = dateISO === todayISO
                return (
                  <div
                    key={dateISO}
                    style={{ width: dayPx }}
                    className={[
                      'shrink-0 border-b border-border text-center text-caption leading-tight text-text-muted',
                      WEEKEND_COLUMN_INDICES.has((parseISODate(dateISO).getDay() + 6) % 7)
                        ? 'bg-surface-sunken'
                        : '',
                      isToday ? 'border-t-2 border-t-brand-300' : '',
                    ].join(' ')}
                  >
                    {isToday ? (
                      <span className="block whitespace-nowrap font-medium text-brand-700">오늘</span>
                    ) : (
                      <>
                        <span className="block whitespace-nowrap">{date}</span>
                        <span className="block whitespace-nowrap">{weekday}</span>
                      </>
                    )}
                  </div>
                )
              })}
            </div>

            {deadlineIndex != null && deadlineIndex >= 0 && deadlineIndex < range.days.length && (
              <>
                {/* F-6 (owner review 2026-07-24): "마감 전/후를 선 하나가 아니라
                    영역 대비로 구분" — a flat color fill would still be
                    color-only (NFR-017), so a repeating diagonal hatch is
                    layered on top of the tint; a bar that itself crosses the
                    deadline keeps its OWN "마감 이후" text (WbsBar, below,
                    unchanged) as the row-level textual cue. Starts at
                    `top-14` (flag strip's 20px + header's 36px = 56px) so it
                    never washes out the axis labels above it. */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute top-14 bottom-0 bg-danger-50/70 [background-image:repeating-linear-gradient(135deg,var(--color-danger-100)_0_4px,transparent_4px_12px)]"
                  style={{
                    left: (deadlineIndex + 1) * dayPx,
                    width: (range.days.length - (deadlineIndex + 1)) * dayPx,
                  }}
                />

                {/* The thin visual boundary line itself — never the drag
                    target on its own (a 2px hit box fails every pointer
                    precision guideline); see the wide interactive handle
                    just below for that.

                    G-6 (owner review 2026-07-24, bug fix): this was
                    `border-danger-300` — a shade this palette's danger scale
                    never actually defines (tokens.md/index.css only has
                    50/100/500/600/700), so the class compiled to NO rule at
                    all and the line fell back to the browser's default
                    border color (currentColor — effectively black). Same
                    root cause hit the past-deadline bar border below
                    (`danger-400`, also undefined) — both now point at
                    `danger-500`, an existing token.

                    G-7: extended from `top-14` (below the axis) to `top-0`
                    (through the flag strip AND the date header) so the line
                    visibly connects down to the exact date it marks,
                    instead of starting only where the row bodies begin. */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute top-0 bottom-0 border-l-2 border-danger-500"
                  style={{ left: (deadlineIndex + 1) * dayPx }}
                />

                {/* F-6: the deadline is now draggable — day-snap (NOT the
                    5-minute weekly-calendar grid), same debounced-commit
                    shape as a WBS bar's own drag (COMMIT_DEBOUNCE_MS above).
                    Hit area is widened past the visual 2px line (same "hit
                    area wider than the visual" rule the bar resize handles
                    already use) but DELIBERATELY capped to the axis zone
                    (`top-0 h-14` = the flag strip + header, matching the
                    "마감" chip's own home) rather than the full column
                    height: a full-height strip would sit on top of any
                    WbsBar whose own edge happens to land near this same x
                    position, stealing that bar's resize-handle clicks. */}
                <div
                  role="button"
                  aria-label={`마감일 조절, 현재 ${monthDayKO(effectiveDueDateISO)}`}
                  aria-live="polite"
                  tabIndex={disabled ? -1 : 0}
                  onKeyDown={onDeadlineKeyDown}
                  // Deferred to event time (not called inline during render,
                  // which the react-hooks/refs rule flags since
                  // startDeadlineDrag touches a ref) — see the resize spans
                  // below for the identical shape.
                  onPointerDown={(e) => withLongPressGate(startDeadlineDrag)(e)}
                  onPointerMove={onDeadlinePointerMove}
                  onPointerUp={onDeadlinePointerUp}
                  onPointerCancel={onDeadlinePointerCancel}
                  // 리드 셀프리뷰 지적: setPointerCapture로 잡은 캡처를
                  // 브라우저가 중간에 뺏어가도(다른 요소가 가로채거나, 포인터
                  // 자체가 비정상 종료되는 경우) pointerup/pointercancel 중
                  // 어느 쪽도 안 올 수 있다 — 그러면 activeDragPointerId가
                  // 똑같이 영영 남는다. cancel과 같은 정리 경로로 묶어 둔다.
                  onLostPointerCapture={onDeadlinePointerCancel}
                  // 리드 셀프리뷰 후속: 이 손잡이엔 데스크톱 우클릭 메뉴가
                  // 원래 없지만(그래서 기존엔 onContextMenu 자체가 없었다),
                  // 터치 롱프레스가 네이티브 contextmenu를 띄우면 드래그가
                  // 활성화된 바로 그 순간 시스템 메뉴가 화면을 덮는다 —
                  // preventDefault만으로 막는다(열 메뉴가 없으니 분기도
                  // 필요 없다).
                  onContextMenu={(e) => e.preventDefault()}
                  style={{
                    left: (deadlineIndex + 1) * dayPx,
                    touchAction: 'pan-x pan-y',
                    WebkitTouchCallout: 'none',
                  }}
                  className={[
                    'absolute top-0 z-10 h-14 w-6 select-none -translate-x-1/2 md:w-11',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
                    disabled ? 'cursor-default' : 'cursor-ew-resize',
                  ].join(' ')}
                />

                {/* Live drag tooltip — same floating-chip pattern as
                    WbsBar's own preview tooltip, reused rather than
                    invented fresh. (The "시작일보다 이릅니다" warning that
                    used to render here is gone — see the comment above
                    `clampToVisibleRange`, ②.)

                    H-1 (owner review 2026-07-24): "더 연하게, 반투명하게" —
                    `bg-neutral-900` alone read as too heavy against the
                    timeline. `/85` is Tailwind's own color-mix opacity
                    modifier on that SAME token (no new color), kept high
                    enough that `text-white` on top still passes contrast —
                    the whole point of this chip is reading a date WHILE
                    dragging, so it can be lighter but not so light it stops
                    working. */}
                {deadlineTooltipVisible && (
                  <span
                    className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap rounded-control bg-neutral-900/70 px-2 py-1 text-caption text-white shadow-popover"
                    style={{ left: (deadlineIndex + 1) * dayPx, top: '3.75rem' }}
                  >
                    마감: {monthDayKO(effectiveDueDateISO)}
                  </span>
                )}
              </>
            )}

            <ul className="flex flex-col">
              {/* F-3: a 미설정 row now renders NOTHING here — its [기간 설정]
                  CTA lives in the fixed column instead (see that column's own
                  comment). A row with no schedule has no bar to show on this
                  axis at all; the empty slot just waits for one to appear. */}
              {nodes.map((node) => (
                <li key={node.taskId} className="relative h-10 border-b border-border/60">
                  {node.plannedStartDate && node.plannedEndDate && (
                    <WbsBar
                      node={node}
                      range={range}
                      dayPx={dayPx}
                      disabled={disabled}
                      deadlineIndex={deadlineIndex}
                      onCommit={onCommitRange}
                    />
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

/*
  +/− zoom control (see `ZOOM_STEPS`'s own header comment). Same 44px
  circular-button shape as MinuteStepper's own −/+ pair (plan/MinuteStepper.jsx)
  — reused for visual consistency rather than invented fresh — with the
  current zoom read out as a percentage `aria-live` region so a screen reader
  hears the change the same way MinuteStepper's own value announcement works,
  not just a silent pixel-width shift.
*/
function WbsZoomControl({ zoomIndex, onChange }) {
  const btn =
    'flex h-11 w-11 items-center justify-center rounded-full border border-border text-lg text-text transition-colors hover:bg-surface-sunken disabled:opacity-40 disabled:hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring'
  return (
    <div className="inline-flex shrink-0 items-center gap-2">
      <button
        type="button"
        aria-label="타임라인 축소"
        onClick={() => onChange(Math.max(0, zoomIndex - 1))}
        disabled={zoomIndex === 0}
        className={btn}
      >
        −
      </button>
      <span className="min-w-11 text-center text-caption tabular-nums text-text-muted" aria-live="polite">
        {Math.round(ZOOM_STEPS[zoomIndex] * 100)}%
      </span>
      <button
        type="button"
        aria-label="타임라인 확대"
        onClick={() => onChange(Math.min(ZOOM_STEPS.length - 1, zoomIndex + 1))}
        disabled={zoomIndex === ZOOM_STEPS.length - 1}
        className={btn}
      >
        +
      </button>
    </div>
  )
}

/*
  A single draggable bar. Local state (`preview`) holds an in-progress drag's
  candidate range so the bar can render its live position at 60fps without a
  round-trip through the query cache on every pointermove — onCommit (the
  page's optimistic-mutation hook) is only called on release/keyup, matching
  the calendar grid's own "commit on drop" shape.
*/
function WbsBar({ node, range, dayPx, disabled, deadlineIndex, onCommit }) {
  const [preview, setPreview] = useState(null) // { start, end, mode } | null
  // G-10 (owner review 2026-07-24, bug fix): the tooltip below used to key
  // off `preview` alone, which this component intentionally keeps set past
  // the drag's end (it's what lets the bar keep showing the DRAGGED-TO
  // position while the debounced PATCH is still in flight, rather than
  // snapping back to the stale `node` prop for that ~500ms+network window).
  // That's correct for the BAR's position, but wrong for the TOOLTIP — a
  // person expects the floating date chip to disappear the moment they let
  // go, not linger until the write settles (and previously it never even
  // did that — nothing ever cleared `preview`, so the tooltip was left
  // behind PERMANENTLY on every bar ever dragged). `isDragging` is a
  // separate, deliberately short-lived flag for exactly the tooltip's own
  // visible window: true only while a pointer drag is actually held down,
  // or briefly flashed after a keyboard nudge.
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef(null) // { mode, originStart, originEnd, originX }
  const debounceRef = useRef(null)
  const tooltipFlashRef = useRef(null)
  // MAJOR bug fix (Thomas code review): the latest NOT-YET-SENT drag/nudge
  // patch, so the unmount cleanup below can FLUSH it instead of silently
  // discarding it — see that cleanup's own comment.
  const pendingCommitRef = useRef(null) // { plannedStartDate, plannedEndDate } | null
  // Ref-indirection (same pattern as Dialog.jsx's own onCloseRef, and this
  // file's own deadline-drag fix above): keeps the cleanup effect's deps
  // array EMPTY (fire only on true unmount) while still reading the CURRENT
  // onCommit rather than closing over a stale one.
  const onCommitRef = useRef(onCommit)
  useEffect(() => {
    onCommitRef.current = onCommit
  })

  useEffect(() => () => {
    clearTimeout(debounceRef.current)
    clearTimeout(tooltipFlashRef.current)
    // MAJOR bug fix (Thomas code review): this used to ONLY clearTimeout
    // the pending debounced PATCH — when this bar's own row unmounts
    // mid-debounce (closing the drawer, switching tabs, collapsing this
    // accordion row, or expanding a different one, all within the 500ms
    // window), the write was canceled outright with no record it ever
    // happened, silently losing a real drag/keyboard change. Flushing it
    // here instead guarantees the last dragged/nudged value is never lost;
    // TanStack's `mutate` (this hook's own `onCommit`) runs through the
    // QueryClient, not this component, so it still fires/invalidates
    // correctly even after this component is gone.
    if (pendingCommitRef.current) {
      const patch = pendingCommitRef.current
      pendingCommitRef.current = null
      onCommitRef.current(node.taskId, patch)
    }
    // 리드 셀프리뷰 지적: 같은 이유로, 터치 드래그 도중 이 바 자신이
    // 언마운트되면 onPointerUp/onPointerCancel이 다시는 오지 않아
    // activeDragPointerId가 영영 남는다 — 위 deadline cleanup과 동일한
    // 구멍. 언마운트 시점에 이 바가 쥐고 있던 드래그가 있었다면 여기서
    // 대신 지운다.
    //
    // AI 리뷰 Blocking (#68): 같은 이유로 스크롤 차단 리스너도 먼저
    // 해제한다 — 안 그러면 이 바가 사라져도 window의 non-passive touchmove
    // 리스너가 남아 타임라인 가로 스크롤을 계속 막는다.
    if (dragRef.current) {
      stopTouchScrollBlock(dragRef.current.touchScrollBlocker)
      clearActiveDragPointer(dragRef.current.pointerId)
    }
    // `node.taskId` (not `node`): this bar is keyed by taskId in the parent
    // list, so a MOUNTED instance's taskId value never actually changes
    // (only `node`'s own object identity does, on every WBS refetch) —
    // listing the stable primitive satisfies exhaustive-deps without ever
    // causing this cleanup to re-run on an unrelated re-render.
  }, [node.taskId])

  const start = preview?.start ?? node.plannedStartDate
  const end = preview?.end ?? node.plannedEndDate
  const { left, width } = barRectDays(range.startISO, start, end)
  const pastDeadline = deadlineIndex != null && left + width - 1 > deadlineIndex

  const commit = (nextStart, nextEnd) => {
    clearTimeout(debounceRef.current)
    // Recorded so an unmount BEFORE this timer fires can flush it — see the
    // cleanup effect above for the bug this fixes.
    pendingCommitRef.current = { plannedStartDate: nextStart, plannedEndDate: nextEnd }
    debounceRef.current = setTimeout(() => {
      pendingCommitRef.current = null
      onCommit(node.taskId, {
        plannedStartDate: nextStart,
        plannedEndDate: nextEnd,
      })
    }, COMMIT_DEBOUNCE_MS)
  }

  // Keyboard nudges have no natural "release" event to clear the tooltip on
  // (unlike a pointer drag's own pointerup) — a fixed-length flash stands in
  // for one, so a screen still SHOWS the momentary date change without the
  // chip sticking around indefinitely.
  const flashTooltip = () => {
    setIsDragging(true)
    clearTimeout(tooltipFlashRef.current)
    tooltipFlashRef.current = setTimeout(() => setIsDragging(false), 600)
  }

  // A plain synchronous function (not a curried factory returning a closure)
  // called directly from each real, inline event handler below — the
  // straightforward shape react-hooks/refs expects for "this ref write only
  // ever happens inside an event handler, never during render".
  //
  // B2: shim = { clientX, pointerId, currentTarget, pointerType }, same
  // reasoning as WbsTimeline's own startDeadlineDrag above — withLongPressGate
  // may call this after the triggering pointerdown event is long gone.
  const startDrag = (mode, { clientX, pointerId, currentTarget, pointerType }) => {
    if (disabled) return
    currentTarget.setPointerCapture(pointerId)
    // AI 리뷰 Should-fix (#68): pointerId를 저장해 move/up/cancel이 "이
    // 이벤트가 정말 이 손가락에서 왔는지" 매번 대조하게 한다 — 같은 바를
    // 롱프레스로 드래그 중일 때 두 번째 손가락이 짚었다 떼면, 원래는 그
    // 손가락의 pointerup/cancel이 이 드래그를 대신 끝내고 그 시점 preview를
    // 커밋해 버렸다(리사이즈 손잡이도 이 함수를 그대로 쓰므로 함께
    // 커버된다). 모듈 변수에도 기록해 withLongPressGate가 다른 바의 새
    // 대기 롱프레스 시작을 막는다.
    //
    // AI 리뷰 Blocking (#68): 터치로 활성화된 경우에만 스크롤 차단 리스너를
    // 등록한다 — 리사이즈 손잡이(span)도 이 함수를 그대로 호출하므로 함께
    // 커버된다. 마우스/펜 경로는 pointerType이 'touch'가 아니므로 이 등록
    // 자체를 건너뛰어 영향이 없다.
    dragRef.current = {
      mode,
      originStart: start,
      originEnd: end,
      originX: clientX,
      pointerId,
      touchScrollBlocker: pointerType === 'touch' ? startTouchScrollBlock() : null,
    }
    setActiveDragPointer(pointerId)
    setIsDragging(true)
  }

  const onPointerMove = (e) => {
    if (!dragRef.current) return
    // 이 드래그를 쥔 손가락이 아니면 무시.
    if (e.pointerId !== dragRef.current.pointerId) return
    const { mode, originStart, originEnd, originX } = dragRef.current
    const dayDelta = Math.round((e.clientX - originX) / dayPx)
    if (dayDelta === 0) return
    let nextStart
    let nextEnd
    if (mode === 'move') {
      nextStart = addDaysISO(originStart, dayDelta)
      nextEnd = addDaysISO(originEnd, dayDelta)
    } else if (mode === 'start') {
      ;[nextStart, nextEnd] = clampRange(addDaysISO(originStart, dayDelta), originEnd)
    } else {
      ;[nextStart, nextEnd] = clampRange(originStart, addDaysISO(originEnd, dayDelta))
    }
    setPreview({ start: nextStart, end: nextEnd, mode })
  }

  // AI 리뷰 Should-fix (#68): 이벤트 인자를 받도록 바꿔야 pointerId를 대조할
  // 수 있다 — 원래 인자 없이 호출돼, 드래그 활성 중 다른 손가락의 pointerup
  // 이 와도 무조건 preview를 커밋했다(바로 위 startDrag가 저장한
  // dragRef.current.pointerId와 대조).
  const onPointerUp = (e) => {
    if (!dragRef.current) return
    if (e.pointerId !== dragRef.current.pointerId) return
    // AI 리뷰 Blocking (#68): dragRef를 비우기 전에 스크롤 차단 리스너부터
    // 해제한다 — 안 그러면 드래그가 끝난 뒤에도 타임라인 가로 스크롤이
    // 계속 막힌 채로 남는다.
    stopTouchScrollBlock(dragRef.current.touchScrollBlocker)
    dragRef.current = null
    clearActiveDragPointer(e.pointerId)
    if (preview) commit(preview.start, preview.end)
    setIsDragging(false)
  }

  // B2: same reasoning as WbsTimeline's own onDeadlinePointerCancel — a
  // cancel means the BROWSER aborted this gesture (decided to scroll
  // instead), not the user releasing at a deliberate position, so the
  // uncommitted preview is discarded rather than committed. Clearing
  // `preview` (not just `dragRef`) matters: `start`/`end` above fall back to
  // `preview?.start ?? node.plannedStartDate`, so leaving a stale preview set
  // would freeze the bar at the aborted position forever.
  //
  // AI 리뷰 Should-fix (#68): 같은 이유로 pointerId를 대조한다 — 다른
  // 손가락의 cancel이 이 드래그까지 끝내지 않도록.
  const onPointerCancel = (e) => {
    if (!dragRef.current) return
    if (e.pointerId !== dragRef.current.pointerId) return
    // AI 리뷰 Blocking (#68): 같은 이유로, cancel/lostpointercapture 경로도
    // 비우기 전에 리스너를 해제한다.
    stopTouchScrollBlock(dragRef.current.touchScrollBlocker)
    dragRef.current = null
    clearActiveDragPointer(e.pointerId)
    setPreview(null)
    setIsDragging(false)
  }

  const onKeyDown = (e) => {
    if (disabled) return
    const map = { ArrowLeft: -1, ArrowRight: 1 }
    const delta = map[e.key]
    if (delta == null) return
    e.preventDefault()
    let nextStart
    let nextEnd
    if (e.shiftKey) {
      ;[nextStart, nextEnd] = clampRange(start, addDaysISO(end, delta))
    } else if (e.altKey) {
      ;[nextStart, nextEnd] = clampRange(addDaysISO(start, delta), end)
    } else {
      nextStart = addDaysISO(start, delta)
      nextEnd = addDaysISO(end, delta)
    }
    setPreview({ start: nextStart, end: nextEnd })
    commit(nextStart, nextEnd)
    flashTooltip()
  }

  const spanDays = diffDaysISO(start, end) + 1
  const label = `${node.title}, 기간 ${monthDayKO(start)}부터 ${monthDayKO(end)}`

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-live="polite"
      onKeyDown={onKeyDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      // 리드 셀프리뷰 지적: deadline 손잡이와 같은 이유로 — 캡처를 중간에
      // 뺏기면 pointerup/cancel 없이 드래그가 끊겨 activeDragPointerId가
      // 남는다. cancel과 같은 경로로 정리한다.
      onLostPointerCapture={onPointerCancel}
      // 리드 셀프리뷰 후속: WBS 바에는 원래 우클릭 메뉴가 없다 — 그래도 터치
      // 롱프레스가 일으키는 네이티브 contextmenu(시스템 공유/복사 팝업)는
      // 막아 둔다. 그대로 두면 드래그가 막 활성화된 순간 화면을 덮는다.
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => withLongPressGate((shim) => startDrag('move', shim))(e)}
      // 리드 셀프리뷰 지적 2: 길게 눌러 끄는 롱프레스 드래그 중 iOS 콜아웃
      // (복사/공유 팝업)이나 텍스트 선택이 끼어들면 드래그가 끊긴다.
      style={{
        left: left * dayPx,
        width: width * dayPx,
        touchAction: 'pan-x pan-y',
        WebkitTouchCallout: 'none',
      }}
      className={[
        'absolute top-1 flex h-7 select-none items-center rounded-chip border px-2 text-caption font-medium text-brand-900',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
        disabled ? 'cursor-default opacity-70' : 'cursor-grab active:cursor-grabbing',
        // G-6 (owner review 2026-07-24, bug fix): `danger-400` was never a
        // defined shade in this palette (see the deadline line's own
        // comment above) — the class compiled to nothing, so a
        // past-deadline bar's border silently fell back to black instead of
        // red. `danger-500` is an existing token.
        pastDeadline ? 'border-danger-500 bg-danger-100' : 'border-brand-400 bg-brand-200',
      ].join(' ')}
    >
      {/* G-5 (owner review 2026-07-24): the small grip mark that used to sit
          INSIDE each hit zone is gone — "양쪽 안에 바 같은 게 있는데 없애줘"
          was about that visual mark specifically, not the drag behavior
          itself. The zones below are exactly as wide as before (24px
          desktop / 44px mobile) and still call `startDrag('start'|'end')`
          — only their own decorative child span was removed, so resizing
          from either edge still works unchanged. */}
      <span
        onPointerDown={(e) => {
          e.stopPropagation()
          withLongPressGate((shim) => startDrag('start', shim))(e)
        }}
        style={{ touchAction: 'pan-x pan-y' }}
        className="absolute inset-y-0 left-0 w-6 cursor-ew-resize md:w-11"
        aria-hidden="true"
      />
      <span className="truncate">{node.title}</span>
      {pastDeadline && <span className="ml-1 shrink-0 text-danger-700">마감 이후</span>}
      <span
        onPointerDown={(e) => {
          e.stopPropagation()
          withLongPressGate((shim) => startDrag('end', shim))(e)
        }}
        style={{ touchAction: 'pan-x pan-y' }}
        className="absolute inset-y-0 right-0 w-6 cursor-ew-resize md:w-11"
        aria-hidden="true"
      />
      {/* H-1 (owner review 2026-07-24): same `/85` opacity treatment as the
          deadline handle's own tooltip — see that one's comment. */}
      {isDragging && preview && (
        <span className="pointer-events-none absolute -top-7 left-0 whitespace-nowrap rounded-control bg-neutral-900/70 px-2 py-1 text-caption text-white shadow-popover">
          {monthDayKO(start)} – {monthDayKO(end)} · {spanDays}일
        </span>
      )}
    </div>
  )
}

export default WbsTimeline
