/*
  ProgressBar atom (ui-spec §PROJ.0.3). Shared between the project screens
  (completion rate on a project card / workspace header) and the dashboard
  (ui-spec-dash) — both read a plain "done / total" ratio, so one component
  covers both instead of two near-duplicates.

  Color alone never carries the meaning (NFR-017): the fill is a decorative
  `aria-hidden` track, and `role="progressbar"` + the caller-supplied
  `aria-label` (e.g. "완료 2/4") is what a screen reader announces. The visual
  "완료 {n}" text living beside the bar is the caller's job, not this atom's —
  see ProjectCard for the sibling text that satisfies that requirement.
*/
export function ProgressBar({ value, max, label, className = '' }) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0

  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className={`h-1.5 w-full rounded-full bg-neutral-200 ${className}`}
    >
      <div
        aria-hidden="true"
        className="h-full rounded-full bg-brand-600 transition-[width] duration-base ease-standard"
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  )
}

export default ProgressBar
