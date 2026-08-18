import { createBrowserRouter, redirect } from 'react-router-dom'
import AppLayout from '../layouts/AppLayout'
import AuthLayout from '../layouts/AuthLayout'
import LandingPage from '../pages/auth/LandingPage'
import LoginPage from '../pages/auth/LoginPage'
import SignupPage from '../pages/auth/SignupPage'
import VerifyEmailPage from '../pages/auth/VerifyEmailPage'
import ResetPasswordRequestPage from '../pages/auth/ResetPasswordRequestPage'
import ResetPasswordPage from '../pages/auth/ResetPasswordPage'
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
import SettingsTaskCategoriesPage from '../pages/settings/SettingsTaskCategoriesPage'
import SettingsAccountPage from '../pages/settings/SettingsAccountPage'
import SettingsCalendarPage from '../pages/settings/SettingsCalendarPage'
import SettingsNotificationsPage from '../pages/settings/SettingsNotificationsPage'
import SettingsSupportPage from '../pages/settings/SettingsSupportPage'
import SettingsNoticesPage from '../pages/settings/SettingsNoticesPage'
import HelpDetailPage from '../pages/HelpDetailPage'
import AnnouncementDetailPage from '../pages/AnnouncementDetailPage'
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
    - 401 → throw redirect('/login') (SCR-AUTH-LOGIN)
    - 403 → throw redirect('/403')  (SCR-403, NOT the generic error surface)
    - other → rethrow → root ErrorBoundary
*/
const sessionQuery = {
  queryKey: ['auth', 'session'],
  // `_sessionProbe` (W5 인증 실연결): axios가 모르는 config 키는 그대로
  // 보존되므로 client.js의 응답 인터셉터가 "이 401은 세션 유무를 묻는 질문
  // 자체였다"를 구분할 수 있다. 그 구분이 필요한 이유 — 로그인한 적 없는
  // 방문자의 첫 진입도 여기서 401을 받는데, 그때 OVL-SESSION("세션이
  // 만료되었습니다")을 띄우면 만료된 적 없는 세션의 만료를 알리게 되고,
  // 아래 로그인 리다이렉트와 겹쳐 로그인 화면 위에 오버레이가 뜬다.
  // 만료 오버레이는 "쓰던 화면이 있는" 다른 요청들의 몫이다.
  queryFn: () => apiClient.get('/auth/session', { _sessionProbe: true }),
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
    // 401 = 세션 없음. 실서버 카탈로그상 E-COM-002(인증 필요)와 E-AUTH-007
    // (refresh 무효/만료)이 여기로 온다 — 후자는 client.js가 이미 토큰 갱신을
    // 시도해 보고 실패한 뒤다. 코드가 아니라 status로 받는 이유는 그 둘 중
    // 어느 쪽이 와도 보호 라우트에서의 결론이 같기 때문이다: 로그인 화면.
    // (이 분기가 없던 동안 401은 아래 rethrow를 타고 RootErrorBoundary로
    // 떨어져, 로그인하면 되는 상황에 일반 오류 화면이 나왔다.)
    if (error?.status === 401) {
      throw redirect('/login')
    }
    if (error?.status === 403) {
      throw redirect('/403')
    }
    // DEV 네트워크 우회 제거(W5, 2026-08-18). 원래는 "백엔드가 없으니 네트워크
    // 오류면 스텁 200처럼 통과시킨다"였는데, 그 전제(인증 미배선)가 이제 거짓이다.
    // 남겨 두면 서버가 잠깐 안 뜨거나 VPN이 끊긴 것만으로 모든 보호 라우트가
    // 인증된 것처럼 열린다 — 프록시를 실서버로 돌린 이유(로컬 스텁 때문에 인증이
    // 무조건 통과하던 문제)를 그대로 되살리는 우회로다. 이제 서버에 닿지 못하면
    // 닿지 못한 대로 PTN-ERROR가 보이는 것이 맞다.
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
          { path: 'task-categories', Component: SettingsTaskCategoriesPage }, // W3 SC-01 — 태스크 카테고리 프리셋 CRUD
          { path: 'account', Component: SettingsAccountPage }, // ACCT-01/02
          { path: 'calendar', Component: SettingsCalendarPage }, // FIX-13~17
          { path: 'notifications', Component: SettingsNotificationsPage }, // NOTI-01
          // ST-F1-15 owner feedback #D — "지원"/"공지" 목록은 최상위로 튕겨
          // 나가지 않고 다른 설정 항목처럼 이 2-pane 디테일에 머문다.
          { path: 'support', Component: SettingsSupportPage }, // HELP-01~06 (FAQ 탭 + 내 문의 탭)
          { path: 'notices', Component: SettingsNoticesPage }, // OPS-01
        ],
      },
      /*
        ST-F1-15 — 알림 센터(PNL-NOTI)는 라우트가 아니라 벨(NotificationBell)이
        여는 패널이다. 목록 화면(문의/FAQ/공지)은 owner feedback #D로 설정
        하위(`/settings/support`·`/settings/notices`)로 옮겨갔으므로, 이 최상위
        경로들은 그리로 REDIRECT만 한다 — `projects/:projectId`가 이미 쓰는
        "loader만 있고 Component가 없는" 패턴 그대로(위 주석 참고).

        `help/new`도 owner feedback 3차 #2로 여기 합류했다: 문의 작성의 주
        진입은 이제 `/settings/support`가 직접 띄우는 TicketCreateForm
        모달이라, 이 경로는 딥링크/직접 접근 대비용 자리표시자일 뿐이다.

        `help/:ticketId`·`notices/:noticeId`는 그대로 독립 라우트다 — 알림
        클릭(NOTI-04)의 routePath·직접 URL이 계속 여기로 오고,
        `help/:ticketId`의 AC-1 소유권 방어(HelpDetailPage 자신)도 그대로
        유지된다.
      */
      { path: 'faq', loader: () => redirect('/settings/support') },
      { path: 'help', loader: () => redirect('/settings/support') },
      { path: 'help/new', loader: () => redirect('/settings/support') },
      { path: 'help/:ticketId', Component: HelpDetailPage }, // AC-1 FE 소유권 방어는 페이지 자신이 함
      { path: 'notices', loader: () => redirect('/settings/notices') },
      { path: 'notices/:noticeId', Component: AnnouncementDetailPage },
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
      if (error?.status === 401) throw redirect('/login') // ★ '/' 트리와 동일 — 미로그인 방문자는 온보딩도 못 본다
      if (error?.status === 403) throw redirect('/403')
      throw error // ★ DEV 네트워크 우회 제거 — 위 sessionGuardLoader와 같은 이유
    }),
    children: [
      { index: true, Component: OnboardingIntroPage },
      { path: 'wizard', Component: OnboardingWizardPage },
    ],
  },
])
