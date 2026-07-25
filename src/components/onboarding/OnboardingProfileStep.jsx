import { useState } from 'react'
import { Button } from '../common/Button'
import { WEEKDAY_KEYS, WEEKDAY_LABELS_KO } from '../../features/plan/planTime'
import { PURPOSE_OPTIONS, TIMEZONE_OPTIONS, onboardingCopy } from '../../features/onboarding/onboardingCopy'

const SELECT_FIELD =
  'w-full rounded-control border border-border bg-surface px-3 py-2 text-label text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring'

// ONB-02 "이름, 사용 목적, 가용 시간대, 주 시작 요일". This step is the one
// wizard screen with NO existing settings page to embed (that pairing only
// covers availability/fixed-schedule/calendar) — a small self-contained form,
// its own local draft only (nothing is committed until "다음").
export function OnboardingProfileStep({ initial, onNext, submitting }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [purpose, setPurpose] = useState(initial?.purpose ?? PURPOSE_OPTIONS[0].value)
  const [timezone, setTimezone] = useState(initial?.timezone ?? TIMEZONE_OPTIONS[0].value)
  const [weekStartDay, setWeekStartDay] = useState(initial?.weekStartDay ?? WEEKDAY_KEYS[0])
  const [touched, setTouched] = useState(false)

  const c = onboardingCopy.profile
  const nameInvalid = touched && name.trim() === ''

  const handleSubmit = (e) => {
    e.preventDefault()
    setTouched(true)
    if (name.trim() === '') return
    onNext({ name: name.trim(), purpose, timezone, weekStartDay })
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
      <div>
        <h2 className="text-title font-semibold text-text">{c.heading}</h2>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">{c.nameLabel}</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder={c.namePlaceholder}
          className={SELECT_FIELD}
          aria-invalid={nameInvalid || undefined}
          aria-describedby={nameInvalid ? 'onb-profile-name-error' : undefined}
        />
        {nameInvalid && (
          <p id="onb-profile-name-error" role="alert" className="text-caption text-danger-700">
            {c.nameRequired}
          </p>
        )}
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">{c.purposeLabel}</span>
        <select value={purpose} onChange={(e) => setPurpose(e.target.value)} className={SELECT_FIELD}>
          {PURPOSE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">{c.timezoneLabel}</span>
        <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={SELECT_FIELD}>
          {TIMEZONE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">{c.weekStartLabel}</span>
        <select value={weekStartDay} onChange={(e) => setWeekStartDay(e.target.value)} className={SELECT_FIELD}>
          {WEEKDAY_KEYS.map((key, i) => (
            <option key={key} value={key}>
              {WEEKDAY_LABELS_KO[i]}요일
            </option>
          ))}
        </select>
      </label>

      <div className="mt-2 flex justify-end">
        <Button type="submit" variant="primary" size="md" loading={submitting}>
          다음
        </Button>
      </div>
    </form>
  )
}

export default OnboardingProfileStep
