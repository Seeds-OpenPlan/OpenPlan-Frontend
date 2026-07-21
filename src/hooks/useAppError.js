import { useCallback } from 'react'
import { resolveErrorSurface } from '../api/errorRouting'

/*
  Thin helper that turns an AppError into the surface a screen should show,
  reusing the single errorRouting catalog. No real consumer exists this cycle
  (all save screens are stubs), so this fixes the pattern that ST-F1-02/05/06/09
  will reuse: read error.code → resolveErrorSurface → open the matching surface.

  Kept as a hook so future screens can extend it with toast/analytics side
  effects without changing call sites.
*/
export function useAppError() {
  // Stable identity so callers can pass this into effect deps safely.
  const resolveSurface = useCallback((appError) => resolveErrorSurface(appError), [])

  return { resolveSurface }
}

export default useAppError
