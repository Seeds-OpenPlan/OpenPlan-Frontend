import { useId } from 'react'

/*
  Toggle atom (boolean on/off — distinct from ModeToggle, which is a segmented
  choice between two named options). Native `role="switch"` button so the knob
  POSITION (left = off, right = on), not color alone, is the primary visual
  signal (NFR-017) — a colorblind user still reads on/off from where the knob
  sits. `aria-checked` gives screen readers the state regardless.

  `showStateText` additionally renders a visible "켜짐"/"꺼짐" caption beside the
  switch. Off by default (matches every reference PNG, which shows a bare
  switch — knob position already carries the state); ST-F1-12's 알림 screen
  turns it on because NOTI-01's own AC requires the text pairing explicitly.
*/
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  disabledReason,
  showStateText = false,
  size = 'md', // 'md' = list-row default; 'sm' = compact (inline within a row)
  // Accessible name for the BARE-switch shape (no `label`) — a caller that
  // already shows the subject's name elsewhere in its own row layout (e.g.
  // SettingsAvailabilityPage's per-weekday row) passes this instead of the
  // generic '전환' fallback, without rendering a second, redundant visible label.
  ariaLabel,
}) {
  const labelId = useId()
  const track = size === 'sm' ? 'h-6 w-11' : 'h-7 w-12'
  const knob = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6'

  const switchEl = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      // A sibling <span>, not a wrapping <label>, carries the visible text
      // below — aria-labelledby is what gives the button its accessible name
      // in that shape (a bare aria-label would work too, but would then have
      // to duplicate the visible label string in two places).
      aria-labelledby={label ? labelId : undefined}
      aria-label={label ? undefined : (ariaLabel ?? '전환')}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex shrink-0 items-center rounded-full transition-colors duration-fast ease-standard',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        track,
        checked ? 'bg-brand-600' : 'bg-neutral-300',
      ].join(' ')}
    >
      <span
        aria-hidden="true"
        className={[
          'inline-block rounded-full bg-white shadow-sm transition-transform duration-fast ease-standard',
          knob,
          checked ? 'translate-x-5' : 'translate-x-1',
        ].join(' ')}
      />
    </button>
  )

  // Bare switch (no label) — caller composes its own row layout and supplies
  // its own accessible name some other way (e.g. a wrapping <label>).
  if (!label) return switchEl

  return (
    <div className="flex items-center justify-between gap-3">
      <span id={labelId} className="flex flex-col">
        <span className="text-label font-medium text-text">{label}</span>
        {description && <span className="text-caption text-text-muted">{description}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {showStateText && (
          <span className="text-caption text-text-muted">{checked ? '켜짐' : '꺼짐'}</span>
        )}
        {switchEl}
      </span>
      {disabled && disabledReason && <span className="sr-only">{disabledReason}</span>}
    </div>
  )
}

export default Toggle
