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
    // C3: Android의 edge-to-edge 제스처 바가 WebView 위로 겹치는 기기에서,
    // 탭 아이콘이 그 바 밑에 깔리지 않도록 바 자체를 그만큼 더 키운다(없는
    // 기기는 env()가 0이라 h-bar와 동일). `pb-[...]`가 아니라 `height`에
    // 얹는 이유 — 이 요소는 border-box라 padding을 더하면 안쪽 아이콘·라벨
    // 영역이 그만큼 줄어들 뿐 바 전체는 안 커진다; height를 늘리면 늘어난
    // 몫이 아이콘 아래 빈 공간(제스처 영역)이 되고 아이콘 위치는 그대로다.
    // 이 바의 "진짜 위쪽 경계"가 그만큼 위로 올라오므로, 이걸 가리지 않으려고
    // 재는 다른 세 지점(AppLayout의 pb-24, Toaster의 bottom-24, WeeklyPage
    // 플로팅 컨트롤의 bottom-18/bottom-36)도 같은 env()만큼 함께 올려야
    // 한다 — 그쪽 각자의 C3 주석 참고.
    <nav className="fixed inset-x-0 bottom-0 z-10 h-[calc(var(--spacing-bar)+env(safe-area-inset-bottom))] border-t border-border bg-surface md:hidden">
      <ul className="flex">
        {navItems.map(({ to, label, Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
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
