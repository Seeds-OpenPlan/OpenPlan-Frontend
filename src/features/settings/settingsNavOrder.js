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
