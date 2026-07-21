import { useEffect, useSyncExternalStore } from 'react'
import { useAppStore } from '../store/useAppStore'

/*
  Single source of truth for network online/offline (SYS-07). The primitive
  value is read via useSyncExternalStore straight from navigator.onLine + the
  browser online/offline events — that is the most accurate, tear-free source.

  The adopted design (story §2.1) also mirrors the value into the Zustand
  `online` slice so a `canWrite` selector can live in the store where save
  buttons subscribe. This hook is the ONLY writer of that slice; components read
  either this hook (for the raw boolean) or the store (for derived canWrite).
*/

function subscribe(callback) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

// navigator.onLine is the browser's authoritative snapshot for getSnapshot.
function getSnapshot() {
  return navigator.onLine
}

// SSR has no navigator; assume online so the server render shows no banner.
function getServerSnapshot() {
  return true
}

export function useOnlineStatus() {
  const online = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const setOnline = useAppStore((s) => s.setOnline)

  // Mirror the primitive into the store. Runs only when `online` flips, so the
  // store stays the derived-selector source without becoming a second source
  // of truth (this hook remains authoritative).
  useEffect(() => {
    setOnline(online)
  }, [online, setOnline])

  return online
}

export default useOnlineStatus
