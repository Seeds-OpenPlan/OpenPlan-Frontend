import { Outlet } from 'react-router-dom'
import TopNav from '../components/layout/TopNav'
import MobileTopBar from '../components/layout/MobileTopBar'
import BottomTabBar from '../components/layout/BottomTabBar'
import { OfflineBanner } from '../components/common/OfflineBanner'
import { UnsavedGuard } from '../components/common/UnsavedGuard'
import { Toaster } from '../components/common/Toaster'
import { SessionExpiredOverlay } from '../components/auth/SessionExpiredOverlay'
import { TutorialOverlay } from '../components/tutorial/TutorialOverlay'

/*
  공통 반응형 셸: 연회색 배경 + 헤더(데스크톱/모바일) + 하단 탭 + 중앙 콘텐츠.

  px-page-x (no md: override) is intentionally the SAME at every breakpoint:
  TopNav and MobileTopBar both use px-page-x too, so keeping this one token
  in sync with them keeps the logo and the page content horizontally aligned
  at every viewport width, with no left/right jump at the md breakpoint.
  max-w-page likewise matches TopNav's own max-width.

  pb-24 reserves room below the mobile BottomTabBar so content never sits
  under it — 96px = --spacing-bar (56px, the tab bar's own height) + 40px of
  breathing room. Kept as the literal pb-24 utility (not a calc() off the
  token) so this exact, owner-approved 96px render value can never drift from
  an arithmetic slip; Toaster's bottom-24 and WeeklyPage's floating-controls
  bottom-18 are the other two spots that clear the same bar and carry the
  same kind of comment. Only the vertical side (pb-24 vs md:pb-10) differs
  by breakpoint, because that difference is real: BottomTabBar exists below
  md, not above it.

  This shell hosts the app-wide common-state surfaces once each:
  - OfflineBanner sits directly under the header and pushes content down (not an
    overlay), so the offline warning is visible on every page (SYS-07).
  - UnsavedGuard watches the single dirty flag and blocks route changes (SYS-04).
  - Toaster is the global toast host (recovery toast, later save toasts).
  - SessionExpiredOverlay (OVL-SESSION, ST-F1-14/AUTH-08) sits ALONGSIDE
    `<Outlet/>`, never replacing it — this is the one mount point that makes
    NFR-019 ("배경 언마운트 금지") possible at all: whatever the routed page
    below has mounted stays mounted, the overlay just paints on top via its
    own portal. It renders `null` until something calls
    `useSessionStore.getState().expire(path)` — W5(2026-08-18)부터 client.js의
    토큰 갱신 실패 지점이 실제로 호출한다(sessionStore.js 헤더 참조).
  - TutorialOverlay (ST-F1-13) hosts OVL-TUT — it self-gates on onboarding-
    progress and renders nothing outside an active tutorial run, same
    self-gating shape OfflineBanner already has for "not offline".
  These are placement-only; all surface logic lives in components/common
  (components/auth for the session overlay, components/tutorial for the tutorial).
*/
function AppLayout() {
  return (
    <div className="min-h-screen bg-surface-sunken text-text">
      <TopNav />
      <MobileTopBar />
      <OfflineBanner />

      <main className="mx-auto max-w-page px-page-x py-6 pb-24 md:pb-10">
        <Outlet />
      </main>

      <BottomTabBar />

      <UnsavedGuard />
      <Toaster />
      <SessionExpiredOverlay />
      <TutorialOverlay />

      {/* `[dev] 세션 만료 시뮬레이션` 버튼 제거(W5, 2026-08-18). 존재 이유였던
          "OVL-SESSION을 열 실제 트리거가 없다"가 더는 참이 아니다 — client.js가
          토큰 갱신 실패 시 실제로 띄운다. 오버레이는 의도적으로 닫기 수단이
          없어(재인증만이 출구) 모든 화면 좌하단에 떠 있는 이 버튼을 잘못 누르면
          다시 로그인하기 전까지 빠져나올 수 없었다. 오버레이 UI만 보려면
          DevTools에서 세션 쿠키를 지우고 아무 동작이나 하면 된다. */}
    </div>
  )
}

export default AppLayout
