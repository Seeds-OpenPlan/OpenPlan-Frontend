import { useBlocker } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'

/*
  Blocks in-app route changes while there are unsaved edits (SYS-04). Reads the
  ONE dirty flag from the Zustand store — screens must not reimplement dirty
  tracking (AC-4). Pairs the flag with react-router 7's stable useBlocker.

  Returns the blocker so the UnsavedGuard component can drive the confirm dialog:
  - blocker.state === 'blocked' → show the dialog
  - blocker.proceed()          → user chose "나가기" (leave)
  - blocker.reset()            → user chose "계속 편집" (keep editing, input preserved)

  When clean, the blocker function returns false so navigation passes through
  with no friction (AC-2).
*/
export function useUnsavedGuard() {
  const dirty = useAppStore((s) => s.dirty)

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  )

  return blocker
}

export default useUnsavedGuard
