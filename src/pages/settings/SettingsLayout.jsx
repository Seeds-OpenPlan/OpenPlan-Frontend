import { useLayoutEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Dialog } from '../../components/common/Dialog'
import { BottomSheet } from '../../components/common/BottomSheet'
import { Button } from '../../components/common/Button'
import { SettingsNavList } from '../../components/settings/SettingsNavList'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import { SETTINGS_FIRST_DETAIL_PATH } from '../../features/settings/settingsNavOrder'
import { useUpdateOnboardingProgress } from '../../features/onboarding/useOnboarding'
import { onboardingCopy } from '../../features/onboarding/onboardingCopy'

const TUTORIAL_TITLE_ID = 'tutorial-restart-title'
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
  const [confirmOpen, setConfirmOpen] = useState(false)
  const confirmBtnRef = useRef(null)
  const updateOnboardingProgress = useUpdateOnboardingProgress()

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

  // TUT-09 재실행 — 확인(위 다이얼로그) 후 progress를 kickoff 상태로 되돌리고
  // 대시보드로 이동하면, 거기 상시 마운트된 TutorialOverlay(AppLayout)가 그
  // 갱신된 캐시를 그대로 읽어 TUT-01 킥오프부터 다시 시작한다 — 별도의
  // "재생 시작" 신호가 따로 필요 없다(둘이 같은 onboarding-progress 캐시를
  // 공유하는 이유가 이것).
  //
  // [한계] 결정문 §4.4가 원하는 "잔존 샘플 정리"는 실제로 하지 않는다 — 이전
  // 실행에서 만든 샘플 프로젝트/태스크는 실기능(ProjectsPage 등, 다른 스토리
  // 소유)으로 생성되어 "샘플" 표식이 없어 이 스토리 범위에서 안전하게
  // 식별·삭제할 방법이 없다(오탐으로 사용자의 실제 프로젝트를 지울 위험).
  // Thomas 리뷰 MAJOR fix — 예전엔 다이얼로그 문구가 "정리한 뒤 시작합니다"라고
  // 실제로 안 하는 동작을 약속했다; 문구 자체를 onboardingCopy.tutorial.restart*
  // 로 바꿔 이 한계에 맞게 정정했다(아래 tutorialDialogBody). 후속 스토리에서
  // 생성 시점에 표식을 남기는 결정이 나면 여기서 그 표식으로 정리를 추가한다.
  const confirmRestart = () => {
    setConfirmOpen(false)
    updateOnboardingProgress.mutate(
      { tutorialCompleted: false, tutorialSkipped: false, tutorialStep: 0 },
      { onSuccess: () => navigate('/') },
    )
  }

  const navList = <SettingsNavList onTutorialRestart={() => setConfirmOpen(true)} />

  const tutorialDialogBody = (
    <div className="flex flex-col gap-4">
      <h2 id={TUTORIAL_TITLE_ID} className="text-title font-semibold text-text">
        {onboardingCopy.tutorial.restartTitle}
      </h2>
      <p className="text-body text-text-muted">{onboardingCopy.tutorial.restartBody}</p>
      <div className="mt-1 flex justify-end gap-2">
        <Button type="button" variant="secondary" size="md" onClick={() => setConfirmOpen(false)}>
          {onboardingCopy.tutorial.restartCancel}
        </Button>
        <Button ref={confirmBtnRef} type="button" variant="primary" size="md" onClick={confirmRestart}>
          {onboardingCopy.tutorial.restartConfirm}
        </Button>
      </div>
    </div>
  )
  const tutorialDialog =
    confirmOpen &&
    (isDesktop ? (
      <Dialog
        open
        onClose={() => setConfirmOpen(false)}
        labelledById={TUTORIAL_TITLE_ID}
        initialFocusRef={confirmBtnRef}
      >
        {tutorialDialogBody}
      </Dialog>
    ) : (
      <BottomSheet
        open
        onClose={() => setConfirmOpen(false)}
        labelledById={TUTORIAL_TITLE_ID}
        initialFocusRef={confirmBtnRef}
      >
        {tutorialDialogBody}
      </BottomSheet>
    ))

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
