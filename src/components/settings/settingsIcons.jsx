/*
  Inline icons for the ST-F1-12 설정 hub row list (Desktop/Mobile.Settings.png).
  Same convention as features/plan/planIcons.jsx: `1em` sizing (inherits the
  row's own font-size), currentColor stroke, aria-hidden — every icon here sits
  beside a visible row title, so the glyph is never the sole carrier of
  meaning (NFR-017). Kept local to `components/settings` rather than reused
  from planIcons.jsx to avoid a cross-feature component→component import.
*/

const base = {
  width: '1em',
  height: '1em',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

// 가용시간 설정
export function ClockIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

// 고정일정 관리 / 캘린더 연동 공용
export function CalendarIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  )
}

// 기본값 (재계획 전략 선택)
export function SlidersIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h13M21 18h0" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  )
}

// 계정 관리
export function UserCircleIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.5 19a6 6 0 0 1 11 0" />
    </svg>
  )
}

// 알림
export function BellIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 13 6 9Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  )
}

// 지원 (문의·피드백)
export function ChatIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 4h16v12H8l-4 4V4Z" />
    </svg>
  )
}

// 공지
export function MegaphoneIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3 10v4a1 1 0 0 0 1 1h2l2 5h2l-1-5h3l7 4V6l-7 4H6a1 1 0 0 0-1 1v0Z" />
    </svg>
  )
}

// 튜토리얼 다시 실행
export function PlayCircleIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5v7l6-3.5-6-3.5Z" />
    </svg>
  )
}

export function ChevronRightIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

export function ChevronLeftIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

export function PlusIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

// Google 캘린더 행 아이콘 — 풀 브랜드 로고 대신 "G" 모노그램(브랜드 색 라이선스
// 문제 없이 구분만 되면 되는 설정 리스트 용도, ui-spec이 별도 로고 자산을 주지 않음).
export function GoogleGIcon(props) {
  return (
    <svg {...base} fill="currentColor" stroke="none" {...props}>
      <path d="M21 12.2c0-.7-.06-1.4-.18-2H12v3.8h5.05a4.3 4.3 0 0 1-1.87 2.8v2.3h3a9 9 0 0 0 2.82-6.9Z" />
      <path d="M12 21c2.4 0 4.4-.8 5.9-2.1l-3-2.3c-.8.6-1.9.9-2.9.9-2.2 0-4.1-1.5-4.8-3.6H4.1v2.4A9 9 0 0 0 12 21Z" />
      <path d="M7.2 13.9a5.4 5.4 0 0 1 0-3.8V7.7H4.1a9 9 0 0 0 0 8.6l3.1-2.4Z" />
      <path d="M12 6.6c1.3 0 2.5.45 3.4 1.35l2.6-2.6A9 9 0 0 0 4.1 7.7l3.1 2.4c.7-2.1 2.6-3.5 4.8-3.5Z" />
    </svg>
  )
}

// Apple 캘린더 행 아이콘 — 사과 실루엣.
export function AppleGlyphIcon(props) {
  return (
    <svg {...base} fill="currentColor" stroke="none" {...props}>
      <path d="M16.4 12.9c0-2.2 1.8-3.3 1.9-3.4-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.6.8-3.3.8-.7 0-1.8-.8-2.9-.8-1.5 0-2.9.9-3.7 2.2-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.7 2.3 2.9 2.3 1.1 0 1.6-.7 3-.7s1.8.7 3 .7c1.2 0 2-1.1 2.8-2.3.9-1.2 1.2-2.4 1.3-2.5-.1 0-2.9-1.1-2.9-4.6Z" />
      <path d="M14.2 6c.6-.8 1-1.9.9-3-1 0-2.1.6-2.8 1.5-.6.7-1.1 1.9-.9 3 1.1.1 2.1-.6 2.8-1.5Z" />
    </svg>
  )
}

// 태스크 카테고리 관리 (W3)
export function TagIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M11.5 3H5a2 2 0 0 0-2 2v6.5a2 2 0 0 0 .6 1.4l8 8a2 2 0 0 0 2.8 0l6.5-6.5a2 2 0 0 0 0-2.8l-8-8A2 2 0 0 0 11.5 3Z" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function TrashIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13" />
    </svg>
  )
}
