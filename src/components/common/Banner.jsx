/*
  Banner atom (components.md §3). Full-width, sits below the header and pushes
  content down (not an overlay). role="status" + aria-live="polite" announce it
  once on appearance.

  `dismissible` defaults to false — the offline banner must NOT be dismissible
  (the user cannot silence the offline warning; sustained awareness matters more
  than tidiness — ui-spec §7). `icon` is required but aria-hidden; the message
  text carries the meaning (R5).
*/

const TONE_CLASSES = {
  warning: 'bg-warning-50 text-warning-700 border-warning-100',
  danger: 'bg-danger-50 text-danger-700 border-danger-100',
  info: 'bg-brand-50 text-brand-700 border-brand-100',
}

export function Banner({
  tone = 'warning',
  icon,
  message,
  dismissible = false,
  sticky = true,
  onDismiss,
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'flex w-full items-center gap-2 border-b px-4 py-2 text-label',
        'motion-safe:animate-[banner-slide-down_var(--duration-base)_var(--ease-standard)]',
        sticky ? 'sticky top-0 z-20' : '',
        TONE_CLASSES[tone],
      ].join(' ')}
    >
      <span aria-hidden="true" className="shrink-0">
        {icon}
      </span>
      <span className="flex-1">{message}</span>
      {dismissible && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="닫기"
          className="flex h-8 w-8 items-center justify-center rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <span aria-hidden="true">×</span>
        </button>
      )}
    </div>
  )
}

export default Banner
