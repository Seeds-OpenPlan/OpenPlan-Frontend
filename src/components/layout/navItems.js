import {
  HomeIcon,
  CalendarIcon,
  ProjectIcon,
  ChartIcon,
  SettingsIcon,
} from './icons'

// 데스크톱 상단 내비 / 모바일 하단 탭이 공유하는 단일 정의.
// end: 정확히 일치할 때만 활성 (루트 '/' 가 모든 경로에 매칭되는 것 방지).
export const navItems = [
  { to: '/', label: '대시보드', Icon: HomeIcon, end: true },
  { to: '/weekly', label: '주간계획', Icon: CalendarIcon },
  { to: '/projects', label: '프로젝트', Icon: ProjectIcon },
  { to: '/statistics', label: '통계', Icon: ChartIcon },
  { to: '/settings', label: '설정', Icon: SettingsIcon },
]
