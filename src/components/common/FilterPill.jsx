/*
  Shared rounded-full filter/segment chip — the one canonical "pick one of a
  few options" control in the app. Before this file existed there were THREE
  independent copies of the same idea: an identical `FilterPill` function
  duplicated verbatim in ProjectsPage.jsx (프로젝트 상태 필터) and
  ProjectExpandedPanel.jsx (태스크 상태 필터), plus a visually different
  "segmented capsule" version in stats/StatsToggle.jsx (기간/편차 그룹
  토글). Three copies meant they could drift independently, which is exactly
  how the 통계 토글 ended up missing the 48px mobile touch target (ui-spec
  §0.4) the project filters already had.

  오너 실측 피드백(2026-10): 통계 토글을 이 칩 모양으로 통일하고, 모든 칩이
  모바일(md 미만)에서 48px 이상이 되도록 한다. 프로젝트 필터도 같은 칩을 쓰게
  되므로 모바일에서 48px로 함께 커진다 — 오너가 그 파급을 승인했다. md
  이상에서는 기존 프로젝트 필터의 치수(px-3 py-1.5 text-label)로 되돌아가
  데스크톱 모양은 바뀌지 않는다.
*/
export function FilterPill({ active, label, onClick }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={[
        // PR #82 AI 리뷰 Blocking fix: `min-h-[48px]`만 있고 정렬이 없으면
        // 버튼 기본 흐름대로 텍스트가 박스 위쪽에 붙는다(48px는 한 줄
        // 라벨보다 훨씬 크므로 남는 높이가 전부 아래로만 쌓인다) —
        // `inline-flex items-center justify-center`로 세로 중앙에 고정한다.
        // md 이상은 min-h가 0으로 줄고(바로 아래) 박스 높이가 패딩+내용과
        // 같아지므로 이 정렬은 자리만 지킬 뿐 모양을 바꾸지 않는다.
        'inline-flex min-h-[48px] items-center justify-center rounded-full px-4 text-body font-medium transition-colors',
        'md:min-h-0 md:px-3 md:py-1.5 md:text-label',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
        active
          ? 'bg-brand-600 text-white font-semibold'
          : 'border border-border bg-surface text-text-muted',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

/*
  Wrapper for a set of FilterPills. `role="group"` + `aria-label` is the
  accessibility pattern StatsToggle already had (a screen reader announces
  "기간 선택, 그룹" once, instead of reading N unrelated buttons with no
  shared context) — kept here so every FilterPill call site gets it for free
  instead of each page remembering to add it itself.
*/
export function FilterPillGroup({ ariaLabel, children }) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {children}
    </div>
  )
}

export default FilterPill
