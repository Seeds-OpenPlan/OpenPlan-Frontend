import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton'
import { ErrorState } from '../../components/common/ErrorState'
import { OnboardingStepper } from '../../components/onboarding/OnboardingStepper'
import { OnboardingProfileStep } from '../../components/onboarding/OnboardingProfileStep'
import { OnboardingAvailabilityStep } from '../../components/onboarding/OnboardingAvailabilityStep'
import { OnboardingFixedScheduleStep } from '../../components/onboarding/OnboardingFixedScheduleStep'
import { OnboardingCalendarStep } from '../../components/onboarding/OnboardingCalendarStep'
import { useOnboardingProgress, useUpdateOnboardingProgress } from '../../features/onboarding/useOnboarding'
import { WIZARD_STEPS, onboardingCopy } from '../../features/onboarding/onboardingCopy'

function stepIndexOf(currentStep) {
  if (currentStep === 'DONE') return WIZARD_STEPS.length - 1
  const i = WIZARD_STEPS.findIndex((s) => s.key === currentStep)
  return i === -1 ? 0 : i
}

/*
  SCR-ONB-* 위저드 (스텝퍼 4단계). Each step component owns its own "다음"
  button/gate (see each component's own header for why); this page's only jobs
  are (1) render the current one, (2) turn its onNext payload into the single
  `PATCH onboarding-progress` call that both persists the step AND advances
  `currentStep` server-side, and (3) local "이전" navigation (view-only — going
  back never rewinds the server's own furthest-reached marker, see below).
*/
function OnboardingWizardPage() {
  const navigate = useNavigate()
  const progressQuery = useOnboardingProgress()
  const updateProgress = useUpdateOnboardingProgress()
  const [viewIndex, setViewIndex] = useState(null)

  const progress = progressQuery.data

  // Seed the viewed step ONCE from the server's furthest-reached marker
  // (AC2 "이탈 재진입 시 onboarding-progress로 위치 복원") — during render, same
  // self-limiting `=== null` guard SettingsAvailabilityPage's draft seed uses.
  if (progress && viewIndex === null) {
    setViewIndex(stepIndexOf(progress.currentStep))
  }

  useEffect(() => {
    if (progress?.onboardingCompleted) navigate('/', { replace: true })
  }, [progress, navigate])

  if (progressQuery.isLoading || viewIndex === null) return <LoadingSkeleton preset="card" />
  if (progressQuery.isError) {
    return <ErrorState variant="section" onAction={() => progressQuery.refetch()} />
  }
  if (!progress || progress.onboardingCompleted) return null

  const goBack = () => setViewIndex((i) => Math.max(0, i - 1))

  // Advancing NEVER rewinds `currentStep` even when the user is revisiting an
  // earlier step via 이전 — the PATCH always writes the target of THIS click,
  // which by construction is always >= the server's current furthest marker
  // (전진만 가능한 스텝 순서라 매 단계의 "다음"이 정확히 다음 인덱스로만
  // 이동한다).
  const advanceTo = (nextIndex, extraPatch = {}) => {
    const isFinishing = nextIndex >= WIZARD_STEPS.length
    const nextStep = isFinishing ? 'DONE' : WIZARD_STEPS[nextIndex].key
    updateProgress.mutate(
      // Thomas 리뷰 BLOCKER fix: 마지막 단계(캘린더)의 완료/나중에 하기 둘 다
      // 여기로 들어오는데, `currentStep:'DONE'`만 보내고 `onboardingCompleted`
      // 를 빠뜨리면 위 redirect effect(`progress?.onboardingCompleted`)와
      // TutorialOverlay의 시작 조건이 영영 안 걸려 사용자가 CALENDAR 화면에
      // 무한히 남는다 — DONE으로 넘어가는 이 한 번의 patch가 온보딩 자체를
      // 끝내는 유일한 지점이므로 반드시 같이 보낸다.
      { ...extraPatch, currentStep: nextStep, ...(isFinishing ? { onboardingCompleted: true } : {}) },
      { onSuccess: () => setViewIndex(Math.min(nextIndex, WIZARD_STEPS.length - 1)) },
    )
  }

  const stepKey = WIZARD_STEPS[viewIndex]?.key

  return (
    <div className="flex flex-col gap-8 rounded-card border border-border bg-surface p-6 md:p-8">
      <div className="flex flex-col gap-4">
        <h1 className="text-heading font-bold text-text">{onboardingCopy.wizard.heading}</h1>
        <OnboardingStepper currentIndex={viewIndex} />
      </div>

      {stepKey === 'PROFILE' && (
        <OnboardingProfileStep
          initial={progress.profile}
          submitting={updateProgress.isPending}
          onNext={(profile) => advanceTo(1, { profile })}
        />
      )}
      {stepKey === 'AVAILABILITY' && (
        <OnboardingAvailabilityStep onBack={goBack} onNext={() => advanceTo(2)} />
      )}
      {stepKey === 'FIXED' && <OnboardingFixedScheduleStep onBack={goBack} onNext={() => advanceTo(3)} />}
      {stepKey === 'CALENDAR' && (
        <OnboardingCalendarStep
          onBack={goBack}
          finishing={updateProgress.isPending}
          onFinish={() => advanceTo(4)}
        />
      )}
    </div>
  )
}

export default OnboardingWizardPage
