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

  const startDeadlineDrag = (e) => {
    if (disabled) return
    e.currentTarget.setPointerCapture(e.pointerId)
    deadlineDragRef.current = { originX: e.clientX, originISO: effectiveDueDateISO }
    setDeadlineTooltipVisible(true)
  }

  const onDeadlinePointerMove = (e) => {
    if (!deadlineDragRef.current) return
    const { originX, originISO } = deadlineDragRef.current
    const dayDelta = Math.round((e.clientX - originX) / dayPx)
    if (dayDelta === 0) return
    setDeadlineDrag({ previewISO: clampToVisibleRange(addDaysISO(originISO, dayDelta)) })
  }

  const onDeadlinePointerUp = () => {
    if (!deadlineDragRef.current) return
    deadlineDragRef.current = null
    if (deadlineDrag) commitDeadline(deadlineDrag.previewISO)
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
                  onPointerDown={startDeadlineDrag}
                  onPointerMove={onDeadlinePointerMove}
                  onPointerUp={onDeadlinePointerUp}
                  style={{ left: (deadlineIndex + 1) * dayPx }}
                  className={[
                    'absolute top-0 z-10 h-14 w-6 -translate-x-1/2 md:w-11',
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
  const startDrag = (mode, e) => {
    if (disabled) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { mode, originStart: start, originEnd: end, originX: e.clientX }
    setIsDragging(true)
  }

  const onPointerMove = (e) => {
    if (!dragRef.current) return
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

  const onPointerUp = () => {
    if (!dragRef.current) return
    dragRef.current = null
    if (preview) commit(preview.start, preview.end)
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
      onPointerDown={(e) => startDrag('move', e)}
      style={{ left: left * dayPx, width: width * dayPx }}
      className={[
        'absolute top-1 flex h-7 items-center rounded-chip border px-2 text-caption font-medium text-brand-900',
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
          startDrag('start', e)
        }}
        className="absolute inset-y-0 left-0 w-6 cursor-ew-resize md:w-11"
        aria-hidden="true"
      />
      <span className="truncate">{node.title}</span>
      {pastDeadline && <span className="ml-1 shrink-0 text-danger-700">마감 이후</span>}
      <span
        onPointerDown={(e) => {
          e.stopPropagation()
          startDrag('end', e)
        }}
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
