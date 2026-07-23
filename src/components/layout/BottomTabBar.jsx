import { NavLink } from 'react-router-dom'
import { navItems } from './navItems'

// 모바일 하단 탭 내비게이션. 화면 하단 고정. md 이상에서는 숨김.
function BottomTabBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface md:hidden">
      <ul className="flex">
        {navItems.map(({ to, label, Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors ${
                  isActive ? 'text-brand-600' : 'text-neutral-400'
                }`
              }
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export default BottomTabBar
