import { useId, useRef } from 'react'
import { Dialog } from './Dialog'
import { Button } from './Button'
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard'
import { systemMessages } from '../../constants/systemMessages'

/*
  PTN-UNSAVED (ui-spec §5). Mounted once in AppLayout. Watches the single dirty
  flag via useUnsavedGuard + react-router's useBlocker; when a route change is
  blocked, shows a centered confirm dialog (kept centered on mobile too, §0.3).

  - "계속 편집" (primary, gets initial focus — the safe, non-destructive choice)
    → blocker.reset(): cancel navigation, input fully preserved (AC-3).
  - "나가기" (danger outline) → blocker.proceed() + clear dirty: navigation
    proceeds and the draft flag resets.
  - Esc = "계속 편집" (safe default): Dialog's onClose is wired to reset.

  When clean, useBlocker returns false and navigation passes through with no
  dialog (AC-2).
*/
const m = systemMessages.unsaved

export function UnsavedGuard() {
  const blocker = useUnsavedGuard()
  const titleId = useId()
  const stayRef = useRef(null)

  const open = blocker.state === 'blocked'

  const keepEditing = () => blocker.reset?.()
  const leave = () => blocker.proceed?.()

  return (
    <Dialog
      open={open}
      onClose={keepEditing}
      labelledById={titleId}
      initialFocusRef={stayRef}
      size="sm"
    >
      <h2 id={titleId} className="text-title font-bold text-text">
        {m.title}
      </h2>
      <p className="mt-2 text-body text-text-muted">{m.body}</p>
      <div className="mt-6 flex justify-end gap-2">
        {/* Destructive choice is NOT the default focus. */}
        <Button variant="danger" size="md" onClick={leave}>
          {m.leave}
        </Button>
        <Button ref={stayRef} variant="primary" size="md" onClick={keepEditing}>
          {m.stay}
        </Button>
      </div>
    </Dialog>
  )
}

export default UnsavedGuard
