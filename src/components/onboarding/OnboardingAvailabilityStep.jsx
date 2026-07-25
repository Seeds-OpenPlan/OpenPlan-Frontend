import { Button } from '../common/Button'
import SettingsAvailabilityPage from '../../pages/settings/SettingsAvailabilityPage'
import { useAppStore } from '../../store/useAppStore'
import { onboardingCopy } from '../../features/onboarding/onboardingCopy'

/*
  ONB-03/04 (안내 + 설정). Embeds the REAL SettingsAvailabilityPage as-is — the
  task's explicit instruction ("②③④는 위 설정 화면 컴포넌트 재사용") is
  satisfied literally, not re-implemented, so this step and FIX-01~03's own
  settings screen can never drift into two different availability UIs.

  Next-button gate reuses the GLOBAL `dirty` flag (useAppStore) that
  SettingsAvailabilityPage already sets/clears around its own save mutation
  (SYS-04's one shared dirty flag, not a second page-local copy) — dirty=false
  covers BOTH "nothing changed, defaults are fine" and "changed AND saved
  successfully"; dirty=true is exactly the AC2 case ("저장 성공 후 진행") this
  gate must block. No new prop/plumbing needed on that page at all.
*/
export function OnboardingAvailabilityStep({ onNext, onBack }) {
  const dirty = useAppStore((s) => s.dirty)
  const c = onboardingCopy.availability

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-title font-semibold text-text">{c.heading}</h2>
        <p className="mt-1 text-label text-text-muted">{c.body}</p>
      </div>

      <SettingsAvailabilityPage />

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="secondary" size="md" onClick={onBack}>
          {onboardingCopy.wizard.back}
        </Button>
        <div className="flex flex-col items-end gap-1">
          {dirty && <p className="text-caption text-text-muted">{onboardingCopy.wizard.unsavedHint}</p>}
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={onNext}
            disabled={dirty}
            disabledReason={dirty ? onboardingCopy.wizard.savedHint : undefined}
          >
            {onboardingCopy.wizard.next}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default OnboardingAvailabilityStep
