import { LoadingSkeleton } from '../components/common/LoadingSkeleton'

/*
  Shown by the data router while the root loader (the session guard, ST-F1-01)
  resolves on the very first load. Without it the router renders nothing during
  that window, which flashes a blank page (and reads as "the app didn't load").
  A lightweight shell + skeleton keeps the frame present instead — never a
  full-screen spinner (SYS-03 R3).
*/
export function HydrateFallback() {
  return (
    <div className="min-h-screen bg-surface-sunken text-text">
      <header className="border-b border-border bg-surface px-4 py-3">
        <span className="text-title font-bold text-brand-600">OpenPlan</span>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        <LoadingSkeleton preset="card" />
      </main>
    </div>
  )
}

export default HydrateFallback
