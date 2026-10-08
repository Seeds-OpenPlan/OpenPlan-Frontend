import { Link } from 'react-router-dom'
import { UserIcon } from './icons'
import { NotificationBell } from './NotificationBell'
import { BrandLogo } from '../common/BrandLogo'

// 모바일 공통 상단 헤더 (로고 + 알림 + 프로필). md 이상에서는 숨김.
function MobileTopBar() {
  return (
    // Thomas 리뷰 HIGH: viewport-fit=cover(index.html) 추가로 env(safe-area-
    // inset-top)이 실제 값을 돌려주는 기기(Android 15+ edge-to-edge 등)에서,
    // 이 헤더가 문서 맨 위(스크롤 0)에서 상태 바 밑에 깔릴 수 있다. 이
    // 헤더는 fixed/sticky가 아니라 일반 흐름이라 "진짜 높이"를 pt로 늘리면
    // 로고/아이콘이 상태 바 아래로 밀려 내려온다(h-bar가 안쪽 div에 있어
    // border-box 문제도 없다 — BottomTabBar.jsx의 C3 주석 참고). inset이
    // 0인 기기는 렌더 결과가 기존과 같다.
    <header className="border-b border-border bg-surface pt-[env(safe-area-inset-top)] md:hidden">
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
