/*
  Single source for "what is the FIRST settings sub-screen" (오너 리뷰 3차,
  item 1 — 데스크톱은 `/settings` 진입 시 이 경로로 자동 리다이렉트해 2-pane
  디테일이 빈 채로 뜨지 않게 한다). Read by SettingsLayout (redirect target)
  and mirrored by SettingsNavList's own row order (그 파일은 행마다 배지 JSX가
  달라 데이터 배열로 통합하지 않고 손으로 작성하지만, 첫 행은 반드시 이 경로와
  같아야 한다).

  전체 순서(오너 지정): 기본값 → 가용시간 → 고정일정 → 계정관리 → 캘린더연동 →
  알림.
*/
export const SETTINGS_FIRST_DETAIL_PATH = '/settings/defaults'

/*
  모바일 전체화면 슬라이드 상세의 상단 헤더(← 뒤로 + 제목)가 쓰는 제목 문구
  (오너 실측 피드백, 2026-10 — item 3). SettingsLayout은 Outlet이 어떤 하위
  페이지를 렌더하는지 모르는 채로 그 바깥에서 헤더를 그려야 하므로, 각 하위
  페이지 자신의 `<h2 id="settings-detail-title">` 텍스트를 다시 읽어올 방법이
  없다 — 그래서 경로→제목 매핑을 여기 한 곳에 둔다.

  SettingsNavList의 행 제목과 의도적으로 같은 문구를 쓴다("기본값 설정" 등):
  사용자가 허브에서 탭한 행 이름과 상세 헤더의 제목이 같아야 "내가 누른 그
  화면이 맞다"는 확신을 주기 때문. 두 파일이 같은 문구를 각자 들고 있는 건
  SettingsNavList 자신의 헤더 주석이 이미 설명한 것과 같은 종류의 트레이드오프
  (배지 JSX가 행마다 달라 데이터 배열로 통합하지 않음)다.
*/
export const SETTINGS_DETAIL_TITLES = {
  '/settings/defaults': '기본값 설정',
  '/settings/availability': '가용시간 설정',
  '/settings/fixed-schedules': '고정일정 관리',
  '/settings/task-categories': '태스크 카테고리',
  '/settings/account': '계정 관리',
  '/settings/calendar': '캘린더 연동',
  '/settings/notifications': '알림',
  '/settings/support': '지원',
  '/settings/notices': '공지',
}
