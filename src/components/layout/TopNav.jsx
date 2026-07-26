import { NavLink, Link } from 'react-router-dom'
import { navItems } from './navItems'
import { BellIcon, UserIcon } from './icons'
import { BrandLogo } from '../common/BrandLogo'

// 데스크톱 공통 상단 헤더 + 상단 내비게이션. md 미만에서는 숨김.
function TopNav() {
  return (
    <header className="hidden border-b border-border bg-surface md:block">
      <div className="mx-auto flex h-bar max-w-page items-center justify-between px-page-x">
        {/* 로고 클릭 시 대시보드로 이동. 메뉴는 가운데 정렬(justify-between). */}
        <BrandLogo to="/" />

        {/* Horizontal pill tabs: icon-only at rest, the label expands on hover
            (and stays open for the active tab so the current page is labeled). */}
        <nav className="flex items-center gap-1">
          {navItems.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `group flex items-center rounded-full px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                  isActive
                    ? 'bg-brand-50 text-brand-600'
                    : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="h-5 w-5 shrink-0" />
                  {/* Label expands on hover (mouse) AND on keyboard focus
                      (group-focus-visible) — before this it only expanded on
                      group-hover, so Tab-ing through the inactive tabs left
                      their labels collapsed with no way to read which tab is
                      focused short of the focus ring alone. */}
                  <span
                    className={`overflow-hidden whitespace-nowrap transition-all duration-200 ease-out motion-reduce:transition-none ${
                      isActive
                        ? 'ml-2 max-w-[6rem] opacity-100'
                        : 'ml-0 max-w-0 opacity-0 group-hover:ml-2 group-hover:max-w-[6rem] group-hover:opacity-100 group-focus-visible:ml-2 group-focus-visible:max-w-[6rem] group-focus-visible:opacity-100'
                    }`}
                  >
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-4 text-neutral-400">
          <BellIcon className="h-5 w-5" />
          {/* 프로필 → 설정 계정 관리 (ACCT-01/02). */}
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

export default TopNav
