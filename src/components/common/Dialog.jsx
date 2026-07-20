import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '../../hooks/useFocusTrap'

/*
  Centered modal dialog (components.md §6, desktop shell). Renders in a portal
  so it escapes ancestor overflow/stacking contexts.

  Dismissal is opt-in per surface:
  - onClose given → Esc and backdrop click call it (PTN-UNSAVED: Esc = safe
    "keep editing").
  - onClose omitted → no Esc, no backdrop dismiss (OVL-CONFLICT: a choice is the
    only exit).

  Focus is trapped and restored via useFocusTrap. `aria-modal` + aria-labelledby
  wire the dialog to its title for screen readers.
*/

export function Dialog({
  open,
  onClose,
  labelledById,
  initialFocusRef,
  returnFocusRef,
  size = 'sm', // 'sm' = small confirm; 'lg' = content modal
  children,
}) {
  const containerRef = useRef(null)

  useFocusTrap(containerRef, { open, initialFocusRef, returnFocusRef })

  // Lock background scroll while open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Esc closes only when dismissal is allowed (onClose present).
  useEffect(() => {
    if (!open || !onClose) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const widthClass = size === 'lg' ? 'max-w-lg' : 'max-w-sm'

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Scrim. Backdrop click closes only when dismissal is allowed. */}
      <div
        className="absolute inset-0 bg-[var(--color-overlay-scrim)] motion-safe:transition-opacity motion-safe:duration-slow"
        onClick={onClose ? () => onClose() : undefined}
        aria-hidden="true"
      />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledById}
        tabIndex={-1}
        className={[
          'relative w-full rounded-sheet bg-surface p-6 shadow-modal',
          'motion-safe:transition-transform motion-safe:duration-slow motion-safe:ease-emphasized',
          widthClass,
        ].join(' ')}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

export default Dialog
