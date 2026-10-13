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

/*
  PR #82 AI 리뷰 Should-fix: 위 맵은 router.js의 `/settings/*` 자식 경로를
  정확히 한 단계만 따라간다 — `calendar/google-callback`처럼 그 밑에 한 단계
  더 들어간 경로(구글 캘린더 OAuth 콜백 착지점, GoogleCalendarCallbackPage)는
  정확히 일치하는 키가 없어 빈 제목을 받았다. 정확히 일치하는 항목이 없으면
  "가장 긴 접두사"로 거슬러 올라가 부모 항목의 제목을 쓴다(콜백 화면은 결국
  "캘린더 연동" 흐름의 일부이므로 그 제목이 맞다) — 그래도 못 찾으면 빈 h2
  대신 페이지 기본 제목("설정")으로 떨어진다.

  콜백 전용 문구를 명시적으로 추가하지 않은 이유: 이 화면은 항상
  `/settings/calendar`로 재이동(replace)하며 끝나는 몇 초짜리 처리 중
  화면이고, "캘린더 연동"이라는 제목이 사용자가 방금 탭한 행과 이미
  일치해 혼란을 주지 않는다 — 접두사 매칭 하나로 이 경로뿐 아니라 앞으로
  `/settings/calendar/` 밑에 생길 임의의 하위 경로까지 함께 커버된다.
*/
export function resolveSettingsDetailTitle(pathname) {
  let best = null
  for (const [path, title] of Object.entries(SETTINGS_DETAIL_TITLES)) {
    const isMatch = pathname === path || pathname.startsWith(`${path}/`)
    if (isMatch && (!best || path.length > best.path.length)) {
      best = { path, title }
    }
  }
  return best?.title ?? '설정'
}
