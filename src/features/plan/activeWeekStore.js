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

export default useActiveWeekStartISO
