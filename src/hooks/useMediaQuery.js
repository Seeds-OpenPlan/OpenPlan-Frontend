import { useSyncExternalStore } from 'react'

/*
  Reports whether a CSS media query currently matches. Used to pick the modal
  shell for OVL-CONFLICT (centered Dialog on desktop, BottomSheet on mobile —
  ui-spec §0.3) without rendering both DOM trees.
*/
export function useMediaQuery(query) {
  return useSyncExternalStore(
    (callback) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', callback)
      return () => mql.removeEventListener('change', callback)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

// Tailwind's `md` breakpoint (>=768px) = desktop shell.
export function useIsDesktop() {
  return useMediaQuery('(min-width: 768px)')
}

export default useMediaQuery
