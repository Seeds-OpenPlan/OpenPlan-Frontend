import { Link } from 'react-router-dom'

// Both current call sites use text-lg (18px/1.75rem); ErrorState's page
// fallback is the one exception (see below), so it's a lookup rather than a
// single hardcoded class.
const SIZE_CLASS = {
  lg: 'text-lg',
  title: 'text-title',
}

/*
  "OpenPlan" wordmark, shared by every header/shell that shows it: TopNav,
  MobileTopBar, HydrateFallback's loading skeleton, and ErrorState's page
  fallback. Pulled out because those four had each hand-copied the same
  font/weight/color classes, and ErrorState's copy had already silently
  drifted (text-title instead of text-lg) before anyone noticed.

  Two shapes, chosen by whether `to` is given:
  - `to` set    → an actual <Link> to the dashboard (TopNav/MobileTopBar).
  - `to` omitted → a static <span> (HydrateFallback/ErrorState render it while
    the app may not have a working router/session yet, so it must not be a
    navigable link).

  `size` defaults to "lg", matching every call site except ErrorState: its
  page variant has no explicit header height (unlike the other three, which
  are all pinned to --spacing-bar), so swapping its line-height from
  text-title's 1.4 to text-lg's default would visibly change that header's
  rendered height. ErrorState opts back into "title" to render byte-for-byte
  what it did before this component existed.
*/
export function BrandLogo({ to, size = 'lg', className = '' }) {
  // font-logo: 본문 전체가 Pretendard로 넘어가도 워드마크만은 종전 시스템
  // 폰트를 유지한다(오너 지시 2026-08-28 — index.css의 --font-logo 주석 참고).
  const classes = [SIZE_CLASS[size], 'font-logo', 'font-bold', 'text-brand-600', className]
    .filter(Boolean)
    .join(' ')

  if (to) {
    return (
      <Link
        to={to}
        className={`rounded ${classes} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring`}
      >
        OpenPlan
      </Link>
    )
  }

  return <span className={classes}>OpenPlan</span>
}

export default BrandLogo
