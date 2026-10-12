import { useEffect, useRef } from 'react'

/*
  Tiny pub/sub for "a tutorial-relevant save just succeeded" — the signal that
  lets the coachmark (TutorialOverlay) auto-advance instead of waiting for a
  manual [다음] click (owner-approved redesign, 2026-10: "단계마다 할 일 창을
  자동으로 열어 주고, 실제로 해내면 자동으로 다음 단계로 넘어가는 것").

  Deliberately NOT useSyncExternalStore-shaped like tutorialProgressStore.js —
  that module models a VALUE you can read at any time (the current step/target
  ids); this module models a STREAM of one-off occurrences with no "current
  value" to read back (there is nothing meaningful to return from a `getSnapshot`
  for "did a save just happen" — it already happened). A plain listener Set is
  the right shape for that, same as a DOM EventTarget would be.

  Every mutation hook below fires exactly ONE line into this stream at its own
  real success point (not optimistic — see each call site's own comment for
  why that specific line is the true "it worked" moment):
    - useCreateProject      → PROJECT_CREATED  { projectId }
    - useCreateTask         → TASK_CREATED     { projectId, taskId }
    - usePlaceTask          → TASK_PLACED      { taskId, planBlockId }
      (covers every real placement path — drag, keyboard quick-place, and the
      empty-slot "여기에 배치" menu — because all three call this ONE hook;
      see WeeklyPage.placeTaskAt)
    - useApplyAutoPlace     → TASK_PLACED      { taskId } (per placement — an
      auto-place batch can commit several tasks at once, and the tutorial only
      cares that SOME task matching its own saved id landed)
    - useCreateScheduleBlock→ SCHEDULE_CREATED { planBlockId, scheduleId }
      (`scheduleId` added for the B1 completion-check fix — see
      usePlanData.js's own emit call and TutorialOverlay.jsx's header)
    - useRemoveBlockWithUndo→ BLOCK_REMOVED    { planBlockId } (both 배치 해제
      and 일정 삭제 funnel through this one hook — see its own header)

  TutorialOverlay is the ONLY subscriber today, but this is a plain exported
  pub/sub (not a React context) so a future consumer (analytics, a different
  onboarding surface) can listen without this module knowing about it.
*/

export const TUTORIAL_EVENTS = {
  PROJECT_CREATED: 'PROJECT_CREATED',
  TASK_CREATED: 'TASK_CREATED',
  TASK_PLACED: 'TASK_PLACED',
  SCHEDULE_CREATED: 'SCHEDULE_CREATED',
  BLOCK_REMOVED: 'BLOCK_REMOVED',
}

const listeners = new Set()

/** Fired from a mutation's own success handler — see this file's header for
 * the exact call sites. `payload`'s shape depends on `type` (documented
 * per-event above). */
export function emitTutorialEvent(type, payload) {
  for (const listener of listeners) listener({ type, payload })
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * React binding. `handler` is read through a ref so a consumer can pass an
 * inline closure every render (capturing whatever local state it needs —
 * TutorialOverlay's handler closes over `activeStep`/`targets`) without this
 * hook re-subscribing on every one of those renders.
 */
export function useTutorialEvent(handler) {
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  }, [handler])
  useEffect(() => subscribe((event) => handlerRef.current(event)), [])
}

export default emitTutorialEvent
