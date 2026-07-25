import { Outlet } from 'react-router-dom'
import { Toaster } from '../components/common/Toaster'

/*
  Unauthenticated shell (SCR-LANDING · SCR-AUTH-*, ST-F1-14). Deliberately
  thin — no TopNav/BottomTabBar/OfflineBanner/UnsavedGuard: none of those make
  sense before a session exists (no nav destinations, no drafts to protect).
  Only Toaster is shared with AppLayout, so a save-success/error toast fired
  from one of these screens (e.g. ResetPasswordPage's "비밀번호가
  변경되었습니다") still has somewhere to render — AppLayout's own Toaster
  instance never mounts on this side of the router tree.

  Each page below supplies its own full-bleed background/centering via
  AuthShell — this layout is just the <Outlet/> + toast host, not a visual
  frame itself (unlike AppLayout, which owns the header/tab-bar chrome).
*/
function AuthLayout() {
  return (
    <>
      <Outlet />
      <Toaster />
    </>
  )
}

export default AuthLayout
