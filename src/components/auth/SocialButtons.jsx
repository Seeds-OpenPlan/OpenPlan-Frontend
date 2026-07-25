import { GoogleLogoIcon, KakaoBubbleIcon, NaverMonogramIcon } from './authIcons'

/*
  소셜 3버튼 (AUTH-02 · AC4 "소셜 3버튼(브랜드 가이드)"). architecture-overview.md
  §외부 시스템이 명시한 세 프로바이더(Google/Naver/Kakao) 그대로 [사실].

  Each provider's own button spec is followed literally (fixed brand color +
  icon + Korean CTA text, never recolored onto our own brand-600 scale — see
  authIcons.jsx's own header for why that's a deliberate token exception).
  Text is ALWAYS present beside the glyph (NFR-017 색 단독 전달 금지) — these
  three backgrounds are close enough in lightness that icon-only buttons would
  also fail plain readability, not just the color-only rule.

  `onSelect(provider)` is the only contract — LoginPage owns what "select" does
  (see that file's own comment on why the actual OAuth call isn't an OP
  function in authApi.js).
*/

const PROVIDERS = [
  {
    id: 'GOOGLE',
    label: 'Google로 계속하기',
    Icon: GoogleLogoIcon,
    className: 'border border-border-strong bg-white text-neutral-700 hover:bg-neutral-50',
  },
  {
    id: 'NAVER',
    label: '네이버로 계속하기',
    Icon: NaverMonogramIcon,
    className: 'bg-[#03C75A] text-white hover:bg-[#02b350]',
  },
  {
    id: 'KAKAO',
    label: '카카오로 계속하기',
    Icon: KakaoBubbleIcon,
    className: 'bg-[#FEE500] text-[#191600] hover:bg-[#f5dc00]',
  },
]

export function SocialButtons({ onSelect, disabled = false }) {
  return (
    <div className="flex flex-col gap-2">
      {PROVIDERS.map(({ id, label, Icon, className }) => (
        <button
          key={id}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(id)}
          className={[
            'inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-label font-medium',
            'transition-colors duration-fast ease-standard',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className,
          ].join(' ')}
        >
          <Icon />
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}

export default SocialButtons
