import { createBrowserRouter, redirect } from 'react-router-dom'
import AppLayout from '../layouts/AppLayout'
import OnboardingLayout from '../layouts/OnboardingLayout'
import OnboardingIntroPage from '../pages/onboarding/OnboardingIntroPage'
import OnboardingWizardPage from '../pages/onboarding/OnboardingWizardPage'
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
import { onboardingProgressKey } from '../features/onboarding/useOnboarding'
import { getOnboardingProgress } from '../features/onboarding/onboardingApi'

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

// ST-F1-13 addition — session-scoped onboarding gate query, same shape as
// `sessionQuery` above (a plain object literal, not the useOnboardingProgress
// HOOK, since a router loader runs outside React). Shares the exact query key
// the wizard's own `useOnboardingProgress` uses, so this loader's fetch and
// the wizard page's own read hit the SAME cache entry — no duplicate request.
const onboardingProgressQuery = {
  queryKey: onboardingProgressKey(),
  queryFn: getOnboardingProgress,
  // Same reasoning as sessionQuery's own staleTime: onboarding completion is
  // effectively static within a session, so this loader-driven read (which
  // fires on every distinct-pathname navigation, see shouldRevalidate below)
  // should not refetch on every single route change. The wizard/tutorial's
  // own useOnboardingProgress hook still gets fresh data immediately after any
  // mutation via that hook's onSuccess cache write, regardless of this.
  staleTime: 5 * 60 * 1000,
}

export async function sessionGuardLoader() {
  try {
    // dev-auth stub responds 200 → pass through with no login screen.
    await queryClient.ensureQueryData(sessionQuery)
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

  // ux-flow-map §1: "onboardingCompleted=false" routes into OVL-ONB-INTRO
  // BEFORE the 5-tab shell, instead of straight to the dashboard. Deliberately
  // defensive (try/catch swallows anything but the redirect itself) — this
  // gate is additive on top of an already-working session guard, and must
  // never turn a still-settling onboarding-progress endpoint into a hard
  // outage for the entire app.
  try {
    const progress = await queryClient.ensureQueryData(onboardingProgressQuery)
    if (!progress?.onboardingCompleted) {
      throw redirect('/onboarding')
    }
  } catch (error) {
    if (error instanceof Response) throw error // the redirect() above
  }

  return null
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
    OVL-ONB-INTRO · SCR-ONB-* (ST-F1-13) — deliberately OUTSIDE the AppLayout
    tree above: ux-flow-map's ENTRY subgraph puts these before the 5-tab SHELL,
    and a brand-new user has no projects/plan/stats yet for that shell's tabs
    to point at. OnboardingLayout supplies its own minimal frame instead (see
    that file's header). Still guarded by the same session loader — an
    unauthenticated visitor must not reach the wizard either — but WITHOUT
    sessionGuardLoader's own onboarding-progress redirect (that check only
    lives on the '/' tree above; these two routes are its target, so it would
    otherwise redirect-loop into itself).
  */
  {
    path: 'onboarding',
    Component: OnboardingLayout,
    HydrateFallback, // ★ same as the '/' tree above — no blank flash while this loader resolves
    loader: () => queryClient.ensureQueryData(sessionQuery).catch((error) => {
      if (error?.status === 403) throw redirect('/403')
      if (!(import.meta.env.DEV && error?.isNetwork)) throw error
    }),
    children: [
      { index: true, Component: OnboardingIntroPage },
      { path: 'wizard', Component: OnboardingWizardPage },
    ],
  },
])
