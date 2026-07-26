/*
  Inline icons local to the ST-F1-15 문의·FAQ·공지 screens. Same convention as
  layout/icons.jsx/settings/settingsIcons.jsx: no icon package, currentColor
  stroke, aria-hidden (adjacent text always carries the meaning — NFR-017).
  Kept local rather than reused from components/settings (that file's own
  header notes the same "no cross-feature component→component import" rule).
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

// FAQ 상단 튜토리얼 재실행 배너 (TUT-09 보조 진입, SC-12).
export function PlayCircleIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5v7l6-3.5-6-3.5Z" />
    </svg>
  )
}

// 내 문의/공지 아코디언 행의 펼침 표시 (owner feedback #10/11 — 90도 회전은
// 호출부가 직접 className으로 건다, ProjectAccordionRow와 같은 방식).
export function ChevronRightIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}
