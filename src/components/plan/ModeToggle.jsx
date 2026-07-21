/*
  가용/24h view toggle (PLAN-04). Two-option segmented control:
  - 집중 (focus): show only availability windows (non-available hours collapsed).
  - 24h: show the full day plus availability boundary lines (and, only here, the
    availability-edge drag handles for PLAN-32).

  Implemented as two aria-pressed buttons rather than color-only chips, and each
  carries a text label, so the active mode is conveyed by text + pressed state,
  never color alone (NFR-017).
*/
const OPTIONS = [
  { value: 'focus', label: '집중' },
  { value: '24h', label: '24h' },
]

export function ModeToggle({ mode, onChange }) {
  return (
    <div
      role="group"
      aria-label="시간 범위 보기"
      className="inline-flex rounded-full border border-border bg-surface p-0.5"
    >
      {OPTIONS.map((opt) => {
        const active = mode === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={[
              'rounded-full px-3 py-1 text-label font-medium transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
              active
                ? 'bg-brand-600 text-white'
                : 'text-text-muted hover:text-text',
            ].join(' ')}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

export default ModeToggle
