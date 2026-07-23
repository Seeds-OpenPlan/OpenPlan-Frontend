import { LoadingSkeleton } from '../components/common/LoadingSkeleton'
import { BrandLogo } from '../components/common/BrandLogo'

/*
  Shown by the data router while the root loader (the session guard, ST-F1-01)
  resolves on the very first load. Without it the router renders nothing during
  that window, which flashes a blank page (and reads as "the app didn't load").
  A lightweight shell + skeleton keeps the frame present instead — never a
  full-screen spinner (SYS-03 R3).

  px-page-x/max-w-page (no md: override), same tokens as AppLayout's <main>:
  this shell is replaced by AppLayout the moment the loader resolves, so its
  horizontal sizing must match AppLayout's or the content jumps sideways on
  desktop right as loading finishes.

  py-6 stays a plain, unsplit value (no pb-24/md:pb-10 split): unlike
  AppLayout, this shell never renders BottomTabBar itself, so there's no
  fixed bottom bar here for a taller mobile bottom padding to clear.

  The header below matches TopNav/MobileTopBar's FRAME ONLY (height h-bar,
  border, background, logo position) — not their content: this shell never
  shows nav items, bell, or profile, so it doesn't render placeholders for
  them either. Matching just the frame is what makes the swap to the real
  header (the instant the loader resolves) land without a vertical jump;
  content differing is fine because nothing is visible long enough to compare.
*/
export function HydrateFallback() {
  return (
    <div className="min-h-screen bg-surface-sunken text-text">
      <header className="flex h-bar items-center border-b border-border bg-surface px-page-x">
        <BrandLogo />
      </header>
      <main className="mx-auto max-w-page px-page-x py-6">
        <LoadingSkeleton preset="card" />
      </main>
    </div>
  )
}

export default HydrateFallback
