/*
  Inline SVG icons scoped to the dashboard screen, following the existing
  layout/icons.jsx and common/statusIcons.jsx convention: no icon package,
  currentColor stroke, aria-hidden (meaning is always carried by adjacent text,
  never the icon alone — NFR-017 / ui-spec §0.2 forbids emoji status icons).
*/

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
}

// §DASH.6 온보딩 빈 상태 — 점선 박스("⬚"). statusIcons.jsx의 SCR-404/403 아이콘은
// 실선(확정된 오류 상태)이라, 여기는 점선으로 "아직 채워지지 않음"과 시각적으로
// 구분한다(오류가 아니라 시작 전이라는 톤 차이).
export function EmptyBoxIcon({ className, size = 24 }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="3" strokeDasharray="3 3" />
    </svg>
  )
}

export default EmptyBoxIcon
