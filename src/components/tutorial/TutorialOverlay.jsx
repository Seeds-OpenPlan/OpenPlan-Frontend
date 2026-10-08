import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Dialog } from '../common/Dialog'
import { BottomSheet } from '../common/BottomSheet'
import { Button } from '../common/Button'
import { Coachmark } from './Coachmark'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import { useSession } from '../../features/auth/useAuth'
import { useOnboardingProgress, useUpdateOnboardingProgress } from '../../features/onboarding/useOnboarding'
import { useTutorialStep } from '../../features/tutorial/tutorialProgressStore'
import { TUTORIAL_STEPS } from '../../features/tutorial/tutorialSteps'
import { onboardingCopy } from '../../features/onboarding/onboardingCopy'

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

  [한계, self-paced by design] Each step's "다음" is a manual click, not an
  automatic detection of "did the user actually create the sample project /
  place the block". Building real-time detection would mean subscribing to
  ProjectsPage/WeeklyPage's own TanStack Query caches from here and diffing
  them per step — coupling this overlay tightly to two other stories' owned,
  actively-evolving screens for a benefit (skipping a manual click) that most
  real-product tutorials (Notion, Linear) don't bother with either. Explicitly
  flagged rather than silently simplified.
*/
export function TutorialOverlay() {
  const isDesktop = useIsDesktop()
  const navigate = useNavigate()
  const location = useLocation()
  const sessionQuery = useSession()
  const progressQuery = useOnboardingProgress()
  const updateProgress = useUpdateOnboardingProgress()
  const [tutorialStep, setTutorialStep, resetTutorialStep] = useTutorialStep(sessionQuery.data?.userId)
  const kickoffConfirmRef = useRef(null)
  const lastNavigatedStepRef = useRef(null)

  const progress = progressQuery.data
  const running = Boolean(progress?.onboardingCompleted && !progress.tutorialCompleted)
  const stepIndex = tutorialStep - 1 // -1 while still at kickoff (tutorialStep 0)
  const activeStep = running && stepIndex >= 0 ? TUTORIAL_STEPS[stepIndex] : null

  // Auto-navigate ONCE per step change (not on every render/route change) so
  // a fresh step always opens on the screen its target lives on, without
  // fighting a user who deliberately navigates elsewhere mid-step (see this
  // file's own header — Coachmark's un-anchored fallback covers that case).
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
    if (location.pathname !== activeStep.route) navigate(activeStep.route)
    // Deliberately keyed ONLY on `activeStep` — `location`/`navigate` are read
    // but must NOT re-trigger this effect (that would fight a user who
    // navigates away mid-step, see this file's own header).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep])

  // Completion and skip both PATCH the one server field the contract has
  // (`tutorialDone`) and reset the LOCAL step cursor in the same click — a
  // refresh must never resume a run that already ended either way.
  const finish = () => {
    resetTutorialStep()
    updateProgress.mutate({ tutorialCompleted: true })
  }

  if (!progress || !running) return null

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

  const isLast = stepIndex === TUTORIAL_STEPS.length - 1

  return (
    <Coachmark
      targetId={activeStep.targetId}
      title={activeStep.title}
      body={activeStep.body}
      stepNumber={stepIndex + 1}
      total={TUTORIAL_STEPS.length}
      isLast={isLast}
      onSkip={finish}
      onPrev={() => setTutorialStep(Math.max(1, stepIndex))}
      onNext={() => {
        if (isLast) {
          // TUT-08 "완료 상태와 다음 이동 화면을 확인한다" — land on the
          // dashboard once the last step's own [완료] click commits the one
          // server field this run actually changes.
          resetTutorialStep()
          updateProgress.mutate({ tutorialCompleted: true }, { onSuccess: () => navigate('/') })
        } else {
          setTutorialStep(stepIndex + 2)
        }
      }}
    />
  )
}

export default TutorialOverlay
