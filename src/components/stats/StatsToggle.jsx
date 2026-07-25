/*
  Generic segmented toggle shared by the 통계 screen's two toggles — 기간
  (AC-1, 4 options) and 편차 그룹 (AC-2, 2 options). Same shape as
  components/plan/ModeToggle.jsx (aria-pressed buttons, active = fill + white
  text so the state reads by text/weight too, never color alone — NFR-017),
  generalized to an arbitrary `options` list instead of a hardcoded pair so
  one component covers both call sites here.

  `size="lg"` bumps each button to the 48px mobile touch-target minimum
  (ui-spec §0.4) on mobile ONLY — it shrinks back to the compact pill size at
  the `md` breakpoint, matching Desktop.Status.png's smaller period-toggle
  pills there (the same "grow on mobile, compact on desktop" split
  StatusBoard's own CTA button already does with two size variants + md:hidden
  — here it's one component with responsive classes instead of two buttons).
  The 2-option 편차 toggle fits comfortably at the default size everywhere.
*/
export function StatsToggle({ options, value, onChange, ariaLabel, size = 'md' }) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex flex-wrap rounded-full border border-border bg-surface p-0.5"
    >
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={[
              'rounded-full font-medium transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
              size === 'lg'
                ? 'min-h-[48px] px-4 text-body md:min-h-0 md:px-3 md:py-1 md:text-label'
                : 'px-3 py-1 text-label',
              active ? 'bg-brand-600 text-white' : 'text-text-muted hover:text-text',
            ].join(' ')}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

export default StatsToggle
