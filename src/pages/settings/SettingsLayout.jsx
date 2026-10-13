import { useEffect, useLayoutEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { SettingsNavList } from '../../components/settings/SettingsNavList'
import { ChevronLeftIcon } from '../../components/settings/settingsIcons'
import { useIsDesktop, useMediaQuery } from '../../hooks/useMediaQuery'
import { SETTINGS_FIRST_DETAIL_PATH, SETTINGS_DETAIL_TITLES } from '../../features/settings/settingsNavOrder'
import { useTutorialRestart } from '../../features/onboarding/useTutorialRestart'

// Sidebar width once a detail screen is open (desktop). Named so the list
// pane's and the detail pane's width classes below both read off the SAME
// number instead of two literals that could silently drift apart.
//
// D3: 768~900px(폴드를 펼친 기기가 데스크톱 셸로 떨어지는 구간, 또는 세로
// 태블릿)에서는 340px 고정 사이드바가 남는 상세 폭을 너무 많이 가져가
// 상세 쪽이 눈에 띄게 좁아진다(예: 820px 너비면 상세가 ≈456px). lg(1024px)
// 미만에서는 260px로 줄여 상세에 더 내준다 — lg 이상(원래 디자인 기준폭)은
// 340px 그대로.
const SIDEBAR_WIDTH_NARROW = '260px'
const SIDEBAR_WIDTH_WIDE = '340px'

/*
  SCR-SET shell (ui-spec §SET). 오너 실측 리뷰(2026-10, item 3)로 구조를
  다시 짰다 — 이전 버전은 데스크톱/모바일이 서로 다른 JSX 반환 분기를 갖고
  분기마다 `<Outlet/>`을 따로 선언했다. 그래서 폭이 768px 경계를 넘나들면
  (창 크기 조절, 폴드 펼침/접힘) 두 분기가 통째로 스왑되며 그 안의
  `<Outlet/>`(=상세 라우트 컴포넌트)이 완전히 다른 Fiber 서브트리로 옮겨가
  리마운트됐다 — 입력 중이던 폼이 날아갔다. 그걸 막으려고 셸 자체를
  `useLockedIsDesktop`으로 고정해 뒀었는데, 그 결과 데스크톱에서 상세를 연
  채로 창을 좁히면 260/340px 고정폭 2단 레이아웃이 좁은 화면에 그대로 눌려
  그려지는 부작용이 났다(오너 실측).

  지금은 `<Outlet/>`을 단 한 번만 선언한다. 데스크톱/모바일 차이는 그
  Outlet의 "가장 가까운 안정된 부모"(아래 contentPane) 바깥의 CSS(위치·폭·
  transform)로만 가른다 — Outlet 자신의 부모 Fiber가 리렌더 내내 같은
  자리(같은 타입·같은 children 배열 위치)에 머물러 있으므로, isDesktop이
  실시간으로 바뀌어도 React가 그 서브트리를 리마운트할 이유가 없다. 그래서
  셸을 고정할 필요가 없어졌고, `useIsDesktop()`을 실시간으로 그냥 쓴다(D1의
  폴드 입력-소실 버그가 구조적으로 사라진다).

  모바일(item 6, 오너 재지시): 상세는 더 이상 BottomSheet가 아니라 오른쪽에서
  슬라이드되는 전체화면 페이지다 — 허브 리스트는 그대로 DOM에 남아 있지만
  `inert`로 포커스/스크린리더에서 빠지고, 시각적으로는 전체화면 상세가
  `fixed inset-0`로 덮는다. 뒤로가기는 BottomSheet의 overlayHistory 브리지를
  쓰지 않는다 — `/settings/xxx`가 이미 진짜 라우트라서 브라우저/안드로이드
  뒤로가기는 라우터 기본 동작(popstate)만으로 허브로 돌아간다. 화면 안의
  ← 버튼은 NotFoundPage/ForbiddenPage와 같은 "직접 진입 가드"
  (`window.history.length > 1`)로 navigate(-1)과 `/settings`를 가른다 — 북마크로
  `/settings/account`에 바로 들어온 경우 뒤로가기가 앱 밖으로 나가지 않게.

  데스크톱 2단(B)은 모양·동작 그대로: SettingsNavList는 라우트가 아니라 이
  레이아웃이 직접, 항상 렌더한다. 리스트는 100%(허브) ↔ SIDEBAR_WIDTH(상세),
  디테일 패널은 폭 0 ↔ 나머지 — width/opacity CSS transition이 "리스트가
  밀리며 상세가 나타나는" 애니메이션이 된다(`motion-safe:`로
  prefers-reduced-motion 존중).

  오너 리뷰 3차, item 1 — 데스크톱은 `/settings`에 정확히 있을 때(atHub)
  SETTINGS_FIRST_DETAIL_PATH로 즉시 redirect(replace)한다 — 2-pane 상세가 빈
  채로 뜨는 첫인상을 없앤다. 모바일은 이 리다이렉트를 하지 않는다(리스트를
  먼저 보여줘야 하므로).

  튜토리얼 재실행 확인 다이얼로그(TUT-09, AC-6)는 이 레이아웃이 소유한다 —
  SettingsNavList가 상시 마운트되어 있어야 하는 전제와 같은 이유로, 그
  다이얼로그도 라우트가 아니라 이 레이아웃에 산다.
*/
function SettingsLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const atHub = location.pathname === '/settings'
  // 더 이상 고정(latch)할 필요가 없다 — 위 헤더 설명 참고. 실시간 값을 그냥
  // 쓴다.
  const isDesktop = useIsDesktop()
  // D3: lg 미만(768~1023px)에서는 좁은 사이드바를 쓴다 — 위 SIDEBAR_WIDTH_*
  // 주석 참고.
  const isLg = useMediaQuery('(min-width: 1024px)')
  const sidebarWidth = isLg ? SIDEBAR_WIDTH_WIDE : SIDEBAR_WIDTH_NARROW
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
  //
  // isDesktop이 이제 실시간 값이라, 상세가 열려 있지 않을 때(atHub) 창을
  // 넓혀 모바일→데스크톱으로 넘어가면 이 effect가 다시 평가되어 자연스럽게
  // 첫 상세로 들어간다 — 오너가 요구한 "폭을 줄였다 늘렸을 때 자연스러운
  // 전환"의 한 축.
  useLayoutEffect(() => {
    if (isDesktop && atHub) {
      navigate(SETTINGS_FIRST_DETAIL_PATH, { replace: true })
    }
  }, [isDesktop, atHub, navigate])

  // 모바일 슬라이드 상세가 열리면 그 제목으로 포커스를 옮긴다
  // (NotFoundPage.jsx의 "라우트 진입 시 제목에 포커스" 패턴과 동일) — 그래야
  // 스크린리더 사용자가 방금 inert 처리된 허브 행에 포커스가 멈춰 있지 않고
  // "무엇이 열렸는지"를 바로 듣는다. 데스크톱(2단, 허브가 inert되지 않음)과
  // 허브 자체(상세가 없음)에서는 옮길 포커스가 없다.
  const titleRef = useRef(null)
  useEffect(() => {
    if (isDesktop || atHub) return
    titleRef.current?.focus()
  }, [isDesktop, atHub, location.pathname])

  // ← 버튼: 허브에서 들어온 보통 경로는 navigate(-1)이 히스토리를 한 칸
  // 되돌려 허브로 간다(브라우저 뒤로가기와 동일한 결과). 북마크·새로고침
  // 등으로 상세 라우트에 직접 들어온 경우 popping할 앱 내 히스토리가 없어
  // navigate(-1)이 앱 밖으로 나가 버린다 — NotFoundPage/ForbiddenPage가 이미
  // 쓰는 `window.history.length > 1` 가드로 그 경우만 `/settings`로 보낸다.
  const handleBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/settings')
  }

  const navList = <SettingsNavList onTutorialRestart={requestRestart} />
  // 모바일에서 상세(전체화면 슬라이드)가 열려 있는 동안 허브 리스트를
  // 포커스/스크린리더에서 뺀다 — 시각적으로는 상세가 `fixed`로 완전히 덮지만
  // DOM상으론 둘 다 떠 있으므로, inert 없이는 Tab이나 가상 커서가 가려진
  // 허브 행으로 넘어갈 수 있다. 데스크톱 2단은 둘 다 항상 상호작용 가능해야
  // 하므로 해당 없음.
  const hubInert = !isDesktop && !atHub

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-text">설정</h1>
      <div className="relative flex items-start gap-6">
        {/* List pane — a real width TRANSITION (not flex-grow/basis, which
            don't interpolate cleanly across a class swap): 100% at the hub,
            SIDEBAR_WIDTH once a detail route is active, desktop only. Width
            itself is an inline style (not a Tailwind arbitrary-value class)
            because it is built from the SIDEBAR_WIDTH constant — Tailwind's
            class scanner only recognizes literal strings in source, never an
            interpolated one. `shrink-0` keeps this pane from being squeezed
            by its sibling mid-transition. 모바일은 항상 전체 폭(detail이
            `fixed`로 떠 있는 레이어라 폭을 나눠 가질 상대가 없다). */}
        <div
          inert={hubInert || undefined}
          style={isDesktop ? { width: atHub ? '100%' : sidebarWidth } : undefined}
          className={[
            'shrink-0',
            isDesktop
              ? 'motion-safe:transition-[width] motion-safe:duration-slow motion-safe:ease-emphasized'
              : 'w-full',
          ].join(' ')}
        >
          {navList}
        </div>

        {/* Detail pane — the ONE <Outlet/> in this file. `inert` keeps its
            (invisible, whether collapsed-to-0 on desktop or slid offscreen on
            mobile) content out of the tab order and out of find-in-page while
            hidden — a real accessibility gap a bare opacity/transform fade
            would otherwise leave. */}
        <div
          inert={atHub || undefined}
          style={isDesktop ? { width: atHub ? 0 : `calc(100% - ${sidebarWidth} - 1.5rem)` } : undefined}
          className={
            isDesktop
              ? [
                  'shrink-0 overflow-hidden rounded-card border border-border bg-surface',
                  'motion-safe:transition-[width,opacity] motion-safe:duration-slow motion-safe:ease-emphasized',
                  atHub ? 'opacity-0' : 'opacity-100',
                ].join(' ')
              : [
                  // 전체화면 슬라이드(item 6) — `fixed inset-0`이라 AppLayout의
                  // max-w-page/px-page-x 래퍼를 벗어나 뷰포트 전체(상단바·하단
                  // 탭바 포함)를 덮는다. z-40은 이 코드베이스의 다른 비-모달
                  // 전체화면 오버레이(BlockActionMenu/UnplacedPanel 등)와 같은
                  // 층 — 진짜 모달(Dialog/BottomSheet, z-50)은 이 안에서 열려도
                  // 여전히 그 위에 뜬다.
                  'fixed inset-0 z-40 flex flex-col overflow-hidden bg-surface',
                  'motion-safe:transition-transform motion-safe:duration-slow motion-safe:ease-emphasized',
                  atHub ? 'translate-x-full' : 'translate-x-0',
                ].join(' ')
          }
        >
          {/* 모바일 전용 헤더(← 뒤로 + 제목) — ProjectWbsDrawer.jsx의 같은
              모양(back button + h2)을 그대로 따른다. 허브에 있을 때는 아예
              렌더하지 않는다(보여줄 제목이 없고, 어차피 전체가 inert+
              화면 밖이다) — 이 조건이 아래 `contentPane`의 children 배열
              위치를 바꾸지 않는 것이 핵심이다(React가 조건식 자체를 항상
              같은 슬롯에 두므로 Outlet의 부모는 흔들리지 않는다). */}
          {!isDesktop && !atHub && (
            <div className="flex items-center gap-2 border-b border-border p-3">
              <button
                type="button"
                onClick={handleBack}
                aria-label="설정 목록으로 돌아가기"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-text-muted transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                <ChevronLeftIcon className="text-xl" />
              </button>
              {/* tabIndex={-1} — 일반 탐색 탭 순서에는 끼지 않지만(제목은 탭
                  스톱이 아니다) 위 focus 이펙트가 JS로 직접 포커스를 옮길 수
                  있게 한다. NotFoundPage.jsx의 heading과 같은 패턴. */}
              <h2
                ref={titleRef}
                tabIndex={-1}
                className="truncate text-title font-semibold text-text outline-none"
              >
                {SETTINGS_DETAIL_TITLES[location.pathname] ?? ''}
              </h2>
            </div>
          )}
          {/* contentPane: Outlet의 실제 부모. 데스크톱/모바일 모두에서 항상
              이 자리, 이 타입(div)에 산다 — 위 헤더가 있다/없다로 바뀌는 건
              이 div "앞"의 형제뿐이라 Outlet 자신의 부모 Fiber 위치는 전혀
              흔들리지 않는다(셸 리마운트가 없다는 이 파일의 핵심 불변 조건). */}
          <div className={isDesktop ? 'p-4 md:p-6' : 'flex-1 overflow-y-auto p-4'}>
            <Outlet />
          </div>
        </div>
      </div>
      {tutorialDialog}
    </div>
  )
}

export default SettingsLayout
