import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog } from '../common/Dialog'
import { BottomSheet } from '../common/BottomSheet'
import { Button } from '../common/Button'
import { Coachmark } from './Coachmark'
import { useLockedIsDesktop } from '../../hooks/useMediaQuery'
import { useSession } from '../../features/auth/useAuth'
import { useOnboardingProgress, useUpdateOnboardingProgress } from '../../features/onboarding/useOnboarding'
import { useTutorialStep, useTutorialTargets } from '../../features/tutorial/tutorialProgressStore'
import { useTutorialEvent } from '../../features/tutorial/tutorialEvents'
import { TUTORIAL_STEPS } from '../../features/tutorial/tutorialSteps'
import { onboardingCopy } from '../../features/onboarding/onboardingCopy'
import { useWeekPlan } from '../../features/plan/usePlanData'
import { useActiveWeekStartISO } from '../../features/plan/activeWeekStore'

const KICKOFF_TITLE_ID = 'tutorial-kickoff-title'

/*
  OVL-TUT host — mounted once in AppLayout (same placement class as
  Toaster/UnsavedGuard: a single, always-present, self-gating overlay that
  renders nothing until its own condition is met).

  Two DIFFERENT state sources, on purpose:
  - `progress.tutorialCompleted` (server, via useOnboardingProgress) — the
    ONE field the real contract actually has (`tutorialDone`). Gates whether
    the tutorial runs at all.
  - `tutorialStep` (FE-only, via tutorialProgressStore's localStorage cursor)
    — which of the 6 coachmark steps is active. See that store's own header
    for the production bug this split fixes (PATCHing a step index the
    server has no column for used to silently no-op every "다음"/"시작하기"
    click and reset the step to 0 on the next normalized read).

  State machine (tutorialStep):
    0                          → not started: TUT-01 kickoff dialog (AC3).
    1..TUTORIAL_STEPS.length    → TUT-03~08, one Coachmark each (n/6 = TUT-03
                                  is n=1 of 6, per tutorialSteps.js's order).
    completed/skipped          → renders nothing (tutorialCompleted:true).

  GUIDED ACTIONS (owner-approved redesign, 2026-10 — supersedes this file's
  OLD self-paced design; the OLD [한계] here worried that real-time detection
  would mean subscribing to ProjectsPage/WeeklyPage's own TanStack Query
  caches from here and diffing them per step. That coupling never had to
  happen: every mutation hook instead fires ONE line into a shared event
  stream, tutorialEvents.js, at its own real success point, and this file
  only subscribes to that stream — it never reaches into either screen's
  query cache directly). Two effects do the actual work:

    1. NAVIGATE + REQUEST — the `useEffect` below, keyed on `activeStep`
       alone, fires once per step: it navigates to the step's route WITH the
       step's own `buildSearch(targets, nonce)` query string appended (e.g.
       `?create=3`) — the "open the real UI for me" request (tutorialSteps.js
       header explains why a query param, not a new side-channel). Unlike the
       OLD version, this is UNCONDITIONAL (not gated on `location.pathname
       !== activeStep.route`): TUT-05/06/07 all share `/weekly`, so a step
       change between them is a search-only navigation that must still fire
       even though the pathname never changes — gating on pathname would
       silently skip the request for every one of those three. Still fires at
       most ONCE per step (`lastNavigatedStepRef`, unchanged) — this never
       fights a user who navigates AWAY mid-step.
    2. COMPLETION — `useTutorialEvent` below watches every tutorial event;
       when one matches the CURRENT step's own `event`/`matches` rule
       (tutorialSteps.js), it records whatever `captureTarget` returns (the
       id the NEXT step needs) and advances immediately, no click required.
       DELETE_SAMPLE (TUT-07) does NOT go through this event path at all —
       see its own block below for why, and for the STATE-based rule that
       replaces it.

  DELETE_SAMPLE (TUT-07) completion — STATE, not an event log (Thomas code
  review BLOCKER, fixed 2026-10). The ORIGINAL version accumulated
  BLOCK_REMOVED events into `targets.removedBlockIds` and treated "every id
  this run ever recorded has appeared in that accumulated list at least
  once" as done. That broke in two ways: (a) `useRemoveBlockWithUndo`'s own
  실행 취소 (undo) recreates the block under a brand-new `planBlockId` without
  firing any event, so an undone removal still read as "removed" forever —
  the accumulated list never un-records anything; and (b) the LAST removal
  satisfied the rule and advanced the very instant it fired, racing ahead of
  the undo toast's own 6-second window instead of waiting it out.

  The fix judges the CURRENT state of the week's own block list instead of
  a log of past events: `targets.taskId` (captured at ADD_TASK, step 2 — see
  tutorialSteps.js) and `targets.scheduleId` (captured at ADD_SCHEDULE, step
  4) are RESOURCE ids, not block ids — unlike `planBlockId`, a resource id is
  the SAME before and after an undo-recreate (the server makes a new block
  but the same task/schedule), so "neither id's block exists in the current
  weekPlan cache" is naturally un-done the instant an undo's recreate lands,
  with no event bookkeeping required. `useWeekPlan` below is enabled ONLY
  while this step is active, which both scopes the extra subscription to
  exactly when it's useful and makes it REACTIVE — a remove/recreate's own
  cache writes (optimistic or post-invalidate-refetch) re-render this
  component the same way they re-render WeeklyPage. Satisfying that state
  check advances IMMEDIATELY (owner decision, 2026-10 — an earlier version
  additionally waited out the undo toast's own 6-second window before
  advancing, with a "정리 완료 — 잠시 후…" line explaining the wait; the
  owner had both removed — see the DELETE_SAMPLE effect further below for
  the trade-off this accepts). Fixing (b) no longer matters UNDER THIS
  rule either way: (b) was specifically the OLD event-log's own race
  against the undo window, which this STATE-based rule never has (it has
  no "last removal" moment to race against — it just reads whatever is
  true RIGHT NOW).

  [이전]/[다음] REMOVED (owner decision, 2026-10) — every non-last step now
  ONLY ever advances from detection (event or state, see the table below),
  never a manual click. The removed [다음] used to ALSO serve as a safety
  valve for one real scenario: a SECOND browser tab running the same
  tutorial writes to the SAME localStorage key (tutorialProgressStore.js),
  but THIS tab's event stream has no way to see THAT tab's success. Losing
  that valve is an explicit, accepted trade-off — [건너뛰기] (still a real
  button, every step) is now the ONLY way out of a step that, for whatever
  reason, never detects its own completion. [완료] also stays, but ONLY on
  the LAST step (TUT-08 has nothing to auto-detect at all — it is a plain
  "you're done" screen, so a manual click is the ONLY way it ever ends).

  PER-STEP COMPLETION — EVENT, now with a STATE-based safety net wherever
  one is both FEASIBLE and UNAMBIGUOUS (owner decision, 2026-10: "사용자가
  할 일을 이미 해냈는데 이벤트를 놓치면 진행할 방법이 사라지는 위험" — the
  event path, see point 2 above, is already structurally reliable — it is
  called SYNCHRONOUSLY from inside the very mutation that performs the
  action, not a network callback that could silently drop — but a second,
  independent STATE check costs little wherever one exists and closes the
  gap for any future bug in that path too):
    - CREATE_PROJECT / ADD_TASK — EVENT ONLY, by judgment call (see
      tutorialSteps.js's own header for why: CREATE_PROJECT has no PRIOR id
      to disambiguate "a project" from "the sample project" — any state
      check would have to guess, and guessing wrong risks pointing a LATER
      step at a real, unrelated project (the exact risk §7 below already
      rejects for a different reason). ADD_TASK COULD check "does
      targets.projectId's own task list have ≥1 task" — the project is
      guaranteed fresh/empty at this step's start, so that check itself
      would be safe — but picking WHICH task to capture as `targets.taskId`
      for PLACE_TASK's own later check turns ambiguous the moment more than
      one task exists, for a marginal gain over an already-reliable event.
      Reported, not implemented; a follow-up can revisit if still wanted.
    - PLACE_TASK / ADD_SCHEDULE — EVENT, now ALSO independently satisfied by
      reading the CURRENT weekPlan cache (`weekPlanQuery` below, the SAME
      subscription DELETE_SAMPLE already uses — broadened to cover these two
      steps too): PLACE_TASK checks "a block with `taskId === targets.taskId`
      exists right now" (the id is already reliably captured at ADD_TASK);
      ADD_SCHEDULE has no such PRIOR id (same reason as ADD_TASK above), so
      it instead snapshots every SCHEDULE block's id the INSTANT this step
      is entered (`scheduleBaselineIds`) and is satisfied the moment a
      SCHEDULE block NOT in that snapshot appears — "a new one showed up
      since I started watching" needs no id captured beforehand.
    - DELETE_SAMPLE — STATE ONLY (B1 fix, unchanged by this redesign, see
      its own block below).

  §7 (오너 보고용 판단 — a STALE cursor from BEFORE this redesign, with no
  recorded target ids): handled by loosening each step's own `matches` to
  "any event of the right TYPE counts" once `targets` is missing the id it
  would otherwise narrow by (tutorialSteps.js). That still requires a real
  action of the right kind — unlike silently substituting "the user's most
  recent project", which risked pointing TUT-07's delete instructions at a
  REAL, unrelated project/task — while never permanently trapping the user
  on an id this run never captured. The one case with NOTHING left to
  verify — DELETE_SAMPLE with BOTH ids missing — does bypass the gate
  outright (`deleteRequiredIds.length === 0` below): there is no real
  action left to require.
*/
export function TutorialOverlay() {
  const navigate = useNavigate()
  const sessionQuery = useSession()
  const progressQuery = useOnboardingProgress()
  const updateProgress = useUpdateOnboardingProgress()
  const [tutorialStep, setTutorialStep, resetTutorialStep] = useTutorialStep(sessionQuery.data?.userId)
  const [targets, patchTargets] = useTutorialTargets(sessionQuery.data?.userId)
  const kickoffConfirmRef = useRef(null)
  const lastNavigatedStepRef = useRef(null)
  // Monotonic counter, incremented on every REAL request (the step-change
  // effect below AND every [다시 열기] click) — see tutorialSteps.js's own
  // header on `buildSearch(targets, nonce)` for the bug this fixes (owner
  // report, 2026-10: "할 일 창이 자동으로 열릴 때도 있고 안 열릴 때도
  // 있다"). Deliberately a REF, not state: bumping it must never itself
  // trigger a re-render — it only matters at the instant `requestUrl` is
  // about to be used for an ACTUAL navigation.
  const requestNonceRef = useRef(0)

  const progress = progressQuery.data
  const running = Boolean(progress?.onboardingCompleted && !progress.tutorialCompleted)
  const stepIndex = tutorialStep - 1 // -1 while still at kickoff (tutorialStep 0)
  const activeStep = running && stepIndex >= 0 ? TUTORIAL_STEPS[stepIndex] : null
  // D1: locked ONLY while the KICKOFF dialog itself is open (owner report,
  // 2026-10: "뷰포트 폭을 바꾸면 화면이 바뀌지 않는다") — an earlier version
  // passed `running`, which stays true for the tutorial's ENTIRE run, not
  // just the kickoff. `useLockedIsDesktop`'s own contract only re-latches
  // on an `open` FALSE→TRUE edge and otherwise freezes the value for as
  // long as `open` stays true — so a `running`-wide `open` froze `isDesktop`
  // once at mount and then NEVER updated again for the rest of the run,
  // even on a coachmark step with no Dialog/BottomSheet in sight at all. The
  // lock is only actually needed while THIS component's own Dialog/
  // BottomSheet (the kickoff dialog below) is mounted — same reasoning as
  // every other `useLockedIsDesktop` call in this codebase (a fold mid-drag
  // must not swap a mounted modal's shell out from under it) — so `open`
  // here is narrowed to exactly that window. `isDesktop` is unused for
  // anything else in this file — Coachmark.jsx's own panel/ring already
  // reads a LIVE, unlocked `useIsDesktop()`/resize listener for its own
  // layout, so it was never affected by this bug — so narrowing this has no
  // other effect.
  const isDesktop = useLockedIsDesktop(running && !activeStep)
  const isLast = Boolean(activeStep) && stepIndex === TUTORIAL_STEPS.length - 1
  // Which /weekly step is active, if any — see this file's own header
  // ("PER-STEP COMPLETION") for why PLACE_TASK/ADD_SCHEDULE/DELETE_SAMPLE
  // each get a STATE-based safety net reading the SAME `weekPlanQuery`
  // below, while CREATE_PROJECT/ADD_TASK (on /projects) do not.
  const isPlaceTaskStep = activeStep?.key === 'PLACE_TASK'
  const isAddScheduleStep = activeStep?.key === 'ADD_SCHEDULE'
  const isDeleteStep = activeStep?.key === 'DELETE_SAMPLE'
  // `useActiveWeekStartISO` (not an independently-recomputed
  // `currentWeekStartISO()` — owner report, 2026-10: TUT-07 정리 후 멈춤
  // 조사) — reads the EXACT `weekStartISO` WeeklyPage's own state holds
  // RIGHT NOW, published via activeWeekStore.js. That module's own header
  // has the full reasoning: re-deriving "today's Monday" independently only
  // coincidentally matched what WeeklyPage was actually showing; this makes
  // the two the SAME value by construction, so the query key below is
  // GUARANTEED to be WeeklyPage's own `weekPlanKey`, not merely usually it.
  const weekStartISO = useActiveWeekStartISO()
  // Subscribed ONLY while one of the THREE /weekly steps is active
  // (`enabled`) — see this file's own header ("PER-STEP COMPLETION") for why
  // PLACE_TASK/ADD_SCHEDULE joined DELETE_SAMPLE here (owner decision,
  // 2026-10 — each now also gets a STATE-based safety net), and why
  // `enabled` matters at all (no reason to pull the week plan into memory
  // for the two /projects steps). Shares the exact query key WeeklyPage's
  // own `useWeekPlan(weekStartISO)` call uses while that page is also
  // mounted, so this is NOT a second network request — same cache entry,
  // same in-flight fetch, TanStack Query dedupes by key alone.
  const weekPlanQuery = useWeekPlan(weekStartISO, {
    enabled: isPlaceTaskStep || isAddScheduleStep || isDeleteStep,
  })
  const weekBlocks = weekPlanQuery.data?.blocks

  /*
    ADD_SCHEDULE's own STATE fallback needs a BASELINE — see this file's own
    header ("PER-STEP COMPLETION") for why this step has no prior id to
    check presence of, unlike PLACE_TASK/DELETE_SAMPLE. The instant this
    step is entered (and `weekBlocks` has actually loaded), snapshot every
    SCHEDULE block's own `scheduleId` already on the week; satisfied the
    moment a SCHEDULE block NOT in that snapshot shows up (see
    `addScheduleStateSatisfied` below).

    Render-time adjustment (React's own "adjusting state when a value
    changes" pattern, same shape this file's `gateResetForKey` used to use
    before the [이전]/[다음] removal, and ProjectsPage's own
    `tabResolvedForId`) — NOT a `useEffect`, because this codebase's lint
    config (react-hooks/set-state-in-effect) forbids calling setState
    synchronously inside an effect body for a value derivable at render
    time. `weekBlocks` not having loaded YET (still `undefined`) is left
    alone rather than snapshotting an empty set — the retry condition below
    (`scheduleBaselineForKey !== activeStep.key`) stays true every render
    until `weekBlocks` actually arrives, so this captures the REAL baseline
    once it does rather than a premature empty one.
  */
  const [scheduleBaselineForKey, setScheduleBaselineForKey] = useState(null)
  const [scheduleBaselineIds, setScheduleBaselineIds] = useState(null)
  if (isAddScheduleStep && scheduleBaselineForKey !== activeStep.key && weekBlocks) {
    setScheduleBaselineForKey(activeStep.key)
    setScheduleBaselineIds(new Set(weekBlocks.filter((b) => b.blockType === 'SCHEDULE').map((b) => b.scheduleId)))
  } else if (!isAddScheduleStep && scheduleBaselineForKey != null) {
    // Left this step (advanced, or a TUT-09 restart) — forget the baseline
    // so a FUTURE visit (a restart) captures a fresh one instead of reusing
    // a stale snapshot from a previous run.
    setScheduleBaselineForKey(null)
    setScheduleBaselineIds(null)
  }

  // STATE-based safety nets (owner decision, 2026-10 — see this file's own
  // header) — each mirrors DELETE_SAMPLE's own "read weekPlan directly"
  // approach (B1 fix) rather than waiting on an event. Both ALSO being true
  // at the same moment the matching EVENT fires is expected, not a race:
  // `advance()` below just writes the SAME target step twice in that case
  // (idempotent — `stepIndex` has not changed yet either time).
  const placeTaskSatisfied =
    isPlaceTaskStep && Boolean(targets.taskId) && Boolean(weekBlocks) && weekBlocks.some((b) => b.taskId === targets.taskId)
  const addScheduleStateSatisfied =
    isAddScheduleStep &&
    scheduleBaselineIds != null &&
    Boolean(weekBlocks) &&
    weekBlocks.some((b) => b.blockType === 'SCHEDULE' && !scheduleBaselineIds.has(b.scheduleId))

  // The request URL this step wants open RIGHT NOW — shared by the
  // auto-navigate effect below AND the Coachmark panel's [다시 열기] (a user
  // closing the auto-opened form/panel just re-sends the exact same request;
  // see this file's own header for why a query param rather than a second,
  // imperative "open" channel).
  // `nonce` is a PARAMETER, not read off `requestNonceRef` in here directly
  // — this function is also called DURING RENDER for the presence check
  // (`Boolean(requestUrl(activeStep, ...))` below), and this codebase's lint
  // config (react-hooks/refs) forbids reading a ref's `.current` from
  // anything invoked at render time (refs are only safe to read from an
  // effect or an event handler). The two REAL navigation call sites (the
  // step-change effect, and onReopen) bump `requestNonceRef` and pass its
  // new value in THEMSELVES, from inside an effect/event handler — never
  // from render — so every ACTUAL request still gets a value no earlier
  // request ever used (see tutorialSteps.js's own header); the presence
  // check passes a throwaway constant instead, since it only cares whether
  // `buildSearch` would produce ANY non-empty string, not which exact nonce.
  const requestUrl = (step, nonce) => {
    if (!step) return null
    const search = step.buildSearch ? step.buildSearch(targets, nonce) : ''
    return search ? `${step.route}?${search}` : step.route
  }
  // Dummy value for the render-time presence check ONLY — see `requestUrl`'s
  // own comment above for why render can never read `requestNonceRef`
  // itself.
  const presenceCheckNonce = 'x'

  // Auto-navigate + auto-request ONCE per step change (not on every
  // render/route change) — see this file's own header, point 1, for why this
  // call is now UNCONDITIONAL (no `location.pathname !== activeStep.route`
  // guard) unlike the pre-redesign version.
  useEffect(() => {
    if (!activeStep) {
      // Back at kickoff (fresh run, or a TUT-09 restart) — clear the marker
      // so the FIRST real step after this, even if it's the exact same key
      // as whatever the PREVIOUS run last navigated to, still auto-navigates.
      // Without this, a restart that lands back on CREATE_PROJECT (the same
      // key the ref already held from the run being restarted) silently
      // skipped the redirect to /projects.
      lastNavigatedStepRef.current = null
      return
    }
    if (lastNavigatedStepRef.current === activeStep.key) return
    lastNavigatedStepRef.current = activeStep.key
    // `{ replace: true }` (Thomas code review SHOULD-FIX, S2) — this is a
    // SYSTEM-driven move (the coachmark deciding "now show this step"), not
    // a navigation the user themselves chose to make, so it must not grow
    // the back-button history the way a real page-to-page click would: a
    // `push` here meant pressing 뒤로 mid-tutorial walked back through each
    // PAST coachmark step's own URL instead of leaving the tutorial, and the
    // step shown (still driven by the `tutorialStep` cursor) never matched
    // whatever stale screen "뒤로" had just landed on. `replace` also
    // happens to absorb a side effect this uncovered: ADD_TASK's own
    // `?expanded=` write (ProjectsPage's `expandInProgress`, fired from
    // CREATE_PROJECT's save-success a tick before this effect sees the step
    // change) used to leave `expanded=` recorded in TWO consecutive history
    // entries — its own push, then this effect's OLD push stacking right on
    // top with the SAME `expanded=` value plus `addTask=1`. Replacing here
    // means this is the only entry that survives for this step.
    //
    // Bump the nonce BEFORE computing the url (owner report, 2026-10: "할 일
    // 창이... 안 열릴 때도 있다") — re-entering a step the user had already
    // visited once before (이전 → 다음) would otherwise recompute the EXACT
    // SAME search string as last time, which `navigate()` can treat as a
    // true no-op (identical location, nothing for any page's own
    // useSearchParamRequest to react to). See tutorialSteps.js's own header.
    requestNonceRef.current += 1
    navigate(requestUrl(activeStep, requestNonceRef.current), { replace: true })
    // Deliberately keyed ONLY on `activeStep` — `targets`/`navigate` are read
    // but must NOT re-trigger this effect (that would fight a user who
    // navigates away mid-step, see this file's own header).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep])

  /*
    DELETE_SAMPLE (TUT-07)의 완료 규칙 — STATE 기반 (B1 fix, see this file's
    own header for the bug this replaces). `deleteRequiredIds`는 이 run이
    실제로 기록한 리소스 id만 담는다(0~2개 — §7 스테일 커서는 0개). "기록된"
    것만 요구하므로(2개 모두 기록됐으면 2개 다, 하나만 기록됐으면 그 하나만)
    §2의 "너무 엄격하면 하나만 지워도 되도록" 우려를 자연스럽게 흡수한다 — 단,
    정상 흐름(TUT-05/06을 둘 다 실제로 완료한 경우)에서는 둘 다 요구한다:
    menuItemsFor의 라벨이 TASK는 "배치 해제", SCHEDULE은 "일정 삭제"로
    다르다는 것 자체가 이 단계의 교육 목적이라(tutorialSteps.js 옛 헤더
    주석), 하나만 지워도 통과시키면 그 구분을 한 번도 안 가르치고 지나갈 수
    있다 — 그래서 "완화"는 기록이 아예 없는 경우에만 적용하고, 기록된 것은
    전부 요구하는 쪽으로 판단했다.

    `weekPlanQuery.data`가 아직 없으면(첫 fetch 전) 비어 있는 blocks로 읽는
    대신 명시적으로 미완료 처리한다 — 로딩 중인 빈 배열을 "이미 다 지웠다"로
    잘못 읽을 수 있기 때문이다.
  */
  const deleteRequiredIds = isDeleteStep
    ? [
        targets.taskId ? { field: 'taskId', id: targets.taskId } : null,
        targets.scheduleId ? { field: 'scheduleId', id: targets.scheduleId } : null,
      ].filter(Boolean)
    : null
  const deleteSatisfied =
    deleteRequiredIds != null &&
    (deleteRequiredIds.length === 0 ||
      (Boolean(weekBlocks) && deleteRequiredIds.every(({ field, id }) => !weekBlocks.some((b) => b[field] === id))))

  const advance = () => setTutorialStep(stepIndex + 2)

  /*
    DELETE_SAMPLE 자동 진행 — `deleteSatisfied`가 true가 되는 즉시 advance한다
    (owner decision, 2026-10: 이전에는 기존 실행 취소 토스트 창(6초,
    UNDO_WINDOW_MS)만큼 기다렸다가 넘겼고, 그 동안 "정리 완료 — 잠시 후…"
    안내를 따로 보여줬다 — 오너가 그 대기/안내를 전부 제거하라고 결정했다).

    트레이드오프(오너가 받아들인 것으로 기록): 사용자가 정리를 마친 "직후"
    「실행 취소」를 눌러 블록을 되살리면, 이미 다음 단계(TUT-08)로 넘어가 있을
    수 있다 — 더 이상 그 되살림을 감지해 진행을 취소하지 않는다. 즉시
    진행이라는 요구사항 자체가 "그런 레이스는 감수한다"는 뜻이라 별도 처리는
    하지 않는다.

    `deleteSatisfied`는 여전히 STATE 기반 판정 그대로다(바로 위 블록, B1
    fix) — 이 effect는 그 값이 true로 "바뀌는 순간"에만 반응해 한 번
    advance하고 끝난다(의존성이 `deleteSatisfied` 자체라 같은 값이 유지되는
    동안 재실행되지 않는다 — cleanup도 필요 없다, 취소할 타이머가 없다).
  */
  useEffect(() => {
    if (!isDeleteStep || !deleteSatisfied) return
    advance()
    // `advance`/`stepIndex` deliberately excluded — stable for as long as
    // this step itself is active (same convention as the navigate effect
    // above, which excludes `targets`/`navigate` for the identical reason).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDeleteStep, deleteSatisfied])

  // PLACE_TASK's own STATE safety net (owner decision, 2026-10 — see this
  // file's own header) — fires the SAME `advance()` the matching TASK_PLACED
  // event already would, independently of whether that event ever arrives.
  // Captures `placedBlockId` ONLY if the event path hasn't already (cosmetic
  // — DELETE_SAMPLE's own `highlightBlocks` hint, see tutorialSteps.js) —
  // never overwrites a value the event may have ALSO just set in the same
  // render.
  useEffect(() => {
    if (!placeTaskSatisfied) return
    if (!targets.placedBlockId) {
      const matched = weekBlocks?.find((b) => b.taskId === targets.taskId)
      if (matched) patchTargets({ placedBlockId: matched.planBlockId ?? null })
    }
    advance()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeTaskSatisfied])

  // ADD_SCHEDULE's own STATE safety net — same reasoning, but ALSO captures
  // `scheduleBlockId`/`scheduleId` from whichever NEW schedule block tripped
  // `addScheduleStateSatisfied` (this path has no event payload to read
  // them from at all, unlike PLACE_TASK above) — DELETE_SAMPLE's own
  // completion check (B1 fix) needs `targets.scheduleId` captured by
  // SOMETHING regardless of which path got there first.
  useEffect(() => {
    if (!addScheduleStateSatisfied) return
    const matched = weekBlocks?.find((b) => b.blockType === 'SCHEDULE' && !scheduleBaselineIds.has(b.scheduleId))
    if (matched) {
      patchTargets({ scheduleBlockId: matched.planBlockId ?? null, scheduleId: matched.scheduleId ?? null })
    }
    advance()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addScheduleStateSatisfied])

  // 완료 감지 — 저장 성공 이벤트가 CURRENT 단계의 규칙과 맞아떨어지면 바로
  // 다음 단계로 넘긴다. DELETE_SAMPLE은 여기를 거치지 않는다 — 위 state 기반
  // 체크가 전담한다(그 단계 객체엔 애초에 `.event`가 없어 아래 첫 줄에서
  // 자연히 걸러진다). PLACE_TASK/ADD_SCHEDULE은 이 경로를 그대로 "주" 경로로
  // 유지한다(바로 위 두 effect는 "혹시 이 이벤트를 놓쳤을 때"의 안전망일
  // 뿐) — 보통은 이 핸들러가 먼저 advance해 버리므로, 위 두 effect가 실제로
  // "처음" advance를 거는 경우는 이벤트가 정말 안 왔을 때뿐이다. 이 콜백은
  // 매 렌더 새 클로저를 받아도 안전하다(useTutorialEvent가 ref로 감싸 구독을
  // 다시 걸지 않는다 — tutorialEvents.js).
  useTutorialEvent(({ type, payload }) => {
    if (!activeStep || isLast) return
    if (type !== activeStep.event) return
    if (!activeStep.matches(payload, targets)) return
    if (activeStep.captureTarget) patchTargets(activeStep.captureTarget(payload))
    advance()
  })

  // Completion and skip both PATCH the one server field the contract has
  // (`tutorialDone`). The LOCAL step cursor is reset ONLY in onSuccess, never
  // before the mutate call (Thomas code review BLOCKER, fixed 2026-10): an
  // earlier version reset it FIRST, synchronously. Between that reset and the
  // PATCH actually resolving, `progress.tutorialCompleted` in the cache was
  // still the OLD (false) value, so `running` stayed true while `tutorialStep`
  // was already 0 — the render in that gap fell through to the kickoff
  // dialog branch below, flashing "시작하기" again on every completion/skip,
  // 100% reproducible. Resetting only after the PATCH succeeds means the two
  // state changes that must be seen together (`tutorialCompleted:true` landing
  // in the query cache, and the step cursor going back to 0) land in the SAME
  // batched re-render — `running` flips false and `tutorialStep` resets at
  // once, so this component short-circuits straight past the kickoff branch
  // to `return null` with no visible step in between. If the PATCH fails, the
  // step cursor is left untouched (onError below just toasts) — the user sees
  // whatever step/kickoff they were already on and can press the same button
  // again, rather than being silently reset to a kickoff state the server
  // never actually confirmed.
  const finish = () => {
    updateProgress.mutate({ tutorialCompleted: true }, { onSuccess: () => resetTutorialStep() })
  }

  if (!progress || !running) return null

  // While the completion/skip PATCH above is in flight, render NOTHING —
  // not the current step (which is about to be torn down) and not a
  // re-derived kickoff (tutorialStep hasn't been reset yet, so this branch
  // wouldn't even trigger that, but see this file's own note above for why
  // the ordering matters regardless). A split second of nothing reads far
  // better than any flash of stale UI while a real network round-trip is
  // pending.
  if (updateProgress.isPending) return null

  // tutorialStep 0 — TUT-01 kickoff.
  if (!activeStep) {
    const t = onboardingCopy.tutorial
    const body = (
      <div className="flex flex-col gap-4">
        <h2 id={KICKOFF_TITLE_ID} className="text-title font-semibold text-text">
          {t.kickoffTitle}
        </h2>
        <p className="text-body text-text-muted">{t.kickoffBody}</p>
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="secondary" size="md" onClick={finish}>
            {t.skip}
          </Button>
          {/* No loading state here — advancing the step is now a synchronous
              local write (tutorialProgressStore), not a network round-trip. */}
          <Button ref={kickoffConfirmRef} variant="primary" size="md" onClick={() => setTutorialStep(1)}>
            {t.start}
          </Button>
        </div>
      </div>
    )
    return isDesktop ? (
      <Dialog open onClose={finish} labelledById={KICKOFF_TITLE_ID} initialFocusRef={kickoffConfirmRef}>
        {body}
      </Dialog>
    ) : (
      <BottomSheet open onClose={finish} labelledById={KICKOFF_TITLE_ID} initialFocusRef={kickoffConfirmRef}>
        {body}
      </BottomSheet>
    )
  }

  // Resolve a dynamic (per-run) anchor — see tutorialSteps.js's own header on
  // why TUT-05's `targetId` is a function of `targets` rather than a fixed id.
  const resolvedTargetId =
    typeof activeStep.targetId === 'function' ? activeStep.targetId(targets) : activeStep.targetId
  // Same function-or-string shape — DELETE_SAMPLE's `body` (tutorialSteps.js,
  // Thomas SHOULD-FIX) names only what this run actually recorded, which
  // only `targets` (read at render time) can answer. No more "정리 완료 —
  // 잠시 후…" override here (owner decision, 2026-10, removed the hold this
  // used to explain — see the DELETE_SAMPLE effect above) — satisfying the
  // step now advances on the VERY NEXT render, so there is no longer a
  // window where this step's own panel is still visible but already done.
  const resolvedBody = typeof activeStep.body === 'function' ? activeStep.body(targets) : activeStep.body

  return (
    <Coachmark
      targetId={resolvedTargetId}
      title={activeStep.title}
      body={resolvedBody}
      stepNumber={stepIndex + 1}
      total={TUTORIAL_STEPS.length}
      isLast={isLast}
      // [다시 열기] — shown for every NON-LAST step that actually has
      // something to (re-)request. No `nextDisabled`-style gate needed
      // anymore (owner decision, 2026-10, removed [이전]/[다음] — see this
      // file's own header): a step's own Coachmark is, BY CONSTRUCTION, only
      // ever rendered while that step is still active — the moment it's
      // satisfied, `advance()` moves `tutorialStep` on and THIS render is
      // replaced by the next step's, so "showing while pending" and "showing
      // at all" are now the same condition. Re-requesting something already
      // open is a harmless no-op (re-focuses/re-opens in place) — same
      // reasoning as before, unchanged.
      showReopen={!isLast && Boolean(requestUrl(activeStep, presenceCheckNonce))}
      // `{ replace: true }` (S2, same reasoning as the step-change effect
      // above) — re-sending the same request is still a SYSTEM-driven move,
      // and without this, clicking [다시 열기] more than once on the same
      // step stacked one identical history entry per click. Nonce bumped
      // here too (same reasoning as the step-change effect) — a SECOND [다시
      // 열기] click would otherwise resend the EXACT same request the first
      // click already sent.
      onReopen={() => {
        requestNonceRef.current += 1
        navigate(requestUrl(activeStep, requestNonceRef.current), { replace: true })
      }}
      onSkip={finish}
      // ONLY ever called from the LAST step's own [완료] (Coachmark.jsx only
      // renders that button when `isLast` — see its own header) — every
      // OTHER step has no manual trigger anymore, so this no longer needs an
      // `else { advance() }` branch at all.
      onComplete={() => {
        // TUT-08 "완료 상태와 다음 이동 화면을 확인한다" — land on the
        // dashboard once the last step's own [완료] click commits the one
        // server field this run actually changes. Step reset happens in
        // onSuccess, same ordering (and same reason) as `finish` above —
        // see that function's own comment.
        updateProgress.mutate(
          { tutorialCompleted: true },
          {
            onSuccess: () => {
              resetTutorialStep()
              navigate('/')
            },
          },
        )
      }}
    />
  )
}

export default TutorialOverlay
