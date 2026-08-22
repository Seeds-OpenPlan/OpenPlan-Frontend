import { useState } from 'react'
import { Button } from '../common/Button'
import { LoadingSkeleton } from '../common/LoadingSkeleton'
import { ErrorState } from '../common/ErrorState'
import { CalendarConnectionSection } from '../settings/CalendarConnectionSection'
import { useConnections } from '../../features/settings/useSettings'
import { useImportCandidates, useSubmitImportDecisions } from '../../features/onboarding/useOnboarding'
import { IMPORT_REFLECT_MODES, onboardingCopy } from '../../features/onboarding/onboardingCopy'

const RADIO_FIELD = 'flex items-center gap-1.5 text-caption text-text'

// ONB-09 — per-event reflect-mode choice, shown once at least one provider is
// connected AND has calendars selected (there is nothing to decide otherwise).
function ImportReviewList({ provider }) {
  const candidatesQuery = useImportCandidates(provider)
  const submitDecisions = useSubmitImportDecisions()
  const [decisions, setDecisions] = useState({}) // eventId -> mode
  const [submitted, setSubmitted] = useState(false)
  const c = onboardingCopy.calendar

  if (candidatesQuery.isLoading) return <LoadingSkeleton preset="listRow" count={2} />
  if (candidatesQuery.isError) {
    return <ErrorState variant="inline" onAction={() => candidatesQuery.refetch()} />
  }
  const events = candidatesQuery.data ?? []
  if (events.length === 0) return null

  const modeFor = (eventId) => decisions[eventId] ?? 'AS_IS'

  return (
    <section className="flex flex-col gap-3 rounded-card border border-border p-4">
      <div>
        <p className="text-label font-semibold text-text">{c.importHeading}</p>
        <p className="text-caption text-text-muted">{c.importBody}</p>
      </div>
      <ul className="flex flex-col gap-3">
        {events.map((ev) => (
          <li key={ev.id} className="flex flex-col gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
            <p className="text-label font-medium text-text">{ev.title}</p>
            {/* fieldset/legend — the group's accessible name, not a bare
                unlabeled radiogroup (색 단독 금지와 같은 원칙: 텍스트로 그룹
                의미를 명시). */}
            <fieldset className="flex flex-wrap gap-4">
              <legend className="sr-only">{ev.title} 반영 방식</legend>
              {IMPORT_REFLECT_MODES.map((opt) => (
                <label key={opt.value} className={RADIO_FIELD}>
                  <input
                    type="radio"
                    name={`import-mode-${ev.id}`}
                    checked={modeFor(ev.id) === opt.value}
                    onChange={() => setDecisions((prev) => ({ ...prev, [ev.id]: opt.value }))}
                  />
                  {opt.label}
                </label>
              ))}
            </fieldset>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-end gap-2">
        {submitted && <span className="text-caption text-success-700">{c.importSubmitted}</span>}
        <Button
          type="button"
          variant="secondary"
          size="md"
          loading={submitDecisions.isPending}
          onClick={() =>
            submitDecisions.mutate(
              { provider, decisions: events.map((ev) => ({ eventId: ev.id, mode: modeFor(ev.id) })) },
              { onSuccess: () => setSubmitted(true) },
            )
          }
        >
          {c.submitImport}
        </Button>
      </div>
    </section>
  )
}

/*
  ONB-07~09 (캘린더 3단계: 연동 → 캘린더 선택 → 반영 방식). Steps 1-2 embed the
  REAL CalendarConnectionSection as-is (connect toggle + calendar-selection
  dialog, FIX-13~17). Step 3 (per-event reflect mode) has no equivalent in the
  settings screen — it only matters during a first-time import — so it lives
  here as its own small addition, gated on "at least one provider is connected
  with calendars picked" (`activeProvider` below).

  This is the ONLY wizard step with a [나중에 하기] exit (AC2) — connecting an
  external calendar is optional, unlike the other three steps.
*/
export function OnboardingCalendarStep({ onFinish, onBack, finishing }) {
  const connectionsQuery = useConnections()
  const c = onboardingCopy.calendar

  const connections = connectionsQuery.data ?? []
  // W6: connections는 이제 provider가 아니라 connectionId로 식별되는, "이미
  // 수립된 연동만" 담은 배열이다 — connected 불리언 대신 status 문자열을 본다
  // (settingsApi.js getConnections 헤더 참조). 이 온보딩 단계 자체(3단계 반영
  // 방식 선택)는 손대지 않는다 — 이 한 줄만 새 모델에 맞춘다.
  const activeProvider = connections.find(
    (conn) => conn.status === 'CONNECTED' && conn.selectedCalendarIds.length > 0,
  )?.provider

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-title font-semibold text-text">{c.heading}</h2>
        <p className="mt-1 text-label text-text-muted">{c.body}</p>
      </div>

      <CalendarConnectionSection />

      {activeProvider ? (
        <ImportReviewList provider={activeProvider} />
      ) : (
        <p className="text-caption text-text-muted">{c.noCalendarConnected}</p>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="secondary" size="md" onClick={onBack}>
          {onboardingCopy.wizard.back}
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="md" onClick={onFinish} disabled={finishing}>
            {onboardingCopy.wizard.later}
          </Button>
          <Button type="button" variant="primary" size="md" onClick={onFinish} loading={finishing}>
            {onboardingCopy.wizard.finish}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default OnboardingCalendarStep
