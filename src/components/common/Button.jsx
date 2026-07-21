import { SpinnerIcon } from './statusIcons'
import { systemMessages } from '../../constants/systemMessages'

/*
  Button atom (components.md §1). Native <button> only — never a clickable div —
  so Enter/Space and focus come for free.

  States:
  - loading  → forces disabled, swaps the label for "처리 중", shows a spinner,
               and sets aria-busy="true" so screen readers announce the busy
               state via text, not motion alone (SYS-03 AC-2, R5).
  - disabled + disabledReason → the reason renders as always-visible adjacent
               text (never a hover-only tooltip), so keyboard and SR users get
               it without hovering (SYS-07 §7.2, ui-spec §7).

  Every color/radius references a semantic token — no raw palette classes.
*/

const VARIANT_CLASSES = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-700',
  secondary:
    'border border-border-strong text-text bg-surface hover:bg-surface-sunken active:bg-surface-sunken',
  danger:
    'border border-danger-600 text-danger-600 bg-surface hover:bg-danger-50 active:bg-danger-50',
}

// md = 40px desktop default; lg = 48px, the mobile touch-target minimum.
const SIZE_CLASSES = {
  md: 'h-10 px-4 text-label',
  lg: 'h-12 px-5 text-body',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingLabel = systemMessages.loading.processing,
  disabled = false,
  disabledReason,
  type = 'button',
  className = '',
  children,
  ...props
}) {
  const isDisabled = disabled || loading

  const button = (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-full font-medium',
        'transition-colors duration-fast ease-standard',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      ].join(' ')}
      {...props}
    >
      {loading && <SpinnerIcon className="animate-spin motion-reduce:animate-none" />}
      <span>{loading ? loadingLabel : children}</span>
    </button>
  )

  // When disabled with a reason, keep the reason in the DOM (SR-readable) as a
  // muted caption beside the control. Only render the wrapper when needed so the
  // common case stays a bare <button>.
  if (isDisabled && disabledReason) {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        {button}
        <span className="text-caption text-text-muted">{disabledReason}</span>
      </span>
    )
  }

  return button
}

export default Button
