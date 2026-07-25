import { WIZARD_STEPS } from '../../features/onboarding/onboardingCopy'

/*
  Visual progress header for SCR-ONB-* (스텝퍼 4단계). `aria-current="step"` on
  the active item is the accessible-name equivalent of the filled dot — a
  screen reader announces "프로필, 현재 단계" rather than relying on color/fill
  alone (NFR-017). Completed steps get a checkmark GLYPH (text character, not
  an icon-only color swap) so "done" is legible without color either.
*/
export function OnboardingStepper({ currentIndex }) {
  return (
    <ol className="flex items-center gap-1" aria-label="온보딩 단계">
      {WIZARD_STEPS.map((step, i) => {
        const isDone = i < currentIndex
        const isCurrent = i === currentIndex
        return (
          <li key={step.key} className="flex flex-1 items-center gap-1">
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={[
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-caption font-semibold',
                  isDone
                    ? 'bg-brand-600 text-white'
                    : isCurrent
                      ? 'border-2 border-brand-600 text-brand-700'
                      : 'border border-border-strong text-text-muted',
                ].join(' ')}
              >
                {isDone ? '✓' : i + 1}
              </span>
              <span
                aria-current={isCurrent ? 'step' : undefined}
                className={['text-caption', isCurrent ? 'font-semibold text-text' : 'text-text-muted'].join(' ')}
              >
                {step.label}
              </span>
            </span>
            {i < WIZARD_STEPS.length - 1 && (
              <span aria-hidden="true" className={['mx-1 h-px flex-1', isDone ? 'bg-brand-600' : 'bg-border'].join(' ')} />
            )}
          </li>
        )
      })}
    </ol>
  )
}

export default OnboardingStepper
