/*
  Inline SVG icons for the ST-F1-14 auth screens. Two different fidelity
  levels, deliberately:

  - `BrandMarkIcon` follows this codebase's existing icon convention
    (currentColor stroke, aria-hidden, no icon package — statusIcons.jsx's own
    header) since it's OUR OWN brand mark and must ride the same token scale
    as everything else.
  - The three social provider glyphs below are a DELIBERATE EXCEPTION to the
    "100% tokens, zero hardcoded colors" rule: Google/Naver/Kakao's own
    button guidelines require rendering THEIR brand colors exactly, not
    reskinned onto our brand-600 scale — a themed "Google" button would fail
    the very brand-guide compliance AUTH-02/AC4 asks for. SocialButtons.jsx
    is the one place these hardcoded hex values live; nothing else in the
    codebase references them.
*/

const strokeBase = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
}

// SCR-LANDING / SCR-AUTH-* header mark — rounded square + three lines, echoing
// Mobile.Login.png's icon square (a plan/list glyph, tying the mark back to
// "실행 가능한 계획" rather than an arbitrary abstract shape).
export function BrandMarkIcon({ className, size = 56 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" aria-hidden="true" className={className}>
      <rect width="56" height="56" rx="14" fill="var(--color-brand-600)" />
      <g {...strokeBase} stroke="white" strokeWidth={3}>
        <path d="M17 20h22M17 28h22M17 36h14" />
      </g>
    </svg>
  )
}

// Google "G" — standard 4-color mark, widely reused path data for
// "Sign in with Google" buttons (Google's own brand guideline requires this
// exact multi-color rendering, not a monochrome recolor).
export function GoogleLogoIcon({ className, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true" className={className}>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.84 2.09-1.8 2.73v2.27h2.92c1.71-1.57 2.68-3.88 2.68-6.64z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.27c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33C2.44 15.98 5.48 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.7c-.18-.54-.28-1.11-.28-1.7s.1-1.16.28-1.7V4.97H.96C.35 6.17 0 7.55 0 9s.35 2.83.96 4.03l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.97l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  )
}

// Kakao talk-bubble glyph — background yellow (#FEE500) supplied by the
// button itself (SocialButtons.jsx), matching the official "카카오로 로그인"
// button spec (black glyph + text on Kakao yellow).
export function KakaoBubbleIcon({ className, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        fill="#000000"
        d="M12 4C6.48 4 2 7.29 2 11.34c0 2.6 1.85 4.88 4.63 6.19-.2.73-1.24 4.4-1.28 4.63 0 0-.02.16.08.23.1.06.22.02.22.02.29-.04 3.5-2.31 4.05-2.69.75.11 1.53.15 2.3.15 5.52 0 10-3.29 10-7.53S17.52 4 12 4z"
      />
    </svg>
  )
}

// Naver — 실제 워드마크 대신 브랜드 그린 배경(#03C75A) 위 흰색 "N" 모노그램
// (라이선스 이슈 없는 단순화, GoogleGIcon이 캘린더 연동 행에서 이미 쓴 것과
// 같은 절충 — settingsIcons.jsx 참조).
export function NaverMonogramIcon({ className, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true" className={className}>
      <path fill="#ffffff" d="M11.2 3v6.4L6.8 3H3v12h3.8V8.6l4.4 6.4H15V3h-3.8Z" />
    </svg>
  )
}
