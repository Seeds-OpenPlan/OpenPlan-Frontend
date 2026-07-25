import { Outlet } from 'react-router-dom'
import TopNav from '../components/layout/TopNav'
import MobileTopBar from '../components/layout/MobileTopBar'
import BottomTabBar from '../components/layout/BottomTabBar'
import { OfflineBanner } from '../components/common/OfflineBanner'
import { UnsavedGuard } from '../components/common/UnsavedGuard'
import { Toaster } from '../components/common/Toaster'
import { TutorialOverlay } from '../components/tutorial/TutorialOverlay'

/*
  공통 반응형 셸: 연회색 배경 + 헤더(데스크톱/모바일) + 하단 탭 + 중앙 콘텐츠.

  px-page-x (no md: override) is intentionally the SAME at every breakpoint:
  TopNav and MobileTopBar both use px-page-x too, so keeping this one token
  in sync with them keeps the logo and the page content horizontally aligned
  at every viewport width, with no left/right jump at the md breakpoint.
  max-w-page likewise matches TopNav's own max-width.

  pb-24 reserves room below the mobile BottomTabBar so content never sits
  under it — 96px = --spacing-bar (56px, the tab bar's own height) + 40px of
  breathing room. Kept as the literal pb-24 utility (not a calc() off the
  token) so this exact, owner-approved 96px render value can never drift from
  an arithmetic slip; Toaster's bottom-24 and WeeklyPage's floating-controls
  bottom-18 are the other two spots that clear the same bar and carry the
  same kind of comment. Only the vertical side (pb-24 vs md:pb-10) differs
  by breakpoint, because that difference is real: BottomTabBar exists below
  md, not above it.

  This shell hosts the three app-wide common-state surfaces once each:
  - OfflineBanner sits directly under the header and pushes content down (not an
    overlay), so the offline warning is visible on every page (SYS-07).
  - UnsavedGuard watches the single dirty flag and blocks route changes (SYS-04).
  - Toaster is the global toast host (recovery toast, later save toasts).
  - TutorialOverlay (ST-F1-13) hosts OVL-TUT — it self-gates on onboarding-
    progress and renders nothing outside an active tutorial run, same
    self-gating shape OfflineBanner already has for "not offline".
  These are placement-only; all surface logic lives in components/common
  (TutorialOverlay's own logic lives in components/tutorial).
*/
function AppLayout() {
  return (
    <div className="min-h-screen bg-surface-sunken text-text">
      <TopNav />
      <MobileTopBar />
      <OfflineBanner />

      <main className="mx-auto max-w-page px-page-x py-6 pb-24 md:pb-10">
        <Outlet />
      </main>

      <BottomTabBar />

      <UnsavedGuard />
      <Toaster />
      <TutorialOverlay />
    </div>
  )
}

export default AppLayout
