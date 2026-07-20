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

      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 md:px-6 md:pb-10">
        <Outlet />
      </main>

      <BottomTabBar />

      <UnsavedGuard />
      <Toaster />
    </div>
  )
}

export default AppLayout
