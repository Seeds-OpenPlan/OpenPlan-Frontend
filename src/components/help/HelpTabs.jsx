import { FilterPill, FilterPillGroup } from '../common/FilterPill'

/*
  지원(SettingsSupportPage) 안의 "자주 묻는 질문"↔"내 문의" 전환. Originally a
  route-based NavLink pair (linking `/faq`↔`/help`) — owner feedback #D moved
  both into ONE settings sub-route (`/settings/support`), so switching tabs is
  no longer a navigation at all, just which content the caller renders; this
  is now a plain controlled pill toggle (`value`/`onChange`).

  Owner feedback #B: FAQ는 항상 왼쪽(첫 번째) — "지원" 진입 시 FAQ가 먼저
  보이는 기본값(owner feedback #7)과 같은 순서로 통일.

  W6 review (Thomas Major #2 / Matthias T41 / Hananiah class C): this used to
  declare `role="tablist"`/`role="tab"`/`aria-selected` without honoring the
  WAI-ARIA tabs pattern's behavioral contract (no arrow-key navigation, no
  roving tabindex, no wired-up `role="tabpanel"`). A screen reader user hears
  "tab" and expects arrow-key movement that never comes — worse than no role
  at all. Since the caller (SettingsSupportPage) only swaps which content
  renders via `value`/`onChange` — there's no real tabpanel structure here,
  this was never actually tabs — switched to the same `role="group"` +
  `aria-pressed` pill-toggle pattern common/FilterPill.jsx's group uses,
  rather than building out a full tablist (no test suite in this repo to
  guard a bigger, riskier change).

  PR #82 AI 리뷰 Should-fix (2026-10): this file had its OWN hand-rolled
  capsule markup (`role="group"` + `aria-pressed` button, identical semantics
  to FilterPill/FilterPillGroup) instead of actually USING that shared
  component — so when the mobile 48px touch-target pass unified every OTHER
  filter/segment control in the app onto FilterPill, this one was missed
  (same markup, different file, drifted silently — exactly the kind of
  duplication FilterPill.jsx's own header warns about). Swapped to the real
  component: the role/aria contract above is unchanged (FilterPillGroup is
  `role="group"`, FilterPill is `aria-pressed`), only the visual shape moves
  from a single bordered capsule to separate chips with a gap — matching
  every other filter control in the app, including the 48px mobile minimum.
*/
const TABS = [
  { value: 'faq', label: '자주 묻는 질문' },
  { value: 'tickets', label: '내 문의' },
]

export function HelpTabs({ value, onChange }) {
  return (
    <FilterPillGroup ariaLabel="문의·FAQ">
      {TABS.map((tab) => (
        <FilterPill key={tab.value} active={value === tab.value} label={tab.label} onClick={() => onChange(tab.value)} />
      ))}
    </FilterPillGroup>
  )
}

export default HelpTabs
