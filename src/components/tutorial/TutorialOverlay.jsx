import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
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
import { useWeekPlan, weekPlanKey } from '../../features/plan/usePlanData'
import { useActiveWeekStartISO, useUnplacedPanelOpen } from '../../features/plan/activeWeekStore'
import { getWeek, deleteBlock } from '../../features/plan/planApi'
import { getProject, deleteProject } from '../../features/project/projectApi'
import { projectKey, projectsKey } from '../../features/project/useProjectData'
import { toast } from '../../hooks/useToasts'
import { systemMessages } from '../../constants/systemMessages'

const KICKOFF_TITLE_ID = 'tutorial-kickoff-title'
const CLEANUP_TITLE_ID = 'tutorial-cleanup-title'
const OFF_ROUTE_TITLE_ID = 'tutorial-off-route-title'
const RESUME_TITLE_ID = 'tutorial-resume-title'
// sessionStorage key — gates the RESUME prompt to "once per tab session"
// (see this file's own header, "RESUME PROMPT").
const RESUME_ASKED_KEY = 'tutorial-resume-asked'
// 5 main steps (CREATE_PROJECT..DELETE_SAMPLE) — COMPLETE is NOT counted
// (see tutorialSteps.js's own header on why). The label itself carries no
// denominator ("2-1", not "2-1/5" — owner's own later feedback, 2026-10,
// dropped the "/5" the FIRST version of this redesign had shown).
const MAIN_STEP_LABELS = ['1', '2', '3', '4', '5']

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
    1..TUTORIAL_STEPS.length    → TUT-03~08, one Coachmark each (progress
                                  label "n" or "n-m", no denominator — see
                                  `progressLabel`'s own comment below).
    completed/skipped          → renders nothing (tutorialCompleted:true).

  RING-BASED REDESIGN (owner decision, 2026-10 — supersedes an earlier
  "auto-open the real form/panel for the user" redesign this file used to
  describe here). The owner's own dev-testing concluded auto-opening taught
  nothing (the user never had to find the control themselves) and its timing
  intermittently missed. Every step now instead:
    - points Coachmark's ring at a REAL, already-visible control
      (`resolvedTargetId` below, from `tutorialSteps.js`'s own `targetId`) and
      tells the user to click/drag it — nothing here calls `navigate()` with
      a request query param anymore;
    - for ADD_TASK/PLACE_TASK, resolves WHICH of two `subSteps` to show from
      real on-screen state (`uiState` below — `?expanded=` for "that project
      row is open", `useUnplacedPanelOpen()` for "the panel is open") rather
      than an event — see tutorialSteps.js's own header for why this is
      state, not event, based;
    - still advances the STEP ITSELF (not the sub-step) from the SAME
      event/state detection as before this redesign — completely unchanged,
      see "PER-STEP COMPLETION" below.
  Every mutation hook fires ONE line into a shared event stream
  (tutorialEvents.js) at its own real success point, and this file only
  subscribes to that stream — it never reaches into either screen's query
  cache directly (except the three `weekPlanQuery`-based STATE safety nets
  described below, which read the SAME shared cache WeeklyPage itself reads,
  not a parallel one).

  EVERY step's own entry navigates to its `route` if the user isn't already
  there (owner BLOCKER fix, 2026-10, dev repro: 설정 → 튜토리얼 다시 실행 →
  [시작하기] immediately flashed the OFF-ROUTE ask and exited). An EARLIER
  version of this effect only auto-navigated for PLACE_TASK specifically
  (reasoning: "3-1: /weekly로 이동(이 이동만 허용)" — every OTHER transition
  was ASSUMED to already leave the user on the right route, since step1→2
  stays on /projects and step3→4→5→6 all stay on /weekly). That assumption
  missed ONE transition: kickoff shows on the DASHBOARD (it is not
  route-locked — it can show on any screen), but [시작하기] jumps straight
  to CREATE_PROJECT, whose own route is /projects — nothing navigated there,
  so the very next tick's off-route check read the mismatch as a genuine
  excursion and armed the ask. Generalizing to EVERY step's own entry (not
  just PLACE_TASK) fixes this structurally rather than special-casing
  kickoff→CREATE_PROJECT on top of the existing PLACE_TASK case: a step
  ALREADY on its own route (every "same route as before" transition) simply
  skips navigating (`pathname !== route` guard, unchanged in spirit), so
  this generalization adds exactly ONE new real navigation (kickoff→
  CREATE_PROJECT, dashboard→/projects) without changing behavior for any
  transition that already worked. The combined effect below performs this
  ONCE per step-entry (`enteredStepKeyRef` — a step key it has already
  processed once never re-triggers it, even if the user later navigates away
  and the OFF-ROUTE flow brings them back) and otherwise never calls
  `navigate()` for a step change at all — this is a plain SCREEN move for
  the ring to land on the right page, never a form-opening request (no
  query param is ever sent — see "RING-BASED REDESIGN" above).

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

  [이전]/[다음]/[다시 열기] REMOVED (owner decision, 2026-10) — every
  non-last step now ONLY ever advances from detection (event or state, see
  the table below), never a manual click. [다시 열기] specifically no longer
  has anything left to DO — no step auto-opens a form/panel anymore (see
  "RING-BASED REDESIGN" above), so there is nothing to re-open. The removed
  [다음] used to ALSO serve as a safety valve for one real scenario: a SECOND
  browser tab running the same tutorial writes to the SAME localStorage key
  (tutorialProgressStore.js), but THIS tab's event stream has no way to see
  THAT tab's success. Losing that valve is an explicit, accepted trade-off —
  [건너뛰기] (still a real button, every step but the last) is now the ONLY
  way out of a step that, for whatever reason, never detects its own
  completion. [완료] also stays, but ONLY on the LAST step (TUT-08 has
  nothing to auto-detect at all — it is a plain "you're done" screen, so a
  manual click is the ONLY way it ever ends, and [건너뛰기] would be
  meaningless there — owner decision, 2026-10, Coachmark.jsx hides it when
  `isLast`).

  OFF-ROUTE PROMPT (owner decision, 2026-10) — a mid-tutorial navigation to
  a route OTHER than the active step's own `route` (e.g. 대시보드/통계/설정
  — anything that isn't /projects or /weekly, as the active step itself
  requires) hides Coachmark/the top banner and asks "튜토리얼을 종료할까요?"
  instead, via [튜토리얼로 돌아가기] (navigates back to the step's own route)
  / [종료] (the SAME `exitWithCleanupCheck` → PATCH flow [완료]/[건너뛰기]
  already use). Dismissing the ASK itself (Esc/backdrop) leaves the user
  exactly on the off-tutorial screen they already navigated to, with the
  tutorial UI STAYING hidden — not re-shown — until they navigate BACK to
  the step's own route on their own, at which point Coachmark reappears with
  no further action needed (`offRouteState` below resets to `null` the
  moment `location.pathname` matches `activeStep.route` again, regardless of
  how it got there). The combined effect below deliberately does NOT treat
  a step's own entry-tick auto-navigate (above) as an off-route excursion —
  without that exclusion, the single render between "a NEW step became
  active" and "its own auto-navigate's `navigate()` call lands" would
  misread the still-stale `location.pathname` as a real excursion and flash
  the ask dialog for a frame before immediately un-asking it (this is
  exactly the BLOCKER the "EVERY step's own entry navigates" fix above
  closes — kickoff→CREATE_PROJECT is the same shape as PLACE_TASK's own
  /projects→/weekly move, just not special-cased before).

  CLOSE-THEN-MOVE HARDENING (Thomas 분석, 2026-10 — defense-in-depth on top
  of the fix above, independent of the separate `fix/overlay-history` PR
  rebuilding `utils/overlayHistory.js` itself, which this file does not
  touch): nowhere in this file does a click handler both close a Dialog
  (`setOffRouteState`/etc.) AND call `navigate()` in the SAME tick anymore.
  [튜토리얼로 돌아가기] (`returnToTutorialRoute` below) only calls
  `navigate()` — the off-route ask's own Dialog closes ONE RENDER LATER,
  via the combined effect's own reactive disarm, once `navLocation.pathname`
  actually reflects that navigation. The render branch chain below ALSO
  renders NOTHING (not the surface about to close, not yet the Coachmark
  ring) for the one tick between a step becoming active and its own
  entry-navigate landing (see that branch's own comment) — covering BOTH
  kickoff→CREATE_PROJECT and a RESUME onto a step whose route the user
  wasn't already on.

  RESUME PROMPT (owner decision, 2026-10) — a FRESH MOUNT (refresh,
  re-login, app restart; TutorialOverlay itself otherwise stays mounted for
  an entire tab's lifetime per this file's own header, so this is the only
  time a "first render" actually means a NEW session) while `tutorialStep`
  is already mid-progress shows "진행 중이던 튜토리얼이 있습니다" INSTEAD of
  silently re-showing the stored step's own Coachmark — [이어서 하기] simply
  dismisses (the stored step continues exactly as it would have without this
  prompt); [처음부터 다시] runs the SAME `exitWithCleanupCheck` flow as
  [완료]/[종료] above but with a DIFFERENT `proceedFn` (reset the LOCAL step
  cursor only — `tutorialCompleted` never changes, this is not an exit). The
  `resumePromptState` render-time adjustment below (same "adjust state during
  render" idiom this file already uses for `scheduleBaselineForKey`) fires
  this decision exactly once, the FIRST render `progress` is available —
  gated additionally by `sessionStorage` (`RESUME_ASKED_KEY`) so a user who
  refreshes SEVERAL times in the same tab session is asked only the first
  time, per the owner's own "탭/경로 변경마다 아님" instruction. Every effect
  below that could navigate or arm the off-route ask is itself gated on
  `resumePromptState === 'resolved'` — otherwise a mid-progress PLACE_TASK
  resume could auto-navigate or ask about a route mismatch before the user
  has even answered this prompt.

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

  PRACTICE-DATA CLEANUP (owner decision, 2026-10) — DELETE_SAMPLE only ever
  requires unplacing the sample TASK (its BLOCK, not the task record itself
  — "배치 해제" returns it to the backlog, see PLAN-16) and deleting the
  sample SCHEDULE (whose block DOES cascade-delete the underlying `schedules`
  row — PLAN-18, confirmed against openapi.yaml's own `deletePlanBlock`
  summary). The sample PROJECT (and its now-unplaced task) is NEVER required
  to be deleted by ANY step, and [건너뛰기] can fire at ANY point BEFORE
  DELETE_SAMPLE even runs — so a project (and sometimes a still-live
  schedule, if skipped mid-way through TUT-06/07) can legitimately survive
  to the END of a run. `finish`/`onComplete`'s own `exitWithCleanupCheck`
  wrapper asks before EITHER ends the run (TUT-08's own [완료], or
  [건너뛰기] from literally any step including kickoff) — but ONLY if
  something recorded in `targets` is CONFIRMED to still exist (an async
  check, `gatherRemainingPracticeData`): a project fetched by id (404 = already
  gone, skip it), a schedule's own block found by `scheduleId` in a FRESH
  weekPlan read (not found = already gone, same as DELETE_SAMPLE's own
  completion check already treats it). Nothing recorded, or nothing
  confirmed to still exist → the dialog never opens, same as before this
  feature existed.

  DELETE API CHOICE: `DELETE /projects/{id}` (cascades tasks → plan_blocks →
  execution_logs, confirmed via the baseline schema's own `ON DELETE
  CASCADE` chain, NOT re-verified assumption) for the project — ONE call,
  no separate task/block cleanup needed. For the schedule, `DELETE
  /plan-blocks/{blockId}` (the SAME endpoint TUT-07's own 일정 삭제 menu
  action already calls) — there is no standalone `DELETE /schedules/{id}`
  in the contract at all (only `PATCH`), so the block IS the delete path.
  Both go through the RAW `deleteProject`/`deleteBlock` API functions
  directly, NOT their own `useDeleteProject`/`useRemoveBlockWithUndo` hooks
  — those hooks each show THEIR OWN toast/undo-toast, which would double up
  against (and read confusingly next to) this feature's own single combined
  "정리했습니다" toast below.

  FAILURE HANDLING: a 404 on either delete (already gone — e.g. the user
  deleted it by hand moments earlier through the real screen) counts as
  success. Any OTHER failure shows the generic write-error toast and the
  tutorial still ends exactly as if cleanup had been skipped — the owner's
  own framing: "삭제가 일부 실패하면 토스트로 알리고, 튜토리얼 종료는 그대로
  진행한다". The CLOSE action (Esc/backdrop/back) on the confirm dialog
  itself is NEITHER button — it only dismisses the dialog and leaves the
  tutorial exactly where it was (no PATCH, no delete, no navigation), per
  the owner's own explicit instruction, so a user can never accidentally
  end the tutorial by closing a dialog reflexively. Opening/closing this
  dialog shares the exact same `utils/overlayHistory.js` bridge every other
  Dialog/BottomSheet already does (including the self-initiated-back()
  race that file's own header documents) — a kickoff-건너뛰기 that opens
  this dialog right as the kickoff dialog itself closes is exactly the
  "a new overlay opens between calling back() and it resolving" case that
  bridge was already built to survive (see that file's header), so no
  special-casing was needed here.
*/
export function TutorialOverlay() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const sessionQuery = useSession()
  const progressQuery = useOnboardingProgress()
  const updateProgress = useUpdateOnboardingProgress()
  const [tutorialStep, setTutorialStep, resetTutorialStep] = useTutorialStep(sessionQuery.data?.userId)
  const [targets, patchTargets] = useTutorialTargets(sessionQuery.data?.userId)
  const navLocation = useLocation()
  const [searchParams] = useSearchParams()
  const unplacedPanelOpen = useUnplacedPanelOpen()
  const kickoffConfirmRef = useRef(null)
  // Which step key the combined off-route/auto-navigate effect below has
  // already processed its ONE entry-tick for (see this file's own header,
  // "RING-BASED REDESIGN") — replaces the old `lastNavigatedStepRef`, same
  // one-shot-per-step-key shape, but now also doubles as the "don't ask
  // off-route on the very first render of a step" guard.
  const enteredStepKeyRef = useRef(null)
  // OFF-ROUTE prompt state — see this file's own header. `null` = on-route
  // (or no active step); `'asking'` = currently showing the ask dialog;
  // `'dismissed'` = the user closed the ask via Esc/backdrop without
  // choosing, so the tutorial UI stays hidden until they navigate back on
  // their own (the combined effect resets this to `null` the instant
  // `location.pathname` matches `activeStep.route` again, from EITHER
  // state).
  const [offRouteState, setOffRouteState] = useState(null)
  // RESUME prompt state — see this file's own header. Starts `'pending'`
  // until `progress` first loads (see the render-time adjustment below,
  // which is the ONLY place this ever leaves `'pending'`); `'open'` = mid-
  // progress cursor found, not yet asked this session; `'resolved'` =
  // nothing to ask (fresh start, or already asked/answered this session).
  const [resumePromptState, setResumePromptState] = useState('pending')
  // Practice-data cleanup confirm — null while not showing; otherwise
  // `{ items, proceedFn }` (see this file's own header, "PRACTICE-DATA
  // CLEANUP", for the full flow). `cleanupChecking` guards the brief async
  // gap between clicking [건너뛰기]/[완료] and the dialog actually opening
  // (or skipping straight through) against a second click re-starting the
  // same check.
  const [cleanupPrompt, setCleanupPrompt] = useState(null)
  const [cleanupChecking, setCleanupChecking] = useState(false)
  // Focuses the PRIMARY action (삭제하고 종료) on open — same convention as
  // the kickoff dialog's own `kickoffConfirmRef` above (the emphasized,
  // expected action gets initial focus).
  const cleanupConfirmRef = useRef(null)
  // Same D1 fold-safety reasoning as the kickoff dialog's own `isDesktop`
  // below, scoped to exactly this dialog's own open window.
  const isDesktopForCleanup = useLockedIsDesktop(Boolean(cleanupPrompt))
  // Same D1 reasoning, scoped to the OFF-ROUTE/RESUME dialogs' own open
  // windows respectively. Each focuses its own emphasized action on open —
  // same convention as `kickoffConfirmRef`/`cleanupConfirmRef` above.
  const isDesktopForOffRoute = useLockedIsDesktop(offRouteState === 'asking')
  const isDesktopForResume = useLockedIsDesktop(resumePromptState === 'open')
  const offRouteReturnRef = useRef(null)
  const resumeContinueRef = useRef(null)

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

  /*
    Sub-step resolution (RING-BASED REDESIGN — see this file's own header) —
    `uiState` bundles the two cross-component UI-state signals a step's own
    `subStepIndex` might read: `expandedProjectId` from the SAME `?expanded=`
    URL param ProjectsPage's own accordion already keeps (2-1→2-2), and
    `unplacedPanelOpen` from activeWeekStore.js's published value (3-1→3-2 —
    that module's own header explains why a URL param alone can't cover this
    one). A step with no `subSteps` (CREATE_PROJECT/ADD_SCHEDULE/
    DELETE_SAMPLE/COMPLETE) IS its own "sub-step" — same title/body/targetId
    shape either way, so the render below never needs to branch on which
    kind of step it's looking at.
  */
  const uiState = { expandedProjectId: searchParams.get('expanded'), unplacedPanelOpen }
  const activeSubStepIndex = activeStep?.subSteps ? activeStep.subStepIndex(targets, uiState) : null
  const activeSubStep = activeStep ? (activeStep.subSteps ? activeStep.subSteps[activeSubStepIndex] : activeStep) : null
  // Same function-or-string shape `targetId`/`body` already had before this
  // redesign (tutorialSteps.js's own header) — now resolved off
  // `activeSubStep` instead of `activeStep` directly, so a sub-stepped
  // step's OWN per-substep anchor/copy wins over any (nonexistent, for those
  // two steps) step-level one.
  const resolvedTargetId =
    typeof activeSubStep?.targetId === 'function' ? activeSubStep.targetId(targets) : activeSubStep?.targetId
  const resolvedTitle = activeSubStep?.title
  const resolvedBody =
    typeof activeSubStep?.body === 'function' ? activeSubStep.body(targets, weekBlocks) : activeSubStep?.body
  // Progress label — 오너 실측 피드백(2026-10): 분모("/5")를 뗀다. "n"(단일
  // 단계) 또는 "n-m"(하위 단계가 있는 단계), COMPLETE는 그대로 "완료"(이
  // 라벨에는 애초에 분모가 없었다) — tutorialSteps.js's own header still
  // explains WHY there are 5 main steps (COMPLETE excluded from that count),
  // this is now purely a display decision, independent of that count.
  const progressLabel = !activeStep
    ? ''
    : isLast
      ? onboardingCopy.tutorial.completeProgressLabel
      : activeStep.subSteps
        ? `${MAIN_STEP_LABELS[stepIndex]}-${activeSubStepIndex + 1}`
        : MAIN_STEP_LABELS[stepIndex]

  /*
    RESUME PROMPT decision — render-time adjustment (same idiom as
    `scheduleBaselineForKey` above), fires EXACTLY ONCE: the first render
    `progress` is truthy. Before that, `resumePromptState` stays `'pending'`
    and nothing below it (the off-route/auto-navigate effect, the render
    branch) acts on `activeStep` yet — see this file's own header for why
    gating those on `'resolved'` matters.
  */
  if (resumePromptState === 'pending' && progress) {
    const midProgress = running && stepIndex >= 0
    const alreadyAskedThisSession = sessionStorage.getItem(RESUME_ASKED_KEY) === '1'
    setResumePromptState(midProgress && !alreadyAskedThisSession ? 'open' : 'resolved')
  }
  // Marks the session as "asked" the INSTANT the decision above leaves
  // `'pending'` (whether that decision was "show it" or "nothing to show") —
  // a plain side effect (writing to sessionStorage), so it belongs in an
  // effect, not the render-time adjustment above.
  useEffect(() => {
    if (resumePromptState === 'pending') return
    sessionStorage.setItem(RESUME_ASKED_KEY, '1')
  }, [resumePromptState])

  // Combined OFF-ROUTE + the one-time PLACE_TASK auto-navigate — see this
  // file's own header ("RING-BASED REDESIGN"/"OFF-ROUTE PROMPT") for why
  // these two concerns share ONE effect: evaluating them separately risked
  // a one-frame flash of the off-route ask while PLACE_TASK's own
  // auto-navigate is still in flight (same render, stale `location.pathname`
  // not yet reflecting the `navigate()` call about to land).
  useEffect(() => {
    // The resume prompt (if showing) must be answered first — see this
    // file's own header.
    if (resumePromptState !== 'resolved') return
    if (!activeStep) {
      enteredStepKeyRef.current = null
      // `offRouteState`'s own reset for THIS condition lives in the
      // render-time adjustment right below this effect, not here — ESLint's
      // react-hooks/set-state-in-effect flags a setState call that reacts to
      // nothing but a value ALREADY known at render time (`!activeStep`), as
      // opposed to the mismatch arm/disarm further down, which is entangled
      // with the `navigate()` side effect and genuinely needs to run here.
      return
    }
    const isEntryTick = enteredStepKeyRef.current !== activeStep.key
    if (isEntryTick) {
      enteredStepKeyRef.current = activeStep.key
      // EVERY step's own entry navigates to its `route` if not already
      // there (owner BLOCKER fix, 2026-10 — dev repro: kickoff shows on the
      // dashboard, but CREATE_PROJECT's own route is /projects; with only
      // PLACE_TASK auto-navigating, [시작하기] left `activeStep` truthy and
      // `navLocation.pathname` still `/` for one tick, which this effect's
      // OWN off-route check below misread as a genuine excursion and armed
      // the ask immediately). This is a plain SCREEN move for the ring to
      // land on the right page — it never opens a form (no query param is
      // ever sent, see this file's own header on the RING-BASED REDESIGN).
      // A step already on its own route (1→2 staying on /projects, 3→4→5→6
      // staying on /weekly) hits the `pathname !== route` check below and
      // simply skips navigating — unchanged from before this fix.
      if (navLocation.pathname !== activeStep.route) {
        navigate(activeStep.route, { replace: true })
        return // This tick's mismatch is already being corrected — never ask.
      }
    }
    // `setOffRouteState` here reacts to `navLocation.pathname` — the
    // ROUTER's own state, an EXTERNAL system from this component's own
    // point of view — changing out from under an already-active step; this
    // is exactly the "subscribe to an external system, setState when it
    // changes" case react-hooks/set-state-in-effect's own message calls
    // out as fine, not the "derivable at render time" case it otherwise
    // flags (unlike the `!activeStep` branch above, which WAS purely that
    // and got moved out). A render-time version would also re-introduce
    // the same one-frame flash this effect's own header already explains
    // the combined-effect design avoids, since React would resolve the new
    // `offRouteState` SYNCHRONOUSLY within the SAME render pass that first
    // sees `isEntryTick`, defeating the one-tick suppression above.
    const onRoute = navLocation.pathname === activeStep.route
    if (!onRoute && offRouteState === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOffRouteState('asking')
    } else if (onRoute && offRouteState !== null) {
      setOffRouteState(null)
    }
  }, [resumePromptState, activeStep, navLocation.pathname, navigate, offRouteState])

  // Render-time counterpart to the effect above — `!activeStep` (back at
  // kickoff, or the run just ended) is already known synchronously, so
  // resetting `offRouteState` for THIS one condition belongs here, not
  // inside the effect (see that effect's own comment on why only this
  // branch moved out).
  if (!activeStep && offRouteState !== null) {
    setOffRouteState(null)
  }

  // [튜토리얼로 돌아가기] — returns to the active step's OWN route. Does
  // NOT also call `setOffRouteState(null)` here (Thomas 분석, 2026-10
  // hardening — "닫기와 이동을 같은 틱에 하지 않기"): closing this Dialog
  // and calling `navigate()` in the SAME click handler would close+move in
  // one tick, the exact shape of race the kickoff→CREATE_PROJECT BLOCKER
  // above was. The reactive disarm already in the combined effect above
  // (`onRoute && offRouteState !== null → setOffRouteState(null)`) closes
  // this dialog on its own, ONE RENDER LATER, once `navLocation.pathname`
  // actually reflects this `navigate()` call — the dialog staying open for
  // that one extra tick is imperceptible and strictly safer than closing
  // it before the navigation it depends on has actually landed.
  const returnToTutorialRoute = () => {
    navigate(activeStep.route)
  }
  // [종료] — goes through the SAME `exitWithCleanupCheck` → PATCH flow as
  // [완료]/kickoff's own [건너뛰기] (defined further below as `finish`).
  const exitFromOffRoute = () => {
    setOffRouteState(null)
    finish()
  }
  // [이어서 하기] — nothing to do beyond dismissing; the stored step
  // continues exactly as if this prompt had never shown.
  const resumeContinue = () => setResumePromptState('resolved')
  // [처음부터 다시] — same `exitWithCleanupCheck` wrapper, but its own
  // `proceedFn` only resets the LOCAL step cursor (no PATCH — this run was
  // never actually completed, just restarted).
  const resumeRestart = () => {
    exitWithCleanupCheck(() => {
      resetTutorialStep()
      setResumePromptState('resolved')
    })
  }

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

  /*
    DELETE_SAMPLE's own highlight, RECOMPUTED LIVE (owner report, 2026-10:
    "자동 배치나 실행 취소 후 새 id인 경우에는 강조되지 않을 수 있다") —
    `highlightIdsKey` is the join of every CURRENT block's `planBlockId`
    that still carries `targets.taskId`/`targets.scheduleId` RIGHT NOW,
    recomputed from `weekBlocks` every render exactly like `deleteSatisfied`
    above does, so it self-heals the instant an undo recreates a block
    under a new id or an auto-place path never had one to begin with — a
    RECORDED block id (tutorialSteps.js's old `placedBlockId`/
    `scheduleBlockId`) could go stale in either case; a resource id cannot.

    The effect below only NAVIGATES when this joined string actually
    CHANGES (`lastHighlightRef`) — not merely re-renders — so deleting ONE
    of two blocks re-sends a highlight pointing at just the remaining one,
    but an unrelated re-render (e.g. the banner's own viewport listener)
    never re-fires it for no reason. This is the ONE `navigate()` call left
    in this file that still carries a query param at all (`highlightBlocks=`,
    WeeklyPage's own PLAN-23 focus-ring mechanism, pre-dating and unrelated
    to the RING-BASED REDESIGN's own `targetId`/Coachmark ring) — see
    DELETE_SAMPLE's own entry in tutorialSteps.js for why it still uses that
    mechanism instead of a `data-tut-id` anchor (the real controls it
    describes — the block action menu — are transient, not a single
    always-mounted element).
  */
  const highlightIdsKey = isDeleteStep
    ? (weekBlocks ?? [])
        .filter((b) => (targets.taskId && b.taskId === targets.taskId) || (targets.scheduleId && b.scheduleId === targets.scheduleId))
        .map((b) => b.planBlockId)
        .join(',')
    : null
  const lastHighlightRef = useRef(null)
  useEffect(() => {
    if (!isDeleteStep) {
      lastHighlightRef.current = null
      return
    }
    if (!highlightIdsKey || highlightIdsKey === lastHighlightRef.current) return
    lastHighlightRef.current = highlightIdsKey
    navigate(`/weekly?highlightBlocks=${encodeURIComponent(highlightIdsKey)}`, { replace: true })
  }, [isDeleteStep, highlightIdsKey, navigate])

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

  /*
    PRACTICE-DATA CLEANUP — see this file's own header ("PRACTICE-DATA
    CLEANUP") for the full reasoning. `gatherRemainingPracticeData` is a
    best-effort EXISTENCE check, never the thing that decides whether to
    clean up — it only decides whether to ASK: a project fetched by id
    (404 → already gone, drop it silently) and a schedule block found by
    `scheduleId` in a freshly-read weekPlan (not found → same). Any OTHER
    fetch error also drops that one item rather than guessing — asking about
    something this check itself couldn't confirm would be worse than simply
    not asking about it.

    `queryClient.fetchQuery` (not the raw `getProject`/`getWeek` call) so a
    STILL-FRESH cache entry (e.g. the user just LOOKED at this exact project
    or week) skips a redundant round trip — same staleTime each query
    already declares elsewhere (`useProject`/`useWeekPlan`).
  */
  const isNotFoundError = (err) => err?.status === 404

  const gatherRemainingPracticeData = async () => {
    const items = []
    if (targets.projectId) {
      try {
        const project = await queryClient.fetchQuery({
          queryKey: projectKey(targets.projectId),
          queryFn: () => getProject(targets.projectId),
        })
        items.push({ kind: 'project', id: targets.projectId, label: project.name })
      } catch (err) {
        if (!isNotFoundError(err)) {
          // 확인할 수 없는 에러(네트워크 등) — 묻는 대상이 불확실하면 묻지
          // 않는 쪽이 안전하다(이 항목만 조용히 뺀다). 404는 이미 지워진
          // 정상 경로라 경고조차 안 남긴다.
          console.warn('[tutorial cleanup] 샘플 프로젝트 확인 실패', err)
        }
      }
    }
    if (targets.scheduleId) {
      try {
        const week = await queryClient.fetchQuery({
          queryKey: weekPlanKey(weekStartISO),
          queryFn: () => getWeek(weekStartISO),
        })
        const block = (week.blocks ?? []).find((b) => b.scheduleId === targets.scheduleId)
        if (block) items.push({ kind: 'schedule', planBlockId: block.planBlockId, label: block.title })
      } catch (err) {
        console.warn('[tutorial cleanup] 샘플 일정 확인 실패', err)
      }
    }
    return items
  }

  // Wraps EITHER exit path (`finish`/`onComplete`'s own `proceedFn`, below)
  // with the cleanup check. `cleanupChecking` blocks a second click from
  // re-starting the (brief, but real) async check while the first is still
  // in flight — [건너뛰기]/[완료] stay clickABLE the whole time (no spinner
  // UI — this codebase's own "no loading-spinner hell" budget, and the
  // check is short enough that one is not worth the complexity), this guard
  // just makes a double-click a no-op instead of two overlapping checks.
  const exitWithCleanupCheck = async (proceedFn) => {
    if (cleanupChecking) return
    setCleanupChecking(true)
    const items = await gatherRemainingPracticeData()
    setCleanupChecking(false)
    if (items.length === 0) {
      proceedFn()
      return
    }
    setCleanupPrompt({ items, proceedFn })
  }

  // [삭제하고 종료] — best-effort delete, THEN the original exit regardless
  // of outcome (owner's own framing, this file's header). Raw API functions
  // (`deleteProject`/`deleteBlock`), not their own `useDeleteProject`/
  // `useRemoveBlockWithUndo` hooks — those each show THEIR OWN toast/undo
  // affordance, which this feature's single combined toast below would
  // otherwise duplicate or fight for the user's attention against.
  const confirmCleanupAndExit = async () => {
    const { items, proceedFn } = cleanupPrompt
    setCleanupPrompt(null)
    let anyFailed = false
    for (const item of items) {
      try {
        if (item.kind === 'project') await deleteProject(item.id)
        else await deleteBlock(item.planBlockId)
      } catch (err) {
        if (!isNotFoundError(err)) anyFailed = true
      }
    }
    // Best-effort cache tidy-up — not load-bearing for THIS run (which is
    // about to end regardless), just so a LATER visit to /projects or
    // /weekly doesn't show a stale row for something that is actually gone.
    queryClient.invalidateQueries({ queryKey: projectsKey() })
    queryClient.invalidateQueries({ queryKey: weekPlanKey(weekStartISO) })
    toast(
      anyFailed
        ? { tone: 'error', message: systemMessages.error.writeTitle }
        : { tone: 'success', message: '연습 데이터를 정리했습니다' },
    )
    proceedFn()
  }

  // [남기고 종료] — skip deletion, run the original exit as-is.
  const keepPracticeDataAndExit = () => {
    const { proceedFn } = cleanupPrompt
    setCleanupPrompt(null)
    proceedFn()
  }

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
  //
  // Both now go through `exitWithCleanupCheck` FIRST (this file's own
  // header, "PRACTICE-DATA CLEANUP") — the PATCH itself, and the ordering
  // guarantees above, are otherwise UNCHANGED: cleanup (if any) happens
  // BEFORE this mutate call even starts, and the step cursor still only
  // resets in onSuccess, after the server confirms.
  const finish = () => {
    exitWithCleanupCheck(() => {
      updateProgress.mutate({ tutorialCompleted: true }, { onSuccess: () => resetTutorialStep() })
    })
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

  /*
    `mainContent` (not an early `return` per branch, unlike before this
    feature) — the cleanup confirm dialog below can need to show up WHILE
    EITHER the kickoff dialog or a coachmark step would otherwise be
    rendering (it opens from either's own [건너뛰기], or the last step's
    own [완료]). Deferring to one `return` at the bottom, with
    `mainContent` suppressed entirely while `cleanupPrompt` is open (see
    there), keeps exactly ONE confirm-shaped surface on screen at a time —
    simpler than reasoning about a stacked kickoff/coachmark UNDER this
    dialog for no benefit (neither is interactive once the question is up).
  */
  let mainContent

  // RESUME PROMPT — highest priority (see this file's own header): answered
  // before anything else below ever gets to navigate/ask/show a step.
  if (resumePromptState === 'open') {
    const t = onboardingCopy.tutorial
    const body = (
      <div className="flex flex-col gap-4">
        <h2 id={RESUME_TITLE_ID} className="text-title font-semibold text-text">
          {t.resumeTitle}
        </h2>
        <p className="text-body text-text-muted">{t.resumeBody}</p>
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="secondary" size="md" onClick={resumeRestart}>
            {t.resumeRestart}
          </Button>
          <Button ref={resumeContinueRef} variant="primary" size="md" onClick={resumeContinue}>
            {t.resumeContinue}
          </Button>
        </div>
      </div>
    )
    // Esc/backdrop → same as [이어서 하기] (dismissing without choosing must
    // not silently restart/discard progress) — same reasoning as the
    // cleanup dialog's own `onClose` below.
    mainContent = isDesktopForResume ? (
      <Dialog open onClose={resumeContinue} labelledById={RESUME_TITLE_ID} initialFocusRef={resumeContinueRef}>
        {body}
      </Dialog>
    ) : (
      <BottomSheet open onClose={resumeContinue} labelledById={RESUME_TITLE_ID} initialFocusRef={resumeContinueRef}>
        {body}
      </BottomSheet>
    )
  } else if (!activeStep) {
    // tutorialStep 0 — TUT-01 kickoff.
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
    mainContent = isDesktop ? (
      <Dialog open onClose={finish} labelledById={KICKOFF_TITLE_ID} initialFocusRef={kickoffConfirmRef}>
        {body}
      </Dialog>
    ) : (
      <BottomSheet open onClose={finish} labelledById={KICKOFF_TITLE_ID} initialFocusRef={kickoffConfirmRef}>
        {body}
      </BottomSheet>
    )
  } else if (navLocation.pathname !== activeStep.route && offRouteState === null) {
    /*
      PENDING ENTRY NAVIGATE (Thomas 분석, 2026-10 하드닝 — "닫기와 이동을
      같은 틱에 하지 않기") — a step just became active but its own
      entry-tick `navigate()` (the combined effect above) hasn't landed on
      screen yet; `offRouteState === null` is what tells this apart from a
      REAL later off-route excursion (that effect never arms the ask during
      THIS gap — see its own `isEntryTick` branch). Renders NOTHING rather
      than either the surface that was just about to close (kickoff's own
      Dialog on the very first entry, or the RESUME ask's Dialog if resuming
      mid-progress onto a step whose route the user wasn't already on) or
      the Coachmark ring (whose target doesn't exist on the CURRENT page
      yet anyway). This keeps that closing Dialog's own unmount and this
      step's own `navigate()` call from both happening in the exact same
      effect pass — the shape of race the kickoff→CREATE_PROJECT BLOCKER
      above was. The gap is one render tick, imperceptible; the owner's own
      instruction left the choice between keeping the old surface open vs.
      rendering nothing here, and "nothing" was picked specifically because
      "keep the old surface" would show kickoff's own [시작하기] copy during
      a RESUME's analogous gap, which is wrong content for that case.
    */
    mainContent = null
  } else if (offRouteState === 'asking') {
    // OFF-ROUTE ask — see this file's own header. Replaces the normal
    // Coachmark render entirely while showing (the "hide ring+banner, ask
    // instead" the owner specified), not a stacked overlay on top of it.
    const t = onboardingCopy.tutorial
    const body = (
      <div className="flex flex-col gap-4">
        <h2 id={OFF_ROUTE_TITLE_ID} className="text-title font-semibold text-text">
          {t.offRouteTitle}
        </h2>
        <p className="text-body text-text-muted">{t.offRouteBody}</p>
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="secondary" size="md" onClick={exitFromOffRoute}>
            {t.offRouteExit}
          </Button>
          <Button ref={offRouteReturnRef} variant="primary" size="md" onClick={returnToTutorialRoute}>
            {t.offRouteReturn}
          </Button>
        </div>
      </div>
    )
    // Esc/backdrop/back → `'dismissed'`, NOT `null` — see this file's own
    // header ("OFF-ROUTE PROMPT"): this must leave the user exactly on the
    // off-tutorial screen they already navigated to, with the tutorial UI
    // staying hidden (not re-shown) until they navigate back on their own.
    mainContent = isDesktopForOffRoute ? (
      <Dialog
        open
        onClose={() => setOffRouteState('dismissed')}
        labelledById={OFF_ROUTE_TITLE_ID}
        initialFocusRef={offRouteReturnRef}
      >
        {body}
      </Dialog>
    ) : (
      <BottomSheet
        open
        onClose={() => setOffRouteState('dismissed')}
        labelledById={OFF_ROUTE_TITLE_ID}
        initialFocusRef={offRouteReturnRef}
      >
        {body}
      </BottomSheet>
    )
  } else if (offRouteState === 'dismissed') {
    // User closed the ask without choosing — stay on whatever off-tutorial
    // screen they're on, tutorial UI hidden, until the off-route effect
    // above detects a return to `activeStep.route` and resets this to
    // `null` on its own (see this file's own header).
    mainContent = null
  } else {
    mainContent = (
      <Coachmark
        targetId={resolvedTargetId}
        title={resolvedTitle}
        body={resolvedBody}
        progressLabel={progressLabel}
        isLast={isLast}
        onSkip={finish}
        // ONLY ever called from the LAST step's own [완료] (Coachmark.jsx only
        // renders that button when `isLast` — see its own header) — every
        // OTHER step has no manual trigger anymore, so this no longer needs an
        // `else { advance() }` branch at all. Goes through
        // `exitWithCleanupCheck` first, same as `finish` — see this file's
        // own header ("PRACTICE-DATA CLEANUP").
        onComplete={() => {
          exitWithCleanupCheck(() => {
            // 오너 요구(2026-10, 실측 피드백): 종료 경로는 현재 화면을
            // 유지한다 — `navigate('/')`로 대시보드로 보내던 것을 제거했다.
            // [완료]를 누른 그 WEEKLY 화면(TUT-08의 own route)에 그대로
            // 남는다. Step reset happens in onSuccess, same ordering (and
            // same reason) as `finish` above — see that function's own
            // comment.
            updateProgress.mutate(
              { tutorialCompleted: true },
              {
                onSuccess: () => {
                  resetTutorialStep()
                },
              },
            )
          })
        }}
      />
    )
  }

  // PRACTICE-DATA CLEANUP confirm — see this file's own header for the full
  // flow. Suppresses `mainContent` entirely while open (see that variable's
  // own comment above for why) rather than stacking over it.
  if (cleanupPrompt) {
    const t = onboardingCopy.tutorial
    const itemLabel = (item) =>
      item.kind === 'project' ? `프로젝트 「${item.label}」(태스크 포함)` : `일정 「${item.label}」`
    const body = (
      <div className="flex flex-col gap-4">
        <h2 id={CLEANUP_TITLE_ID} className="text-title font-semibold text-text">
          {t.cleanupTitle}
        </h2>
        <p className="text-body text-text-muted">
          {cleanupPrompt.items.map(itemLabel).join(', ')}
          {t.cleanupBodySuffix}
        </p>
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="secondary" size="md" onClick={keepPracticeDataAndExit}>
            {t.cleanupKeep}
          </Button>
          <Button ref={cleanupConfirmRef} variant="primary" size="md" onClick={confirmCleanupAndExit}>
            {t.cleanupDelete}
          </Button>
        </div>
      </div>
    )
    // Esc/backdrop/back → `onClose` → ONLY dismiss (this file's own header,
    // "FAILURE HANDLING" paragraph) — never `keepPracticeDataAndExit`, which
    // would also END the tutorial; a reflexive Esc must never do that.
    mainContent = isDesktopForCleanup ? (
      <Dialog
        open
        onClose={() => setCleanupPrompt(null)}
        labelledById={CLEANUP_TITLE_ID}
        initialFocusRef={cleanupConfirmRef}
      >
        {body}
      </Dialog>
    ) : (
      <BottomSheet
        open
        onClose={() => setCleanupPrompt(null)}
        labelledById={CLEANUP_TITLE_ID}
        initialFocusRef={cleanupConfirmRef}
      >
        {body}
      </BottomSheet>
    )
  }

  return mainContent
}

export default TutorialOverlay
