import { createBrowserRouter, redirect } from 'react-router-dom'
import AppLayout from '../layouts/AppLayout'
import HomePage from '../pages/HomePage'
import WeeklyPage from '../pages/WeeklyPage'
import ProjectsPage from '../pages/ProjectsPage'
import ProjectWorkspacePage from '../pages/ProjectWorkspacePage'
import TaskEditPage from '../pages/TaskEditPage'
import StatisticsPage from '../pages/StatisticsPage'
import SettingsPage from '../pages/SettingsPage'
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
      { path: 'projects/:projectId', Component: ProjectWorkspacePage }, // ★ SCR-PROJ-WS (ST-F1-08)
      { path: 'tasks/:taskId/edit', Component: TaskEditPage }, // ★ SCR-TASK-EDIT (ST-F1-09)
      { path: 'statistics', Component: StatisticsPage },
      { path: 'settings', Component: SettingsPage },
      { path: '403', Component: ForbiddenPage }, // ★ SCR-403
      { path: '*', Component: NotFoundPage },
    ],
  },
])
