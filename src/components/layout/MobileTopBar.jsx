import { Link } from 'react-router-dom'
import { BellIcon } from './icons'

// 모바일 공통 상단 헤더 (로고 + 알림). md 이상에서는 숨김.
function MobileTopBar() {
  return (
    <header className="border-b border-slate-200 bg-white md:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        {/* 로고 클릭 시 대시보드로 이동 (데스크톱 TopNav와 동일). */}
        <Link
          to="/"
          className="rounded text-lg font-bold text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
        >
          OpenPlan
        </Link>
        <BellIcon className="h-5 w-5 text-slate-400" />
      </div>
    </header>
  )
}

export default MobileTopBar
