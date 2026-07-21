import { Link, NavLink } from 'react-router-dom'
import { navItems } from './navItems'
import { BellIcon, UserIcon } from './icons'

// 데스크톱 공통 상단 헤더 + 상단 내비게이션. md 미만에서는 숨김.
function TopNav() {
  return (
    <header className="hidden border-b border-slate-200 bg-white md:block">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        {/* 로고 클릭 시 대시보드로 이동. 메뉴는 가운데 정렬(justify-between). */}
        <Link
          to="/"
          className="rounded text-xl font-bold text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
        >
          OpenPlan
        </Link>

        <nav className="flex items-center gap-8">
          {navItems.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 text-xs font-medium transition-colors ${
                  isActive ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
                }`
              }
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-4 text-slate-400">
          <BellIcon className="h-5 w-5" />
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-slate-500">
            <UserIcon className="h-5 w-5" />
          </span>
        </div>
      </div>
    </header>
  )
}

export default TopNav
