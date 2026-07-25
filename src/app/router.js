import { createBrowserRouter, redirect } from 'react-router-dom'
import AppLayout from '../layouts/AppLayout'
import AuthLayout from '../layouts/AuthLayout'
import LandingPage from '../pages/auth/LandingPage'
import LoginPage from '../pages/auth/LoginPage'
import SignupPage from '../pages/auth/SignupPage'
import VerifyEmailPage from '../pages/auth/VerifyEmailPage'
import ResetPasswordRequestPage from '../pages/auth/ResetPasswordRequestPage'
import ResetPasswordPage from '../pages/auth/ResetPasswordPage'
import HomePage from '../pages/HomePage'
import WeeklyPage from '../pages/WeeklyPage'
import ProjectsPage from '../pages/ProjectsPage'
import StatisticsPage from '../pages/StatisticsPage'
import SettingsLayout from '../pages/settings/SettingsLayout'
import SettingsDefaultsPage from '../pages/settings/SettingsDefaultsPage'
import SettingsAvailabilityPage from '../pages/settings/SettingsAvailabilityPage'
import SettingsFixedSchedulesPage from '../pages/settings/SettingsFixedSchedulesPage'
import SettingsAccountPage from '../pages/settings/SettingsAccountPage'
import SettingsCalendarPage from '../pages/settings/SettingsCalendarPage'
import SettingsNotificationsPage from '../pages/settings/SettingsNotificationsPage'
import NotFoundPage from '../pages/NotFoundPage'
import ForbiddenPage from '../pages/ForbiddenPage'
import RootErrorBoundary from './RootErrorBoundary'
import HydrateFallback from './HydrateFallback'
import { queryClient } from './queryClient'
import { apiClient } from '../api/client'

/*
  Session guard (SYS-BASE AC-3). Runs on protected-route entry. The imperative
  GET goes through queryClient.ensureQueryData so it inherits the single retry
  policy (ADR-0001, §2.2) — never a bare apiClient.get.

  Failure routing follows the locked convention (story §2.4): a designated
  surface is routed explicitly; only undesignated runtime errors fall to the
  root ErrorBoundary (PTN-ERROR).
    - 403 → throw redirect('/403')  (SCR-403, NOT the generic error surface)
    - other → rethrow → root ErrorBoundary
*/
const sessionQuery = {
  queryKey: ['auth', 'session'],
  queryFn: () => apiClient.get('/auth/session'),
  staleTime: 5 * 60 * 1000,
}

export async function sessionGuardLoader() {
  try {
    // dev-auth stub responds 200 → pass through with no login screen.
    await queryClient.ensureQueryData(sessionQuery)
    return null
  } catch (error) {
    if (error?.status === 403) {
      throw redirect('/403')
    }
    // DEV without a backend: the stub session endpoint is unreachable, so a
    // network error here means auth isn't wired yet (it lands in ST-F1-14).
    // Pass through exactly as a stub 200 would, instead of blocking every page
    // behind PTN-ERROR. See frontend.md for how to point at a real/mock server.
    if (import.meta.env.DEV && error?.isNetwork) {
      return null
    }
    throw error
  }
}

/*
  ST-F1-08 D-3 (owner review 2026-07-23): a data router revalidates every
  loader in the matched tree on EVERY navigation by default, including one
  where only the search string changed (e.g. ProjectWorkspacePage's own
  `?tab=plan` toggle, or WeeklyPage's `?project=`/`?openUnplaced=` seams).
  sessionGuardLoader depends on NOTHING in the URL — it's a flat "is there a
  session" check — so re-running it on a same-page tab click is pure
  overhead: `ensureQueryData` resolves from its 5-minute cache almost
  instantly, but the navigation still has to await that promise before
  React Router commits the new location, and no fallback UI covers that gap
  outside the very first load (HydrateFallback only fires for hydration),
  so the click visibly does nothing until it resolves.

  Skipping revalidation exactly when `currentUrl.pathname === nextUrl.pathname`
  (search-only change) is safe here specifically BECAUSE this is the only
  loader in the app (grep confirms no other route reads `useLoaderData`, and
  nothing calls `useRevalidator()` — every other screen's data lives in
  TanStack Query, never in a loader) and because a genuine navigation to a
  NEW pathname — the only case where "is the session still valid" actually
  needs re-asking — still revalidates via `defaultShouldRevalidate` below.
*/
function sessionGuardShouldRevalidate({ currentUrl, nextUrl, defaultShouldRevalidate }) {
  if (currentUrl.pathname === nextUrl.pathname) return false
  return defaultShouldRevalidate
}

