import { Link } from 'react-router-dom'
import { AppIcon } from './AppIcon'

// Both current call sites use text-lg (18px/1.75rem); ErrorState's page
// fallback is the one exception (see below), so it's a lookup rather than a
// single hardcoded class.
const SIZE_CLASS = {
  lg: 'text-lg',
  title: 'text-title',
}

// Icon pixel size paired with each wordmark size, used only when `showIcon`
// is set. Sized close to the wordmark's cap-height (not --spacing-bar) so the
// pairing reads as one lockup rather than an icon floating next to text.
const ICON_SIZE = {
  lg: 20,
  title: 22,
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

  `showIcon` (default false) prepends the confirmed app icon (AppIcon) before
  the wordmark. Deliberately opt-in per call site rather than always-on:
  TopNav/MobileTopBar pass it (they're the persistent, always-visible chrome
  where reinforcing the installed-app icon pays off), while HydrateFallback
  and ErrorState leave it off — both exist to render the FRAME as fast and
  unchanged as possible (see their own comments on matching prior byte-for-
  byte output / avoiding a visible jump once real content swaps in), so this
  component doesn't change what they render unless they explicitly ask for it.
*/
export function BrandLogo({ to, size = 'lg', className = '', showIcon = false }) {
  // font-logo: 본문 전체가 Pretendard로 넘어가도 워드마크만은 종전 시스템
  // 폰트를 유지한다(오너 지시 2026-08-28 — index.css의 --font-logo 주석 참고).
  const classes = [SIZE_CLASS[size], 'font-logo', 'font-bold', 'text-brand-600', className]
    .filter(Boolean)
    .join(' ')

  // Icon + text must stay one inline unit (not two flex children) so it still
  // wraps/truncates as a single word if a container ever constrains width,
  // and so the existing focus ring (drawn on the <Link> itself) outlines both.
  const content = showIcon ? (
    <span className="inline-flex items-center gap-1.5">
      <AppIcon size={ICON_SIZE[size]} />
      OpenPlan
    </span>
  ) : (
    'OpenPlan'
  )

  if (to) {
    return (
      <Link
        to={to}
        className={`rounded ${classes} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring`}
      >
        {content}
      </Link>
    )
  }

  return <span className={classes}>{content}</span>
}

export default BrandLogo
