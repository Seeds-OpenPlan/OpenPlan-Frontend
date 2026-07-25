import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Dialog } from '../common/Dialog'
import { BottomSheet } from '../common/BottomSheet'
import { Button } from '../common/Button'
import { Coachmark } from './Coachmark'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import { useOnboardingProgress, useUpdateOnboardingProgress } from '../../features/onboarding/useOnboarding'
import { TUTORIAL_STEPS } from '../../features/tutorial/tutorialSteps'
import { onboardingCopy } from '../../features/onboarding/onboardingCopy'

const KICKOFF_TITLE_ID = 'tutorial-kickoff-title'

/*
  OVL-TUT host — mounted once in AppLayout (same placement class as
  Toaster/UnsavedGuard: a single, always-present, self-gating overlay that
  renders nothing until its own condition is met). Reads/writes the SAME
  onboarding-progress document the wizard uses (`tutorialStep`/`tutorialCompleted`/
  `tutorialSkipped`) — there is exactly one place "where is the user in the
  tutorial" lives, matching AC2's position-restore principle for the wizard.

  State machine (tutorialStep):
    0                          → not started: TUT-01 kickoff dialog (AC3).
    1..TUTORIAL_STEPS.length    → TUT-03~08, one Coachmark each (n/6 = TUT-03
                                  is n=1 of 6, per tutorialSteps.js's order).
    completed/skipped          → renders nothing.

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
  const progressQuery = useOnboardingProgress()
  const updateProgress = useUpdateOnboardingProgress()
  const kickoffConfirmRef = useRef(null)
  const lastNavigatedStepRef = useRef(null)

  const progress = progressQuery.data
  const running = Boolean(
    progress?.onboardingCompleted && !progress.tutorialCompleted && !progress.tutorialSkipped,
  )
  const stepIndex = (progress?.tutorialStep ?? 0) - 1 // -1 while still at kickoff (tutorialStep 0)
  const activeStep = running && stepIndex >= 0 ? TUTORIAL_STEPS[stepIndex] : null

  // Auto-navigate ONCE per step change (not on every render/route change) so
  // a fresh step always opens on the screen its target lives on, without
  // fighting a user who deliberately navigates elsewhere mid-step (see this
  // file's own header — Coachmark's un-anchored fallback covers that case).
  useEffect(() => {
    if (!activeStep) return
    if (lastNavigatedStepRef.current === activeStep.key) return
    lastNavigatedStepRef.current = activeStep.key
    if (location.pathname !== activeStep.route) navigate(activeStep.route)
    // Deliberately keyed ONLY on `activeStep` — `location`/`navigate` are read
    // but must NOT re-trigger this effect (that would fight a user who
    // navigates away mid-step, see this file's own header).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep])

  const skip = () => updateProgress.mutate({ tutorialCompleted: true, tutorialSkipped: true })

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
          <Button variant="secondary" size="md" onClick={skip}>
            {t.skip}
          </Button>
          <Button
            ref={kickoffConfirmRef}
            variant="primary"
            size="md"
            loading={updateProgress.isPending}
            onClick={() => updateProgress.mutate({ tutorialStep: 1 })}
          >
            {t.start}
          </Button>
        </div>
      </div>
    )
    return isDesktop ? (
      <Dialog open onClose={skip} labelledById={KICKOFF_TITLE_ID} initialFocusRef={kickoffConfirmRef}>
        {body}
      </Dialog>
    ) : (
      <BottomSheet open onClose={skip} labelledById={KICKOFF_TITLE_ID} initialFocusRef={kickoffConfirmRef}>
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
      onSkip={skip}
      onPrev={() => updateProgress.mutate({ tutorialStep: Math.max(1, stepIndex) })}
      onNext={() =>
        updateProgress.mutate(
          isLast ? { tutorialStep: stepIndex + 2, tutorialCompleted: true } : { tutorialStep: stepIndex + 2 },
          // TUT-08 "완료 상태와 다음 이동 화면을 확인한다" — land on the
          // dashboard once the last step's own [완료] click commits.
          isLast ? { onSuccess: () => navigate('/') } : undefined,
        )
      }
    />
  )
}

export default TutorialOverlay
