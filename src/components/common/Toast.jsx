import { useEffect, useRef, useState } from 'react'
import { AlertTriangleIcon, CheckCircleIcon } from './statusIcons'

/*
  Single toast (components.md §5). role="status" + aria-live="polite" so it is
  announced once. Auto-dismisses after `duration` ms; the timer pauses on
  hover/focus so a user reading it isn't cut off. Dismissible via a 48px close
  button. The icon is aria-hidden — the message text carries the meaning (R5).
*/

const TONE = {
  success: { icon: CheckCircleIcon, text: 'text-success-700', iconColor: 'text-success-600' },
  info: { icon: CheckCircleIcon, text: 'text-brand-700', iconColor: 'text-brand-600' },
  // Errors must NOT read as a success check — a warning glyph + danger color.
  error: { icon: AlertTriangleIcon, text: 'text-danger-700', iconColor: 'text-danger-600' },
}

export function Toast({ tone = 'success', message, duration = 4000, action, onDismiss }) {
  const [paused, setPaused] = useState(false)
  const timerRef = useRef(null)
  const { icon: Icon, text, iconColor } = TONE[tone] ?? TONE.success

  // Toaster (the only caller) passes a fresh `onDismiss` arrow function on
  // every render — including a re-render triggered by an unrelated toast
  // being pushed/dismissed elsewhere in the shared queue. A ref, read inside
  // the timer callback rather than closed over directly, keeps the
  // auto-dismiss effect's own deps down to `[paused, duration]` (same
  // onCloseRef pattern as Dialog.jsx/BottomSheet.jsx). Without this split,
  // that sibling re-render would change the effect's deps, forcing a
  // cleanup+restart that resets THIS toast's timer back to full `duration`
  // instead of letting it keep counting down its remaining time.
  const onDismissRef = useRef(onDismiss)
  useEffect(() => {
    onDismissRef.current = onDismiss
  })

  // Auto-dismiss timer, paused while hovered/focused.
  useEffect(() => {
    if (paused || !duration) return
    timerRef.current = setTimeout(() => onDismissRef.current?.(), duration)
    return () => clearTimeout(timerRef.current)
  }, [paused, duration])

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={[
        'pointer-events-auto flex items-center gap-2 rounded-card bg-surface px-4 py-3 shadow-toast',
        'border border-border text-label',
        'motion-safe:animate-[toast-rise_var(--duration-base)_var(--ease-standard)]',
        text,
      ].join(' ')}
    >
      <Icon className={`shrink-0 ${iconColor}`} size={20} />
      <span className="flex-1">{message}</span>
      {action && (
        <button
          type="button"
          onClick={() => {
            action.onClick?.()
            onDismiss?.()
          }}
          className="shrink-0 rounded-control px-2 py-1 text-label font-semibold text-brand-700 transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          {action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => onDismiss?.()}
        aria-label="닫기"
        className="flex h-8 w-8 items-center justify-center rounded-control text-text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  )
}

export default Toast
