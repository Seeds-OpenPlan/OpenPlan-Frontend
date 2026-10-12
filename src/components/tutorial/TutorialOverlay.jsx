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
import { useWeekPlan, UNDO_WINDOW_MS } from '../../features/plan/usePlanData'
import { currentWeekStartISO } from '../../features/plan/planTime'

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
       step's own `buildSearch(targets)` query string appended (e.g.
       `?create=1`) — the "open the real UI for me" request (tutorialSteps.js
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
  check only ARMS a timer (`UNDO_WINDOW_MS` — the DELETE_SAMPLE effect
  further below): advancing happens only once that state has held for the
  WHOLE undo window, and an undo landing before then cancels the pending
  advance by flipping the state back before the timer fires — fixing (b) as
  a side effect of fixing (a), since both came from the same root cause
  (events, not state, used to drive this).

  [다음] IS STILL A REAL BUTTON (Button's own disabled/disabledReason
  pattern, gated on `stepSatisfied` below) — but in NORMAL single-tab use a
  user will essentially never see it enabled while still on a gated step:
  the SAME event that would let them click it productively also advances
  past it immediately. Its one genuine job: a SECOND browser tab running the
  same tutorial writes to the SAME localStorage key (tutorialProgressStore.js)
  but this tab's event stream has no way to see THAT tab's success (no
  `storage`-event wiring — out of this redesign's scope), so without a manual
  fallback it would stay stuck forever despite the task being genuinely done
  elsewhere.

  §7 (오너 보고용 판단 — a STALE cursor from BEFORE this redesign, with no
  recorded target ids): handled NOT via this manual-override button, but by
  loosening each step's own `matches` to "any event of the right TYPE
  counts" once `targets` is missing the id it would otherwise narrow by
  (tutorialSteps.js). That still requires a real action of the right kind —
  unlike silently substituting "the user's most recent project", which risked
  pointing TUT-07's delete instructions at a REAL, unrelated project/task —
  while never permanently trapping the user on an id this run never
  captured. The one case with NOTHING left to verify — DELETE_SAMPLE with
  BOTH ids missing — does bypass the gate outright (`deleteRequiredIds.length
  === 0` below): there is no real action left to require.
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
  // Safety-valve gate for [다음] (see this file's own header for the one real
  // scenario it covers) — reset whenever the ACTIVE STEP itself changes.
  const [gateSatisfied, setGateSatisfied] = useState(false)
  const [gateResetForKey, setGateResetForKey] = useState(null)

  const progress = progressQuery.data
  const running = Boolean(progress?.onboardingCompleted && !progress.tutorialCompleted)
  // D1: `running`이 이 오버레이의 "open" 신호다 — 킥오프부터 각 코치마크
  // 단계까지 전부 이 한 셸 선택을 공유하므로, 튜토리얼이 진행되는 동안
  // 폴드 펼침/접힘으로 중간에 셸이 바뀌지 않게 시작 시점에 고정한다.
  const isDesktop = useLockedIsDesktop(running)
  const stepIndex = tutorialStep - 1 // -1 while still at kickoff (tutorialStep 0)
  const activeStep = running && stepIndex >= 0 ? TUTORIAL_STEPS[stepIndex] : null
  const isLast = Boolean(activeStep) && stepIndex === TUTORIAL_STEPS.length - 1
  const isDeleteStep = activeStep?.key === 'DELETE_SAMPLE'
  // Subscribed ONLY while DELETE_SAMPLE is active (`enabled`) — see this
  // file's own header on why this must be REACTIVE rather than a one-off
  // read, and why `enabled` matters (no reason to pull the week plan into
  // memory for the other 5 steps). Shares the exact query key WeeklyPage's
  // own `useWeekPlan(weekStartISO)` call uses while that page is also
  // mounted (DELETE_SAMPLE's route is `/weekly`), so this is NOT a second
  // network request — same cache entry, same in-flight fetch, TanStack Query
  // dedupes by key alone.
  const weekPlanQuery = useWeekPlan(currentWeekStartISO(), { enabled: isDeleteStep })

  // Render-time adjustment (React's own "adjusting state when a value
  // changes" pattern, same shape ProjectsPage's own `tabResolvedForId`
  // uses) — NOT a `useEffect`, because this codebase's lint config
  // (react-hooks/set-state-in-effect) forbids calling setState synchronously
  // inside an effect body. An effect is for synchronizing with an EXTERNAL
  // system; this is purely local state reacting to `activeStep` changing.
  if ((activeStep?.key ?? null) !== gateResetForKey) {
    setGateResetForKey(activeStep?.key ?? null)
    setGateSatisfied(false)
  }

  // The request URL this step wants open RIGHT NOW — shared by the
  // auto-navigate effect below AND the Coachmark panel's [다시 열기] (a user
  // closing the auto-opened form/panel just re-sends the exact same request;
  // see this file's own header for why a query param rather than a second,
  // imperative "open" channel).
  const requestUrl = (step) => {
    if (!step) return null
    const search = step.buildSearch ? step.buildSearch(targets) : ''
    return search ? `${step.route}?${search}` : step.route
  }

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
    navigate(requestUrl(activeStep), { replace: true })
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
  const weekBlocks = weekPlanQuery.data?.blocks
  const deleteSatisfied =
    deleteRequiredIds != null &&
    (deleteRequiredIds.length === 0 ||
      (Boolean(weekBlocks) && deleteRequiredIds.every(({ field, id }) => !weekBlocks.some((b) => b[field] === id))))

  const advance = () => setTutorialStep(stepIndex + 2)

  /*
    DELETE_SAMPLE 자동 진행의 HOLD — `deleteSatisfied`가 true가 되는 순간
    바로 넘기지 않고, 기존 실행 취소 토스트 창(UNDO_WINDOW_MS, usePlanData.js
    에서 재사용)만큼 그 상태가 유지될 때만 advance한다. 그 사이 사용자가
    「실행 취소」로 블록을 되살리면 — 서버가 recreate를 끝내고 캐시가 그
    taskId/scheduleId를 다시 "존재함"으로 읽는 순간 — `deleteSatisfied`가
    스스로 false로 돌아가므로, 이 effect의 cleanup이 아직 안 울린 타이머를
    취소한다. "그 사이 되살리면 진행을 취소하라"는 요구사항을 이벤트
    북키핑 없이 state 재계산 하나로 만족한다.
  */
  useEffect(() => {
    if (!isDeleteStep || !deleteSatisfied) return
    const timer = setTimeout(advance, UNDO_WINDOW_MS)
    return () => clearTimeout(timer)
    // `advance`/`stepIndex` deliberately excluded — stable for as long as
    // this step itself is active (same convention as the navigate effect
    // above, which excludes `targets`/`navigate` for the identical reason).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDeleteStep, deleteSatisfied])

  // 완료 감지 — 저장 성공 이벤트가 CURRENT 단계의 규칙과 맞아떨어지면 바로
  // 다음 단계로 넘긴다. DELETE_SAMPLE은 여기를 거치지 않는다 — 위 state 기반
  // 체크가 전담한다(그 단계 객체엔 애초에 `.event`가 없어 아래 첫 줄에서
  // 자연히 걸러진다). 이 콜백은 매 렌더 새 클로저를 받아도 안전하다
  // (useTutorialEvent가 ref로 감싸 구독을 다시 걸지 않는다 — tutorialEvents.js).
  useTutorialEvent(({ type, payload }) => {
    if (!activeStep || isLast) return
    if (type !== activeStep.event) return
    if (!activeStep.matches(payload, targets)) return
    if (activeStep.captureTarget) patchTargets(activeStep.captureTarget(payload))
    setGateSatisfied(true)
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
  // only `targets` (read at render time) can answer.
  const resolvedBody = typeof activeStep.body === 'function' ? activeStep.body(targets) : activeStep.body
  const stepSatisfied = isLast || (isDeleteStep ? deleteSatisfied : gateSatisfied)
  const nextDisabled = !isLast && !stepSatisfied

  return (
    <Coachmark
      targetId={resolvedTargetId}
      title={activeStep.title}
      body={resolvedBody}
      stepNumber={stepIndex + 1}
      total={TUTORIAL_STEPS.length}
      isLast={isLast}
      nextDisabled={nextDisabled}
      nextDisabledReason={nextDisabled ? activeStep.nextDisabledReason : undefined}
      // [다시 열기] — shown whenever this step is still pending AND actually
      // has something to (re-)request; re-sending the SAME request a closed
      // auto-opened form/panel already got once is simpler and strictly safer
      // than trying to detect "did the user close it" across screens that
      // don't all share one tracked-open mechanism (Dialog/BottomSheet's
      // overlayStack covers TUT-03/04/06's modals, but NOT WeeklyPage's
      // desktop unplaced panel, which is a non-modal floating card — see that
      // component's own header). Re-requesting something already open is a
      // harmless no-op (re-focuses/re-opens in place), so one condition
      // covers both cases without needing to tell them apart.
      showReopen={nextDisabled && Boolean(requestUrl(activeStep))}
      // `{ replace: true }` (S2, same reasoning as the step-change effect
      // above) — re-sending the same request is still a SYSTEM-driven move,
      // and without this, clicking [다시 열기] more than once on the same
      // step stacked one identical history entry per click.
      onReopen={() => navigate(requestUrl(activeStep), { replace: true })}
      onSkip={finish}
      onPrev={() => setTutorialStep(Math.max(1, stepIndex))}
      onNext={() => {
        if (isLast) {
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
        } else {
          advance()
        }
      }}
    />
  )
}

export default TutorialOverlay
