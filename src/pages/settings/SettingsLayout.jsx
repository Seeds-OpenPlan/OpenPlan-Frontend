import { useLayoutEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BottomSheet } from '../../components/common/BottomSheet'
import { SettingsNavList } from '../../components/settings/SettingsNavList'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import { SETTINGS_FIRST_DETAIL_PATH } from '../../features/settings/settingsNavOrder'
import { useTutorialRestart } from '../../features/onboarding/useTutorialRestart'

// id every settings sub-page's own <h2> carries (SettingsAvailabilityPage,
// SettingsDefaultsPage, ...) — the mobile BottomSheet's labelledById reads
// straight off it (item 6). Safe as a literal, unshared string: Outlet only
// ever renders ONE of them at a time, so there is never a real duplicate id
// in the DOM despite six pages using the identical literal.
const DETAIL_TITLE_ID = 'settings-detail-title'
// Sidebar width once a detail screen is open (desktop). Named so the list
// pane's and the detail pane's width classes below both read off the SAME
// number instead of two literals that could silently drift apart.
const SIDEBAR_WIDTH = '340px'

/*
  SCR-SET shell (ui-spec §SET). 오너 리뷰 누적 반영:

  A) 페이지 헤더·가로폭을 다른 화면(HomePage/StatisticsPage)과 통일 — 이 컴포넌트
     자신의 max-w 래퍼를 버리고 AppLayout의 `max-w-page`/`px-page-x` 하나에만
     맡긴다. 제목도 다른 화면과 같은 자리·같은 클래스(`text-2xl font-bold
     text-text`)로.

  B) 마스터-디테일 2-pane (데스크톱). SettingsNavList는 라우트가 아니라 이
     레이아웃이 직접, 항상 렌더한다(상세로 이동해도 리스트는 언마운트되지
     않는다). `<Outlet/>`은 오른쪽 DETAIL 패널 자리다. 리스트는 100%(허브) ↔
     SIDEBAR_WIDTH(상세), 디테일 패널은 폭 0 ↔ 나머지 — width/opacity CSS
     transition이 "리스트가 밀리며 상세가 나타나는" 애니메이션이 된다
     (`motion-safe:`로 prefers-reduced-motion 존중).

  오너 리뷰 3차:
  1) 데스크톱은 `/settings`에 정확히 있을 때(atHub) SETTINGS_FIRST_DETAIL_PATH로
     즉시 redirect(replace)한다 — 2-pane 상세가 빈 채로 뜨는 첫인상을 없앤다.
     모바일은 이 리다이렉트를 하지 않는다(리스트를 먼저 보여줘야 하므로 —
     item 1 "모바일은 예외").
  6) 모바일 상세는 더 이상 풀스크린 push가 아니라 **BottomSheet**다: 허브
     리스트가 그대로 뒤에 남아 있고, 그 위에 `<Outlet/>`을 담은 시트가 뜬다.
     시트를 닫으면(백드롭/Esc/드래그 핸들 전부 BottomSheet 자체 기능)
     `/settings`로 navigate — 별도 뒤로가기 링크가 필요 없다.

  튜토리얼 재실행 확인 다이얼로그(TUT-09, AC-6)는 이 레이아웃이 소유한다 —
  SettingsNavList가 상시 마운트되어 있어야 하는 전제와 같은 이유로, 그
  다이얼로그도 라우트가 아니라 이 레이아웃에 산다.
*/
function SettingsLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const isDesktop = useIsDesktop()
  const atHub = location.pathname === '/settings'
  // TUT-09 재실행 확인 다이얼로그 + 재시작 로직은 useTutorialRestart로 뽑혀
  // 있다(ST-F1-15가 FAQ 배너라는 두 번째 진입점을 추가하면서 — 그 훅 자신의
  // 헤더 참고) — 이 레이아웃은 트리거(아래 navList)와 dialog 렌더 위치만 안다.
  const { requestRestart, dialog: tutorialDialog } = useTutorialRestart()

  // item 1 — 데스크톱 전용 자동 진입. `replace: true`라 뒤로가기가 `/settings`
  // 를 다시 거치지 않고 그 이전 페이지로 곧장 돌아간다(히스토리에 빈 허브
  // 상태를 남기지 않는다).
  //
  // Thomas 리뷰 MINOR fix: useEffect → useLayoutEffect. useEffect는 브라우저가
  // 페인트한 "뒤에" 실행되므로, 허브(atHub) 상태의 풀와이드 리스트가 실제로
  // 한 프레임 화면에 그려졌다가 그다음 프레임에 리다이렉트가 일어나 좁은
  // 사이드바로 바뀌는 깜빡임이 보였다. useLayoutEffect는 페인트 전에 동기
  // 실행되므로 사용자는 이미 좁아진 최종 레이아웃만 본다.
  useLayoutEffect(() => {
    if (isDesktop && atHub) {
      navigate(SETTINGS_FIRST_DETAIL_PATH, { replace: true })
    }
  }, [isDesktop, atHub, navigate])

  const navList = <SettingsNavList onTutorialRestart={requestRestart} />

  if (isDesktop) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-text">설정</h1>
        <div className="flex items-start gap-6">
          {/* List pane — a real width TRANSITION (not flex-grow/basis, which
              don't interpolate cleanly across a class swap): 100% at the hub,
              SIDEBAR_WIDTH once a detail route is active. Width itself is an
              inline style (not a Tailwind arbitrary-value class) because it is
              built from the SIDEBAR_WIDTH constant — Tailwind's class scanner
              only recognizes literal strings in source, never an interpolated
              one, so a template-literal class name here would silently emit
              no CSS at all. `shrink-0` keeps this pane from being squeezed by
              its sibling mid-transition. atHub is only ever true for one
              frame here (the redirect effect above fires immediately after),
              so this branch mostly renders already-narrowed. */}
          <div
            style={{ width: atHub ? '100%' : SIDEBAR_WIDTH }}
            className="shrink-0 motion-safe:transition-[width] motion-safe:duration-slow motion-safe:ease-emphasized"
          >
            {navList}
          </div>
          {/* Detail pane — width goes from 0 (collapsed, hub) to "everything
              the list pane just gave up" (100% - sidebar - gap; same
              inline-style reasoning as the list pane above). `inert` keeps
              its (invisible) content out of the tab order and out of
              find-in-page while collapsed — a real accessibility gap a bare
              opacity/width fade would otherwise leave. */}
          <div
            inert={atHub || undefined}
            style={{ width: atHub ? 0 : `calc(100% - ${SIDEBAR_WIDTH} - 1.5rem)` }}
            className={[
              'shrink-0 overflow-hidden rounded-card border border-border bg-surface',
              'motion-safe:transition-[width,opacity] motion-safe:duration-slow motion-safe:ease-emphasized',
              atHub ? 'opacity-0' : 'p-4 opacity-100 md:p-6',
            ].join(' ')}
          >
            <Outlet />
          </div>
        </div>
        {tutorialDialog}
      </div>
    )
  }

  // Mobile (item 6): the hub list ALWAYS renders — a detail route opens a
  // BottomSheet on top of it rather than replacing it full-screen. Closing
  // the sheet (backdrop/Esc/drag-handle, all built into BottomSheet itself)
  // navigates back to the hub; no separate back-link is needed inside the
  // sheet's own content.
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-text">설정</h1>
      {navList}
      {!atHub && (
        <BottomSheet open onClose={() => navigate('/settings')} labelledById={DETAIL_TITLE_ID}>
          <Outlet />
        </BottomSheet>
      )}
      {tutorialDialog}
    </div>
  )
}

export default SettingsLayout
