import { createBrowserRouter, redirect } from 'react-router-dom'
import AppLayout from '../layouts/AppLayout'
import HomePage from '../pages/HomePage'
import WeeklyPage from '../pages/WeeklyPage'
import ProjectsPage from '../pages/ProjectsPage'
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

export const router = createBrowserRouter([
  {
    path: '/',
    Component: AppLayout,
    ErrorBoundary: RootErrorBoundary, // ★ global runtime-error fallback (SYS-02 AC-5)
    HydrateFallback, // ★ shown during initial session-guard resolution (no blank flash)
    loader: sessionGuardLoader, // ★ OP-AUTH-SESSION, dev stub passes through
    children: [
      { index: true, Component: HomePage },
      { path: 'weekly', Component: WeeklyPage },
      { path: 'projects', Component: ProjectsPage },
      { path: 'statistics', Component: StatisticsPage },
      { path: 'settings', Component: SettingsPage },
      { path: '403', Component: ForbiddenPage }, // ★ SCR-403
      { path: '*', Component: NotFoundPage },
    ],
  },
])
