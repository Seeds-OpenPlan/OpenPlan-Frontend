import { Outlet } from 'react-router-dom'
import TopNav from '../components/layout/TopNav'
import MobileTopBar from '../components/layout/MobileTopBar'
import BottomTabBar from '../components/layout/BottomTabBar'
import { OfflineBanner } from '../components/common/OfflineBanner'
import { UnsavedGuard } from '../components/common/UnsavedGuard'
import { Toaster } from '../components/common/Toaster'

/*
  공통 반응형 셸: 연회색 배경 + 헤더(데스크톱/모바일) + 하단 탭 + 중앙 콘텐츠.
  pb-24: 모바일에서 하단 고정 탭에 콘텐츠가 가리지 않도록 여백 확보.

  px-4 is intentionally the SAME at every breakpoint (no md:px-6): TopNav and
  MobileTopBar both use px-4 for their own horizontal padding, so keeping this
  one value in sync with them keeps the logo and the page content
  horizontally aligned at every viewport width, with no left/right jump at
  the md breakpoint. Only the vertical side (pb-24 vs md:pb-10) differs, because
  that difference is real: BottomTabBar exists below md, not above it.

  This shell hosts the three app-wide common-state surfaces once each:
  - OfflineBanner sits directly under the header and pushes content down (not an
    overlay), so the offline warning is visible on every page (SYS-07).
  - UnsavedGuard watches the single dirty flag and blocks route changes (SYS-04).
  - Toaster is the global toast host (recovery toast, later save toasts).
  These are placement-only; all surface logic lives in components/common.
*/
function AppLayout() {
  return (
    <div className="min-h-screen bg-surface-sunken text-text">
      <TopNav />
      <MobileTopBar />
      <OfflineBanner />

      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 md:pb-10">
        <Outlet />
      </main>

      <BottomTabBar />

      <UnsavedGuard />
      <Toaster />
    </div>
  )
}

export default AppLayout
