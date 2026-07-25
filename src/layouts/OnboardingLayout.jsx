import { Outlet } from 'react-router-dom'
import { BrandLogo } from '../components/common/BrandLogo'
import { Toaster } from '../components/common/Toaster'

/*
  Shell for OVL-ONB-INTRO / SCR-ONB-* (ux-flow-map's ENTRY subgraph — outside
  AppLayout's SHELL). A brand-new user has no projects/plan/stats to navigate
  to yet, so this intentionally has NO TopNav/BottomTabBar/5-tab chrome — just
  a static wordmark and a centered card, same "minimal frame" choice
  ErrorState's `page` variant already makes for the same reason (the real
  shell may not make sense to show yet).

  Toaster is still mounted (a step's embedded settings component — e.g.
  SettingsAvailabilityPage's save button — fires toasts on its own real
  mutation), but OfflineBanner/UnsavedGuard are not: draft-loss protection
  during the wizard is handled by the wizard's own step-gating (AC2, "저장
  성공 후 진행"), not the global dirty-flag route guard, which assumes the
  5-tab shell's navigation model.
*/
function OnboardingLayout() {
  return (
    <div className="min-h-screen bg-surface-sunken text-text">
      <header className="border-b border-border bg-surface px-4 py-3">
        <BrandLogo size="title" />
      </header>
      <main className="mx-auto flex max-w-2xl flex-col px-4 py-8 md:py-12">
        <Outlet />
      </main>
      <Toaster />
    </div>
  )
}

export default OnboardingLayout