export const router = createBrowserRouter([
  {
    path: '/',
    Component: AppLayout,
    ErrorBoundary: RootErrorBoundary, // ★ global runtime-error fallback (SYS-02 AC-5)
    HydrateFallback, // ★ shown during initial session-guard resolution (no blank flash)
    loader: sessionGuardLoader, // ★ OP-AUTH-SESSION, dev stub passes through
    shouldRevalidate: sessionGuardShouldRevalidate, // ★ ST-F1-08 D-3 — skip on search-only nav
    children: [
      { index: true, Component: HomePage },
      { path: 'weekly', Component: WeeklyPage },
      { path: 'projects', Component: ProjectsPage },
      /*
        SCR-PROJ-WS (ST-F1-08) is no longer its own page (project-accordion
        restructure, owner-approved design) — a project's task list/plan now
        render INLINE as an accordion row on /projects itself
        (ProjectsPage → ProjectAccordionRow's own `?expanded=` seam). This
        route is kept, loader-only, purely so every EXISTING deep link built
        for the old page — the dashboard's ImpactList card and
        actionRouting.js's OP-DASH-ACTION `to`, WeeklyPage's "프로젝트로 이동"
        context-menu item — keeps working with ZERO changes at those call
        sites: it 302s straight to the accordion's own host, carrying over
        whatever query string the old link already built (notably
        actionRouting.js's own `?tab=plan`, which the accordion reads via the
        exact same `tab` param name ProjectWorkspacePage used, so no
        translation is needed, just a host swap).
      */
      {
        path: 'projects/:projectId',
        loader: ({ params, request }) => {
          const url = new URL(request.url)
          url.searchParams.set('expanded', params.projectId)
          return redirect(`/projects?${url.searchParams.toString()}`)
        },
      },
      // NOTE: SCR-TASK-EDIT (ST-F1-09) is NOT a route — owner decision,
      // post-review — it opens as TaskEditModal (a Dialog/BottomSheet),
      // mounted by TaskRow.jsx and WeeklyPage.jsx, not routed here.
      { path: 'statistics', Component: StatisticsPage },
      // SCR-SET (ST-F1-12) — nested master-detail (SettingsLayout renders the
      // nav list itself, unconditionally; `<Outlet/>` is the right-hand DETAIL
      // pane only — see that file's own header). The index route's element is
      // `null` on MOBILE (nothing to show until a row is tapped — item 6,
      // BottomSheet); on DESKTOP SettingsLayout redirects `/settings` straight
      // to SETTINGS_FIRST_DETAIL_PATH before this element ever paints (item 1).
      // 순서는 오너 지정(item 3): 기본값 → 가용시간 → 고정일정 → 계정관리 →
      // 캘린더연동 → 알림. 캘린더 연동(FIX-13~17)은 다시 독립 라우트다(오너
      // 리뷰 3차 item 4 — 2차의 "계정 화면 섹션" 병합은 정정됨).
      {
        path: 'settings',
        Component: SettingsLayout,
        children: [
          { index: true, element: null },
          { path: 'defaults', Component: SettingsDefaultsPage }, // FIX-10~12 · RB-FIX-01
          { path: 'availability', Component: SettingsAvailabilityPage }, // FIX-01~03
          { path: 'fixed-schedules', Component: SettingsFixedSchedulesPage }, // FIX-04~09
          { path: 'account', Component: SettingsAccountPage }, // ACCT-01/02
          { path: 'calendar', Component: SettingsCalendarPage }, // FIX-13~17
          { path: 'notifications', Component: SettingsNotificationsPage }, // NOTI-01
        ],
      },
      { path: '403', Component: ForbiddenPage }, // ★ SCR-403
      { path: '*', Component: NotFoundPage },
    ],
  },
  /*
    ST-F1-14 (인증 화면) — a SIBLING tree, not children of the '/' route
    above, specifically so `sessionGuardLoader` never runs for these paths:
    they must stay reachable with NO session at all (that's the whole point
    of a login screen). Nothing about the guard itself changes (owner:
    "가드 건드리지 마") — dev-auth's stub keeps auto-authenticating every
    route under '/' exactly as before; these six paths are simply direct-
    access mock screens layered in ALONGSIDE that, ready for the guard to
    redirect into once ST-F1-14 flips its real-auth switch in week 4.
  */
  {
    // No `path` — a pathless layout route (react-router v6.4+ data router
    // convention): it contributes ZERO URL segments of its own, so each
    // child below resolves to its own path exactly (`/login`, not
    // `//login`), while still sharing AuthLayout as their common element.
    Component: AuthLayout,
    // Thomas 리뷰 MAJOR: '/' 트리는 ErrorBoundary(RootErrorBoundary)가 있는데
    // 이 형제 트리엔 없어서, 이 6화면 중 하나가 렌더 중 런타임 예외를 던지면
    // PTN-ERROR 폴백 없이 흰 화면(react-router 기본 에러 UI)으로 떨어졌다 —
    // '/' 트리와 동일하게 맞춘다.
    ErrorBoundary: RootErrorBoundary,
    children: [
      { path: 'landing', Component: LandingPage }, // SCR-LANDING
      { path: 'login', Component: LoginPage }, // SCR-AUTH-LOGIN
      { path: 'signup', Component: SignupPage }, // SCR-AUTH-SIGNUP
      { path: 'verify-email', Component: VerifyEmailPage }, // SCR-AUTH-VERIFY
      { path: 'reset-password', Component: ResetPasswordRequestPage }, // SCR-AUTH-RESET-REQ
      { path: 'reset-password/confirm', Component: ResetPasswordPage }, // SCR-AUTH-RESET
    ],
  },
])
