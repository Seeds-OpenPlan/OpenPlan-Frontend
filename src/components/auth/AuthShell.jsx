import { BrandMarkIcon } from './authIcons'

/*
  Shared centered-card shell for every unauthenticated screen (SCR-LANDING,
  SCR-AUTH-*). Mirrors Mobile.Login.png at mobile width exactly (plain
  background, no card framing — the whole viewport IS the card there); at
  desktop it gains a bordered card (ui-spec §0.3 "반응형 표면 전환" — a
  breakpoint change RECONFIGURES the surface, not just shrinks it, since a
  bare 384px-wide column floating on a wide viewport with nothing framing it
  would read as unstyled/broken, not "responsive").

  `titleId` is handed to the caller so its own <h1> (this shell renders NO
  heading itself — pages differ too much: LandingPage's is a hero line,
  LoginPage's is "로그인") can still satisfy focus-on-mount patterns other
  common-state surfaces use (ErrorState's page variant does the same thing) —
  actually this shell doesn't move focus itself (a fresh navigation between
  auth pages already resets focus to <body> via the browser's own top-of-doc
  scroll+focus reset, unlike a client-side overlay swap), so no ref is
  threaded here; it exists purely so the caller CAN wire aria-labelledby
  between its own heading and a landmark if it chooses to.
*/
export function AuthShell({ children, footer }) {
  return (
    // Thomas 리뷰 HIGH: 이 셸은 세로 중앙 정렬이라 py-10(위아래 2.5rem)
    // 여유가 대부분의 상태 바 인셋을 이미 흡수하지만, 화면이 짧으면서
    // 인셋이 큰 기기에서는 카드가 상태 바 밑에서 시작할 수 있다 — 위쪽만
    // env(safe-area-inset-top)을 더해 안전하게 둔다.
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-sunken px-4 pb-10 pt-[calc(2.5rem+env(safe-area-inset-top))]">
      <div className="flex w-full max-w-sm flex-col gap-6 md:rounded-card md:border md:border-border md:bg-surface md:p-8 md:shadow-card">
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandMarkIcon />
          <div>
            {/* BrandLogo와 같은 워드마크지만 색/크기가 달라 이 화면은 자체
                마크업을 유지한다 — Pretendard 제외(font-logo)만 맞춘다. */}
            <p className="text-title font-logo font-bold text-text">OpenPlan</p>
            <p className="text-caption text-text-muted">실행 가능한 계획을 만들어드려요</p>
          </div>
        </div>
        {children}
      </div>
      {footer && <div className="mt-6 text-center text-label text-text-muted">{footer}</div>}
    </div>
  )
}

export default AuthShell
