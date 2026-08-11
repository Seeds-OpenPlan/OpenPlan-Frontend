/*
  지원(SettingsSupportPage) 안의 "자주 묻는 질문"↔"내 문의" 전환. Originally a
  route-based NavLink pair (linking `/faq`↔`/help`) — owner feedback #D moved
  both into ONE settings sub-route (`/settings/support`), so switching tabs is
  no longer a navigation at all, just which content the caller renders; this
  is now a plain controlled pill toggle (`value`/`onChange`, same shape
  stats/StatsToggle.jsx already uses) instead of NavLink.

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
  `aria-pressed` pill-toggle pattern stats/StatsToggle.jsx already uses,
  rather than building out a full tablist (no test suite in this repo to
  guard a bigger, riskier change).
*/
const TABS = [
  { value: 'faq', label: '자주 묻는 질문' },
  { value: 'tickets', label: '내 문의' },
]

export function HelpTabs({ value, onChange }) {
  return (
    <div role="group" aria-label="문의·FAQ" className="inline-flex rounded-full border border-border bg-surface p-0.5">
      {TABS.map((tab) => {
        const active = value === tab.value
        return (
          <button
            key={tab.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(tab.value)}
            className={[
              'rounded-full px-3 py-1 text-label font-medium transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
              active ? 'bg-brand-600 text-white' : 'text-text-muted hover:text-text',
            ].join(' ')}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

export default HelpTabs
