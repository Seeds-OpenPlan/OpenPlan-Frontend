/*
  지원(SettingsSupportPage) 안의 "자주 묻는 질문"↔"내 문의" 전환. Originally a
  route-based NavLink pair (linking `/faq`↔`/help`) — owner feedback #D moved
  both into ONE settings sub-route (`/settings/support`), so switching tabs is
  no longer a navigation at all, just which content the caller renders; this
  is now a plain controlled pill toggle (`value`/`onChange`, same shape
  stats/StatsToggle.jsx already uses) instead of NavLink.

  Owner feedback #B: FAQ는 항상 왼쪽(첫 번째) — "지원" 진입 시 FAQ가 먼저
  보이는 기본값(owner feedback #7)과 같은 순서로 통일.
*/
const TABS = [
  { value: 'faq', label: '자주 묻는 질문' },
  { value: 'tickets', label: '내 문의' },
]

export function HelpTabs({ value, onChange }) {
  return (
    <div role="tablist" aria-label="문의·FAQ" className="inline-flex rounded-full border border-border bg-surface p-0.5">
      {TABS.map((tab) => {
        const active = value === tab.value
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
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
