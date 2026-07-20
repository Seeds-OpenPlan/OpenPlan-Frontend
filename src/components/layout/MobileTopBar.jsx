import { BellIcon } from './icons'

// 모바일 공통 상단 헤더 (로고 + 알림). md 이상에서는 숨김.
function MobileTopBar() {
  return (
    <header className="border-b border-slate-200 bg-white md:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <span className="text-lg font-bold text-blue-600">OpenPlan</span>
        <BellIcon className="h-5 w-5 text-slate-400" />
      </div>
    </header>
  )
}

export default MobileTopBar
