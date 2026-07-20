import { useSyncExternalStore } from 'react'

/*
  Reports whether the user prefers reduced motion. Used by the skeleton to swap
  its shimmer animation for a static fill — a CSS `animation-duration: 0` alone
  can still leave a visible flash on some engines, so the component branches in
  JS instead (tokens.md §6, ui-spec §0.4).
*/

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(callback) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches
}

// SSR: assume no reduced-motion preference (animated default).
function getServerSnapshot() {
  return false
}

export function useReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export default useReducedMotion
