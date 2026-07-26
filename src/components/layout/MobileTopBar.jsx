import { Link } from 'react-router-dom'
import { UserIcon } from './icons'
import { NotificationBell } from './NotificationBell'
import { BrandLogo } from '../common/BrandLogo'

// 모바일 공통 상단 헤더 (로고 + 알림 + 프로필). md 이상에서는 숨김.
function MobileTopBar() {
  return (
    <header className="border-b border-border bg-surface md:hidden">
      <div className="flex h-bar items-center justify-between px-page-x">
        {/* 로고 클릭 시 대시보드로 이동 (데스크톱 TopNav와 동일). */}
        <BrandLogo to="/" />
        {/* 알림(ST-F1-15, PNL-NOTI — 모바일은 NotificationBell 내부에서 자동으로
            BottomSheet 셸을 고른다) + 프로필(→ 설정 계정 관리). */}
        <div className="flex items-center gap-4 text-neutral-400">
          <NotificationBell />
          <Link
            to="/settings/account"
            aria-label="계정 관리"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-200 text-text-muted transition-colors hover:bg-neutral-300 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <UserIcon className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </header>
  )
}

export default MobileTopBar
