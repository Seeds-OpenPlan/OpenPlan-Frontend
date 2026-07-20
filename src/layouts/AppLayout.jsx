import { Outlet } from 'react-router-dom'
import TopNav from '../components/layout/TopNav'
import MobileTopBar from '../components/layout/MobileTopBar'
import BottomTabBar from '../components/layout/BottomTabBar'

// 공통 반응형 셸: 연회색 배경 + 헤더(데스크톱/모바일) + 하단 탭 + 중앙 콘텐츠.
// pb-24: 모바일에서 하단 고정 탭에 콘텐츠가 가리지 않도록 여백 확보.
function AppLayout() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <TopNav />
      <MobileTopBar />

      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 md:px-6 md:pb-10">
        <Outlet />
      </main>

      <BottomTabBar />
    </div>
  )
}

export default AppLayout
