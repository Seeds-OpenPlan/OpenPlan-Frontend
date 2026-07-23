import { BellIcon, UserIcon } from './icons'
import { BrandLogo } from '../common/BrandLogo'

// 모바일 공통 상단 헤더 (로고 + 알림 + 프로필). md 이상에서는 숨김.
function MobileTopBar() {
  return (
    <header className="border-b border-border bg-surface md:hidden">
      <div className="flex h-bar items-center justify-between px-page-x">
        {/* 로고 클릭 시 대시보드로 이동 (데스크톱 TopNav와 동일). */}
        <BrandLogo to="/" />
        {/* 알림 + 프로필: 데스크톱 TopNav와 동일한 자리표시자 쌍(기능은 ST-F1-12/15 소관). */}
        <div className="flex items-center gap-4 text-neutral-400">
          <BellIcon className="h-5 w-5" />
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-200 text-text-muted">
            <UserIcon className="h-5 w-5" />
          </span>
        </div>
      </div>
    </header>
  )
}

export default MobileTopBar
