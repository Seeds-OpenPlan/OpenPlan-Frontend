/*
  Badge atom (components.md §2). `label` is REQUIRED — a badge must never convey
  meaning by color alone (R5 / NFR-017). The optional leading dot is decorative;
  the label text is always the primary carrier of information.
*/

const TONE_CLASSES = {
  danger: 'bg-danger-100 text-danger-700',
  warning: 'bg-warning-100 text-warning-700',
  success: 'bg-success-100 text-success-700',
  neutral: 'bg-neutral-100 text-neutral-700',
  // ST-F1-08 (ui-spec §PROJ.0.2): "배치됨 {n}" reads as a blue/brand badge in
  // the reference PNG, which the prior 4-tone set had no slot for. Composed
  // from the EXISTING brand scale (no new token) — same shape as every other
  // tone pairing here (100 fill / 700 text, 600 dot).
  brand: 'bg-brand-100 text-brand-700',
}

const DOT_CLASSES = {
  danger: 'bg-danger-600',
  warning: 'bg-warning-600',
  success: 'bg-success-600',
  neutral: 'bg-neutral-500',
  brand: 'bg-brand-600',
}

export function Badge({ tone = 'neutral', label, className = '' }) {
  // Fail loudly in dev if a badge is rendered without a label — this is the
  // "color alone" guard the design asks to enforce at the component level.
  if (import.meta.env.DEV && !label) {
    throw new Error('Badge requires a non-empty `label` (color-alone rendering is forbidden).')
  }

  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-chip px-2 py-0.5',
        'text-caption font-medium',
        TONE_CLASSES[tone],
        className,
      ].join(' ')}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSES[tone]}`} aria-hidden="true" />
      {label}
    </span>
  )
}

export default Badge
