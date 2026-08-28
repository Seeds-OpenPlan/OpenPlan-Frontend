import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/common/Button'
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton'
import { ErrorState } from '../../components/common/ErrorState'
import { useOnboardingProgress, useUpdateOnboardingProgress } from '../../features/onboarding/useOnboarding'
import { INTRO_PAGES, onboardingCopy } from '../../features/onboarding/onboardingCopy'

/*
  OVL-ONB-INTRO (ONB-01). Two pages, "다음" advances 1→2, "시작하기" on the last
  page commits `introSeen` and moves into the stepper (AC2 — progress restore
  reads this same flag: a returning user who already saw the intro skips
  straight past this page, handled below rather than in the router, since it
  needs the query's data to decide).
*/
function OnboardingIntroPage() {
  const navigate = useNavigate()
  const progressQuery = useOnboardingProgress()
  const updateProgress = useUpdateOnboardingProgress()
  const [pageIndex, setPageIndex] = useState(0)

  const progress = progressQuery.data

  // AC2 position-restore: already onboarded → dashboard; already past the
  // intro (re-entered mid-wizard) → straight to the stepper. `replace: true`
  // so the back button never bounces the user into a stale intro page.
  useEffect(() => {
    if (!progress) return
    if (progress.onboardingCompleted) {
      navigate('/', { replace: true })
    } else if (progress.introSeen) {
      navigate('/onboarding/wizard', { replace: true })
    }
  }, [progress, navigate])

  if (progressQuery.isLoading) return <LoadingSkeleton preset="card" />
  if (progressQuery.isError) {
    return <ErrorState variant="section" onAction={() => progressQuery.refetch()} />
  }
  if (!progress || progress.onboardingCompleted || progress.introSeen) return null

  const isLast = pageIndex === INTRO_PAGES.length - 1
  const page = INTRO_PAGES[pageIndex]

  const handleNext = () => {
    if (isLast) {
      updateProgress.mutate(
        { introSeen: true },
        // replace:true — same reasoning as the position-restore effect above:
        // the intro itself must never be a back-button destination once past it.
        { onSuccess: () => navigate('/onboarding/wizard', { replace: true }) },
      )
      return
    }
    setPageIndex((i) => i + 1)
  }

  return (
    <div className="flex flex-col items-center gap-8 rounded-card border border-border bg-surface p-8 text-center">
      {/* aria-live so screen readers hear the new page's title/body once,
          rather than needing to re-discover focus on every "다음" click. */}
      <div aria-live="polite" className="flex flex-col gap-3 motion-safe:transition-opacity motion-safe:duration-slow">
        <h1 className="text-heading font-bold text-text">{page.title}</h1>
        {/* 줄바꿈 위치는 문구 자신이 정한다(onboardingCopy의 bodyLines 주석
            참고) — 그래서 폭 제한(옛 max-w-[48ch])을 두지 않는다. 그 제한이
            남아 있으면 지정한 자리보다 먼저 접혀 버린다. 각 줄은 block
            <span>이라 <br> 없이 끊기고, 스크린리더에는 여전히 한 문단이다.
            break-keep은 모바일처럼 한 줄이 다 안 들어가는 폭에서 다시 접힐 때
            어절 중간이 아니라 어절 경계에서 접히게 한다. */}
        <p className="text-body break-keep text-text-muted">
          {page.bodyLines.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </p>
      </div>

      {/* Page dots — visual + textual (색 단독 금지: 현재 페이지 자체가
          "n/total" 텍스트로도 아래 버튼 옆에 병기된다는 점에서 색만으로
          전달하지 않는다). */}
      <div className="flex items-center gap-2" role="presentation">
        {INTRO_PAGES.map((p, i) => (
          <span
            key={p.title}
            aria-hidden="true"
            className={[
              'h-2 w-2 rounded-full',
              i === pageIndex ? 'bg-brand-600' : 'bg-border-strong',
            ].join(' ')}
          />
        ))}
      </div>

      <Button variant="primary" size="lg" onClick={handleNext} loading={updateProgress.isPending}>
        {isLast ? onboardingCopy.intro.start : onboardingCopy.intro.next}
      </Button>
    </div>
  )
}

export default OnboardingIntroPage
