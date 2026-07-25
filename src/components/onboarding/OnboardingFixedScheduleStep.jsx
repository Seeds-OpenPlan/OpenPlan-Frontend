import { useState } from 'react'
import { Button } from '../common/Button'
import SettingsFixedSchedulesPage from '../../pages/settings/SettingsFixedSchedulesPage'
import { onboardingCopy } from '../../features/onboarding/onboardingCopy'

/*
  ONB-05/06 (안내 + 설정). Embeds the REAL SettingsFixedSchedulesPage — same
  reuse rule as the availability step. Unlike that step, this page has no
  ongoing "dirty draft" (each create/edit commits immediately on its own
  submit); the only unsaved-input risk is the create/edit overlay being open
  when the user clicks 다음, so the gate is simply "is that overlay open right
  now" via the page's own `onDraftOpenChange` callback (see that file's header).

  Zero fixed schedules is a legitimate end state (not every user has recurring
  commitments) — 다음 is never blocked by an empty list, only by an open,
  unsubmitted form.
*/
export function OnboardingFixedScheduleStep({ onNext, onBack }) {
  const [draftOpen, setDraftOpen] = useState(false)
  const c = onboardingCopy.fixed

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-title font-semibold text-text">{c.heading}</h2>
        <p className="mt-1 text-label text-text-muted">{c.body}</p>
        <p className="mt-1 text-caption text-text-muted">{c.skipHint}</p>
      </div>

      <SettingsFixedSchedulesPage onDraftOpenChange={setDraftOpen} />

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="secondary" size="md" onClick={onBack}>
          {onboardingCopy.wizard.back}
        </Button>
        <div className="flex flex-col items-end gap-1">
          {draftOpen && <p className="text-caption text-text-muted">{onboardingCopy.wizard.unsavedHint}</p>}
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={onNext}
            disabled={draftOpen}
            disabledReason={draftOpen ? onboardingCopy.wizard.savedHint : undefined}
          >
            {onboardingCopy.wizard.next}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default OnboardingFixedScheduleStep
