import { Link, NavLink } from 'react-router-dom'
import { navItems } from './navItems'
import { BellIcon, UserIcon } from './icons'

// 데스크톱 공통 상단 헤더 + 상단 내비게이션. md 미만에서는 숨김.
function TopNav() {
  return (
    <header className="hidden border-b border-border bg-surface md:block">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        {/* 로고 클릭 시 대시보드로 이동. 메뉴는 가운데 정렬(justify-between). */}
        <Link
          to="/"
          className="rounded text-lg font-bold text-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          OpenPlan
        </Link>

        {/* Horizontal pill tabs: icon-only at rest, the label expands on hover
            (and stays open for the active tab so the current page is labeled). */}
        <nav className="flex items-center gap-1">
          {navItems.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `group flex items-center rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-600'
                    : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="h-5 w-5 shrink-0" />
                  <span
                    className={`overflow-hidden whitespace-nowrap transition-all duration-200 ease-out motion-reduce:transition-none ${
                      isActive
                        ? 'ml-2 max-w-[6rem] opacity-100'
                        : 'ml-0 max-w-0 opacity-0 group-hover:ml-2 group-hover:max-w-[6rem] group-hover:opacity-100'
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
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-200 text-text-muted">
            <UserIcon className="h-5 w-5" />
          </span>
        </div>
      </div>
    </header>
  )
}

export default TopNav
