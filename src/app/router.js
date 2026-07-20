import { createBrowserRouter } from 'react-router-dom'
import AppLayout from '../layouts/AppLayout'
import HomePage from '../pages/HomePage'
import WeeklyPage from '../pages/WeeklyPage'
import ProjectsPage from '../pages/ProjectsPage'
import StatisticsPage from '../pages/StatisticsPage'
import SettingsPage from '../pages/SettingsPage'
import NotFoundPage from '../pages/NotFoundPage'

export const router = createBrowserRouter([
  {
    path: '/',
    Component: AppLayout,
    children: [
      { index: true, Component: HomePage },
      { path: 'weekly', Component: WeeklyPage },
      { path: 'projects', Component: ProjectsPage },
      { path: 'statistics', Component: StatisticsPage },
      { path: 'settings', Component: SettingsPage },
      { path: '*', Component: NotFoundPage },
    ],
  },
])
