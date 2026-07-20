import { useEffect, useRef } from 'react'
import { AlertTriangleIcon } from './statusIcons'
import { Button } from './Button'
import { systemMessages } from '../../constants/systemMessages'

/*
  PTN-ERROR in three variants (ui-spec §3):
  - page    : global fallback for the router errorElement. Wraps itself in a
              minimal top-level shell (logo only) because the AppLayout frame may
              have collapsed. Moves focus to <h1> so SR users hear the new state
              (§0.4). Default action reloads the whole app (safe reset when state
              is broken).
  - section : an area failed inside an otherwise-working page. role="alert" so
              it's announced without stealing focus.
  - inline  : a write action failed; a one-liner beside the button. role="alert".

  Copy comes from systemMessages (the single source for SYS surface copy). A
  render-time throw caught by the router shows the page variant; consumers of
  section/inline pass their own title/description.
*/

const m = systemMessages.error

export function ErrorState({
  variant = 'section',
  title,
  description,
  actionLabel,
  onAction,
}) {
  const headingRef = useRef(null)

  // Page variant moves focus to the heading on mount for immediate SR announce.
  useEffect(() => {
    if (variant === 'page' && headingRef.current) {
      headingRef.current.focus()
    }
  }, [variant])

  if (variant === 'page') {
    const handleAction = onAction ?? (() => window.location.reload())
    return (
      <div className="min-h-screen bg-surface-sunken text-text">
        <header className="border-b border-border bg-surface px-4 py-3">
          <span className="text-title font-bold text-brand-600">OpenPlan</span>
        </header>
        <main className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-20 text-center">
          <AlertTriangleIcon className="text-warning-600" size={64} />
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-heading font-bold text-balance outline-none"
          >
            {title ?? m.pageTitle}
          </h1>
          <p className="max-w-[42ch] text-body text-text-muted">{description ?? m.pageBody}</p>
          <Button variant="primary" size="lg" onClick={handleAction}>
            {actionLabel ?? m.refresh}
          </Button>
        </main>
      </div>
    )
  }

  if (variant === 'inline') {
    return (
      <span role="alert" className="inline-flex items-center gap-2 text-label text-danger-700">
        <AlertTriangleIcon className="shrink-0 text-danger-600" size={16} />
        <span>{title ?? m.writeTitle}</span>
        {onAction && (
          <Button variant="secondary" size="md" onClick={onAction}>
            {actionLabel ?? m.retry}
          </Button>
        )}
      </span>
    )
  }

  // section
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface px-4 py-8 text-center"
    >
      <AlertTriangleIcon className="text-warning-600" size={32} />
      <p className="text-body font-medium">{title ?? m.sectionBody}</p>
      {description && <p className="max-w-[42ch] text-label text-text-muted">{description}</p>}
      {onAction && (
        <Button variant="secondary" size="md" onClick={onAction}>
          {actionLabel ?? m.retry}
        </Button>
      )}
    </div>
  )
}

export default ErrorState
