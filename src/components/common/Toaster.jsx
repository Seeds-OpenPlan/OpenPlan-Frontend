import { createPortal } from 'react-dom'
import { Toast } from './Toast'
import { useToastStore, useToasts } from '../../hooks/useToasts'

/*
  Toast host (design-handoff §1). Mounted once in AppLayout. Subscribes to the
  toast queue and renders each toast bottom-center. The bottom offset clears the
  mobile BottomTabBar (matches AppLayout's pb-24 pattern) so toasts are never
  hidden behind it.

  This cycle only the reconnect toast ("다시 연결되었습니다") fires; the queue is
  ready for later save-success toasts.
*/
export function Toaster() {
  const toasts = useToasts()
  const dismiss = useToastStore((s) => s.dismiss)

  if (toasts.length === 0) return null

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex flex-col items-center gap-2 px-4 md:bottom-6">
      {toasts.map((t) => (
        <Toast
          key={t.id}
          tone={t.tone}
          message={t.message}
          duration={t.duration}
          action={t.action}
          onDismiss={() => dismiss(t.id)}
        />
      ))}
    </div>,
    document.body,
  )
}

export default Toaster
