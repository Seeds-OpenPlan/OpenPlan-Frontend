import { useEffect, useSyncExternalStore } from 'react'
import { currentWeekStartISO } from './planTime'

/*
  Publishes "the week WeeklyPage is CURRENTLY showing" so a DIFFERENT
  component can subscribe to the exact same `weekPlanKey` WeeklyPage itself
  is reading, instead of independently re-deriving what it ASSUMES that key
  to be.

  WHY THIS EXISTS (owner report, 2026-10: TUT-07 정리 후 멈춤 조사) —
  TutorialOverlay's DELETE_SAMPLE completion check (usePlanData.js's
  `useWeekPlan`, see TutorialOverlay.jsx's own header) needs to read the SAME
  `weekPlan` cache entry WeeklyPage's own removal/undo mutations write to.
  Before this module, TutorialOverlay computed its OWN
  `currentWeekStartISO()` independently of WeeklyPage's `weekStartISO` state
  — the two values happen to agree today (both default to "this week,
  Monday-first," and the tutorial never navigates weeks), but "happen to
  agree" is an ASSUMPTION a future per-user week-start-day setting, a
  deep-linked week param, or simply a session that crosses midnight between
  WeeklyPage's mount and TutorialOverlay's render could quietly break —  at
  which point the two parts of the tutorial would be reading and writing
  TWO DIFFERENT cache entries, and DELETE_SAMPLE would stay stuck no matter
  what the user actually cleans up. Rather than leave that as an assumption
  to re-verify by hand every time either side's default changes, WeeklyPage
  now PUBLISHES its own `weekStartISO` here on every change, and any
  consumer reads that published value instead of re-deriving it — the two
  are now the SAME value by construction, not by coincidence.

  Shaped like utils/overlayStack.js's own module-level pub/sub (not
  localStorage-backed like tutorialProgressStore.js — this is pure
  in-memory, session-only UI state, not something that needs to survive a
  refresh): a plain mutable module variable + a listener `Set`, read via
  `useSyncExternalStore` so a subscriber re-renders exactly when the
  published value actually changes.

  Defaults to "this week" so a consumer reading this BEFORE WeeklyPage has
  ever mounted (e.g. TutorialOverlay while the user is still on an earlier,
  `/projects`-hosted step) gets a sane value rather than `undefined` — the
  same "this week" WeeklyPage itself would compute as ITS OWN initial state
  if it mounted right now.
*/

let activeWeekStartISO = currentWeekStartISO()
// 튜토리얼 3단계(캘린더에 배치) 2-1→2-2 하위 단계 판정용 — WeeklyPage의
// 미배치 패널이 지금 열려 있는가. `panelOpen`은 순수 로컬 state(URL에 안
// 남음, see WeeklyPage's own `openUnplaced`/`panelOpen` 주석)라 다른
// weekStartISO와 같은 이유로(아래 본 파일 헤더) 공유 저장소가 아니면
// TutorialOverlay가 전혀 읽을 방법이 없다 — "그 프로젝트 행이 펼쳐졌는가"는
// `?expanded=` URL로 읽을 수 있지만, 패널은 그런 URL 반영이 없다.
let unplacedPanelOpen = false
const listeners = new Set()

function notify() {
  listeners.forEach((listener) => listener())
}

/** The one writer — see `usePublishActiveWeek` below, WeeklyPage's own call site. */
export function setActiveWeekStartISO(weekStartISO) {
  if (activeWeekStartISO === weekStartISO) return
  activeWeekStartISO = weekStartISO
  notify()
}

/** Imperative read — for a caller that does not need to re-render on change
 * (none today; exported for symmetry with `getOverlayStackSnapshot` and for
 * a future non-React consumer). */
export function getActiveWeekStartISO() {
  return activeWeekStartISO
}

/** The one writer for `unplacedPanelOpen` — see `usePublishUnplacedPanelOpen`
 * below. */
export function setUnplacedPanelOpen(open) {
  if (unplacedPanelOpen === open) return
  unplacedPanelOpen = open
  notify()
}

export function getUnplacedPanelOpen() {
  return unplacedPanelOpen
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * WeeklyPage's OWN hook — publishes `weekStartISO` here every time it
 * changes (mount, ‹ › navigation, "이번 주" reset). No cleanup un-publishing
 * on unmount: leaving the LAST known value in place is more useful than
 * snapping back to "this week" the instant WeeklyPage unmounts (e.g.
 * TutorialOverlay briefly routing through a different step's screen) — the
 * very next real WeeklyPage mount publishes its own value again immediately
 * regardless.
 */
export function usePublishActiveWeek(weekStartISO) {
  useEffect(() => {
    setActiveWeekStartISO(weekStartISO)
  }, [weekStartISO])
}

/** React binding for a READER (TutorialOverlay). */
export function useActiveWeekStartISO() {
  return useSyncExternalStore(subscribe, getActiveWeekStartISO)
}

/**
 * WeeklyPage's OWN hook — publishes `panelOpen` every time IT changes.
 * UNLIKE `usePublishActiveWeek` above, this ONE resets to `false` on
 * unmount — "panel open" stops meaning anything the instant WeeklyPage
 * itself goes away (navigating off /weekly), unlike "which week" (a value
 * worth remembering even while the page showing it isn't mounted).
 */
export function usePublishUnplacedPanelOpen(panelOpen) {
  useEffect(() => {
    setUnplacedPanelOpen(panelOpen)
  }, [panelOpen])
  // SEPARATE effect with an EMPTY dep array — its cleanup only ever runs on
  // actual UNMOUNT, not on every `panelOpen` toggle (unlike bundling this
  // into the effect above, whose cleanup would otherwise fire-then-
  // immediately-re-fire on every single toggle, a harmless but wasteful
  // double notify).
  useEffect(() => {
    return () => setUnplacedPanelOpen(false)
  }, [])
}

/** React binding for a READER (TutorialOverlay). */
export function useUnplacedPanelOpen() {
  return useSyncExternalStore(subscribe, getUnplacedPanelOpen)
}

export default useActiveWeekStartISO
