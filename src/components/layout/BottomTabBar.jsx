import { NavLink } from 'react-router-dom'
import { navItems } from './navItems'

// 모바일 하단 탭 내비게이션. 화면 하단 고정. md 이상에서는 숨김.
//
// h-bar declares the height explicitly (56px, same token as TopNav/
// MobileTopBar) instead of leaving it to derive from content — before this,
// nothing in the codebase named "the tab bar's height" anywhere, which is
// exactly why three different spots (AppLayout's pb-24, Toaster's
// bottom-24, WeeklyPage's floating controls) each had to independently
// guess at a number to clear it. The bar's own content (icon + label +
// padding + border) previously totalled ~57px; h-bar rounds that down 1px
// to reuse the same value as the header bars above — imperceptible, and it
// only trims the last pixel of a tab item's own bottom padding, not any
// icon/label content.
function BottomTabBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 h-bar border-t border-border bg-surface md:hidden">
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
