import { useEffect, useLayoutEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { SettingsNavList } from '../../components/settings/SettingsNavList'
import { ChevronLeftIcon } from '../../components/settings/settingsIcons'
import { useIsDesktop, useMediaQuery } from '../../hooks/useMediaQuery'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { getOverlayStackSnapshot } from '../../utils/overlayStack'
import { SETTINGS_FIRST_DETAIL_PATH } from '../../features/settings/settingsNavOrder'
import { useTutorialRestart } from '../../features/onboarding/useTutorialRestart'

// 설정 하위 페이지 9개 모두가 자신의 제목 `<h2>`에 공통으로 붙이는 리터럴 id
// (각 페이지 자신의 헤더 주석 참고). 이 레이아웃은 그 id로 "지금 열린 상세의
// 제목이 어디 있는지"만 찾는다 — 제목 **문구**는 절대 여기서 다시 선언하지
// 않는다(PR #82 AI 리뷰 Blocking fix: 한때 레이아웃이 경로→제목 맵으로 같은
// 문구를 또 그려 제목이 화면에 두 번 보였다).
const DETAIL_TITLE_ID = 'settings-detail-title'

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
  ← 버튼은 (PR #82 AI 리뷰 Blocking fix) `window.history.length` 같은
  간접 신호가 아니라 SettingsNavList가 허브에서 상세로 들어갈 때만 실어
  보내는 `location.state.fromSettingsHub`로 "허브를 거쳐 왔는지"를 직접
  판정한다 — 자세한 이유와 각 분기는 아래 `handleBack` 자신의 주석 참고.

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

  // 모바일에서 상세(전체화면 슬라이드)가 "열려 있다"는 조건 — 이 레이아웃
  // 안에서 포커스 트랩·허브 inert·ESC 처리·focus 이펙트가 전부 같은 이
  // 조건을 쓴다(예전엔 `!isDesktop && !atHub`가 3곳에 따로 적혀 있었다).
  const mobileDetailOpen = !isDesktop && !atHub

  // ← 버튼 (PR #82 AI 리뷰 Blocking fix): "허브에서 들어왔는지"를
  // `window.history.length`가 아니라 location.state로 명시적으로 추적한다.
  //
  // 이전 가드(`window.history.length > 1`)의 전제가 틀렸었다 — 데스크톱
  // 자동 리다이렉트(위 useLayoutEffect, `/settings`→첫 상세, `replace:
  // true`)가 허브 엔트리를 히스토리에서 지우고 나면, 그 뒤 창을 좁혀 모바일로
  // 바뀌어도 `history.length`는 여전히 1보다 커서(설정에 들어오기 전의 다른
  // 페이지들 때문에) navigate(-1)이 실행됐다 — 그 결과 ← 버튼이 허브를
  // 건너뛰고 설정에 들어오기 전 화면으로 나가 버렸다.
  //
  // 지금은 SettingsNavList의 Row가 "지금 허브에 서 있다가 상세로 들어가는"
  // 클릭에만 `state={{ fromSettingsHub: true }}`를 NavLink에 실어 보낸다
  // (그 파일 자신의 `fromHubState` 주석 참고):
  // - state가 있으면 → 허브를 거쳐 방금 들어왔다는 뜻 → navigate(-1)로
  //   히스토리를 한 칸 되감는다(브라우저 뒤로가기와 동일한 결과).
  // - state가 없으면 → 데스크톱 자동 리다이렉트·북마크/새로고침 직접 진입·
  //   데스크톱 2단에서 상세→상세로 건너뛴 경우(허브를 거치지 않음) 중
  //   하나다 → `/settings`로 **replace**한다. push를 쓰면 지금 보던 상세
  //   위에 허브가 새로 쌓여, 그다음 뒤로가기를 누르면 그 상세로 되돌아가는
  //   루프가 생긴다 — replace는 그 상세 엔트리 자체를 허브로 바꿔치기해
  //   루프를 만들지 않는다.
  const handleBack = () => {
    if (location.state?.fromSettingsHub) navigate(-1)
    else navigate('/settings', { replace: true })
  }

  // PR #82 AI 리뷰 Blocking fix (포커스 트랩): `fixed inset-0`으로 뷰포트를
  // 덮는 모바일 전체화면 상세는 시각적으로는 모달이지만, 예전 BottomSheet가
  // 주던 `useFocusTrap`도 `role="dialog"`도 없었다 — 그래서 Tab/Shift+Tab이
  // 뒤에 깔린 AppLayout의 MobileTopBar(알림·계정)·BottomTabBar로 새어나가,
  // 거기서 Enter를 누르면 다른 탭으로 이동해 버렸다. AppLayout 자체를 고쳐
  // 그 바깥 바들을 inert하는 방법도 있지만 이번엔 피한다(리드 결정 — 이
  // 레이아웃 파일 밖을 건드리지 않고 끝낼 수 있어서다). 대신 Dialog/
  // BottomSheet가 이미 쓰는 같은 useFocusTrap을 이 패널의 컨테이너
  // (panelRef, 아래 렌더의 상세 pane div)에 걸어 Tab 순환을 그 안으로
  // 가둔다. 데스크톱 2단에서는 허브와 상세가 동시에 상호작용 가능해야 하므로
  // `open`을 모바일-열림 조건에만 묶는다 — 이 값은 실시간 리사이즈에 반응해도
  // 안전하다(Tab을 어디서 가둘지는 "지금 화면이 모바일 모양인가"일 뿐, 포커스
  // 자체를 옮기는 건 아니므로).
  //
  // `manageFocus: false` (PR #82 AI 리뷰 2차 Blocking fix): 기본 동작(true)은
  // `open`이 켜지는 "순간" 포커스를 안으로 옮기고, 꺼지는 "순간" 이전 포커스로
  // 되돌린다 — Dialog/BottomSheet처럼 `open`이 실제 마운트/언마운트와 1:1인
  // 호출부에서는 그게 맞다. 그러나 여기 `open`(=mobileDetailOpen)은 isDesktop
  // 이라는 실시간 미디어 쿼리에서 파생되므로, 라우트는 그대로인 채 창 폭만
  // 768px 경계를 넘나들어도(리사이즈, 폴드 펼침/접힘) `open`이 토글된다 — 그때
  // 마다 자동으로 포커스가 옮겨지면, 하위 페이지의 입력 필드에 타이핑하던 중
  // 창을 돌리기만 해도 포커스가 튕겨 나갔다(실제 재현된 Blocking). 포커스를
  // 언제 옮길지는 아래 두 effect가 **라우트(location.pathname) 변화에만** 반응해
  // 따로 결정한다 — 트랩은 Tab 가두기만 맡는다.
  const panelRef = useRef(null)
  useFocusTrap(panelRef, { open: mobileDetailOpen, manageFocus: false })

  // 아래 두 effect(제목 포커스 / 허브로 돌아올 때 포커스)가 공유하는 "리사이즈
  // 때문에 effect가 다시 돌면 안 된다"는 요구를 만족시키는 장치 — `isDesktop`을
  // effect의 deps로 직접 넣는 대신, 매 렌더 최신값을 ref에 적어 두고 effect
  // 안에서는 그 ref만 읽는다(BottomSheet.jsx의 `onCloseRef`와 같은 이유: deps에
  // 안 넣인 값을 "그 순간의 값"으로만 참조). 이 updater는 deps 배열이 없어 매
  // 렌더 실행되지만, effect 바디가 가벼워 비용이 무시할 만하다.
  const isDesktopRef = useRef(isDesktop)
  useEffect(() => {
    isDesktopRef.current = isDesktop
  })

  // 방금까지 보고 있던 상세 경로 — 허브로 돌아올 때 "그 항목의 허브 Row"로
  // 포커스를 돌려주기 위해 기억해 둔다(아래 효과 참고). atHub가 아닐 때마다
  // 갱신되고, atHub가 되는 순간에는 건드리지 않아 "방금 떠난 경로"가 그대로
  // 남는다.
  const lastDetailPathRef = useRef(atHub ? null : location.pathname)
  // 허브 리스트 전체를 감싸는 pane(아래 렌더) — 그 안에서 `href`가 일치하는
  // NavLink 행을 찾아 포커스한다(SettingsNavList 자신은 고치지 않는다).
  const hubPaneRef = useRef(null)

  // 모바일 슬라이드 상세가 열리면 그 "하위 페이지 자신의" 제목(#settings-
  // detail-title)으로, 허브로 돌아오면 방금 보던 항목의 허브 Row로 포커스를
  // 옮긴다(NotFoundPage.jsx의 "라우트 진입 시 제목에 포커스" 패턴과 동일) —
  // 그래야 스크린리더 사용자가 방금 inert 처리된 요소에 포커스가 멈춰 있지
  // 않고 "무엇이 바뀌었는지"를 바로 듣는다.
  //
  // PR #82 AI 리뷰 2차 Blocking fix — deps를 `[location.pathname]` 하나로
  // 좁혔다(이전엔 `mobileDetailOpen`도 있어, 리사이즈만 해도 이 effect가
  // 다시 돌며 포커스를 빼앗았다). isDesktop은 `isDesktopRef`로 읽어 "그
  // 순간"의 값만 쓴다 — 데스크톱에서 상세에 진입했다가 나중에 리사이즈로
  // 모바일이 되어도(라우트는 그대로) 이 effect 자체가 재실행되지 않으므로
  // 포커스가 전혀 움직이지 않는다(요구사항 그대로).
  //
  // 순서 의존성(여전히 유효): 바로 위 useFocusTrap은 이제 `manageFocus:
  // false`라 포커스를 옮기지 않으므로, 이 effect와 더는 경쟁하지 않는다.
  const contentPaneRef = useRef(null)
  useEffect(() => {
    const atHubNow = location.pathname === '/settings'

    if (atHubNow) {
      // 데스크톱은 허브/상세가 항상 둘 다 보이므로 "돌아온다"는 개념이 없다
      // — 포커스를 건드리지 않는다.
      if (!isDesktopRef.current && hubPaneRef.current && lastDetailPathRef.current) {
        const row = hubPaneRef.current.querySelector(`a[href="${lastDetailPathRef.current}"]`)
        row?.focus()
      }
      return undefined
    }

    // 상세 라우트에 있다 — lastDetailPathRef를 갱신해 다음에 허브로 돌아올
    // 때 이 경로를 가리키게 한다.
    lastDetailPathRef.current = location.pathname

    // 데스크톱(2단)은 허브가 inert되지 않으므로 옮길 포커스가 없다.
    if (isDesktopRef.current) return undefined

    const container = contentPaneRef.current
    if (!container) return undefined

    // 설정 하위 페이지 중 절반 가까이(계정·가용시간·기본값·고정일정·알림·
    // 카테고리)는 쿼리가 끝나기 전엔 로딩 스켈레톤만 그리고, 그 h2는 데이터가
    // 도착한 "다음" 렌더에야 DOM에 나타난다 — 라우트가 막 바뀐 이 시점엔
    // 아직 없을 수 있다는 뜻. 타이머로 추측해 재시도하는 대신,
    // MutationObserver로 그 heading이 실제로 "생기는" 순간 자체를 구독한다
    // (캐시 히트로 즉시 나타나도, 느린 네트워크로 늦게 나타나도 똑같이
    // 맞는다 — PR #82 AI 리뷰 Blocking fix의 "렌더 타이밍을 안전하게 잡으라"
    // 요구사항).
    const focusTitle = () => {
      const node = container.querySelector(`#${DETAIL_TITLE_ID}`)
      if (!node) return false
      // 9개 하위 페이지의 h2는 평소 포커스 대상이 아니라 tabIndex가 없다 —
      // 그 페이지들을 하나도 고치지 않고 포커스만 가능하게 만들려고 레이아웃
      // 쪽에서 속성을 얹는다. setAttribute는 멱등이라 이미 -1이어도 무해하다.
      if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '-1')
      node.focus()
      return true
    }

    // 로딩 상태 없이 h2가 바로 그려지는 페이지(캘린더·지원·공지)는 여기서
    // 바로 성공하고 끝 — observer를 만들 필요가 없다.
    if (focusTitle()) return undefined

    // google-callback처럼 h2가 끝내 나타나지 않는 페이지(ErrorState/
    // LoadingSkeleton만 렌더)도 있다 — 그런 경우 이 observer는 다음 라우트
    // 전환까지 조용히 대기하다 아래 cleanup에서 disconnect되고, 포커스는
    // 그냥 생략된다(지시 사항이 허용한 두 선택지 중 "생략" 쪽).
    const observer = new MutationObserver(() => {
      if (focusTitle()) observer.disconnect()
    })
    observer.observe(container, { childList: true, subtree: true })
    return () => observer.disconnect()
    // 의도적으로 location.pathname에만 반응한다(리사이즈 제외) — 위 효과
    // 설명 참고. isDesktop/atHub는 ref로만 읽으므로 react-hooks/exhaustive-deps
    // 가 이 배열을 그대로 통과시킨다(ref는 그 규칙의 공인된 예외).
  }, [location.pathname])

  // ESC도 ← 버튼과 같은 동작(허브로 돌아가기)을 하게 한다 — 트랩이 생긴
  // 이상 Esc는 Dialog/BottomSheet와 마찬가지로 "닫는" 수단으로 기대된다.
  // handleBack은 매 렌더 새로 만들어지는 함수라 effect의 의존성 배열에
  // 그대로 넣으면 키 리스너를 매번 떼고 다시 붙이게 된다 — BottomSheet.jsx의
  // `onCloseRef`와 같은 이유로 ref에 최신 버전만 담아 둔다.
  const handleBackRef = useRef(handleBack)
  useEffect(() => {
    handleBackRef.current = handleBack
  })
  useEffect(() => {
    if (!mobileDetailOpen) return undefined
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return
      // 이 패널 자신은 utils/overlayStack.js의 공유 스택에 올라가지
      // *않는다* — 올리면 그 파일의 SINGLE SCRIM 전제("스택 맨 아래만
      // scrim을 그린다")가 깨진다. 이 패널은 반투명 오버레이가 아니라
      // 완전히 불투명한 실제 페이지라서, 그 위에서 처음 여는 Dialog나
      // BottomSheet(FixedScheduleForm 등, z-50)도 평소처럼 자기 스크림을
      // 그려야 한다 — 이 패널이 스택 맨 아래를 차지해 버리면 그 모달이
      // "아래가 이미 어둡다"고 착각해 스크림을 생략한다(실제로는 아무도
      // 안 그린 상태가 된다).
      //
      // 그래서 스택이 "비어 있는지"만 본다 — 비어 있지 않다면 안쪽 Dialog/
      // BottomSheet가 이미 같은 keydown에 반응해(자기 자신의
      // isTopmostOverlay 체크로) 스스로 처리하므로 우리는 양보한다.
      //
      // Thomas 리뷰 Should-fix: 이 "양보"가 안전하려면 우리 핸들러가 안쪽
      // 모달의 핸들러보다 먼저 실행돼야 하는데, 둘 다 `document`에 등록된
      // bubble-phase 리스너라 그 순서는 "어느 쪽이 먼저 addEventListener
      // 됐는가"라는 암묵적 사실에 기대는 셈이었다(지금은 이 패널이 더 먼저
      // 마운트되어 우연히 안전하지만, 코드만 봐서는 보장되지 않는다). 그래서
      // 세 번째 인자로 `capture: true`를 줘 **capture 단계**에서 먼저
      // 가로챈다 — DOM 스펙상 모든 bubble-phase 리스너보다 반드시 먼저
      // 실행되는 건 attachment 순서가 아니라 phase 자체이므로, Dialog.jsx·
      // BottomSheet.jsx를 전혀 건드리지 않고도 순서를 코드로 보장할 수
      // 있다. `preventDefault`/`stopPropagation`을 호출하지 않으므로 안쪽
      // 모달의 bubble 리스너는 평소대로 이어서 실행된다 — 우리는 그저
      // "먼저 보고 더 할 일이 없으면 아무것도 안 한다".
      if (getOverlayStackSnapshot().length > 0) return
      handleBackRef.current()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [mobileDetailOpen])

  // `atHub`를 내려 보낸다 — SettingsNavList가 "지금 허브에서 상세로 들어가는
  // 클릭"과 "데스크톱 2단에서 상세→상세로 건너뛰는 클릭"을 구분해 NavLink의
  // `state`를 다르게 싣는다(그 파일 자신의 `fromHubState` 주석, 그리고 위
  // handleBack 주석 참고).
  const navList = <SettingsNavList onTutorialRestart={requestRestart} atHub={atHub} />

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
            `fixed`로 떠 있는 레이어라 폭을 나눠 가질 상대가 없다).

            `inert={mobileDetailOpen}` — 모바일에서 상세가 열려 있는 동안
            허브 리스트를 포커스/스크린리더에서 뺀다. 시각적으로는 상세가
            `fixed`로 완전히 덮지만 DOM상으론 둘 다 떠 있으므로, inert 없이는
            Tab이나 가상 커서가 가려진 허브 행으로 넘어갈 수 있다(아래
            useFocusTrap이 상세 쪽 Tab 순환을 가두는 것과 한 쌍 — 이 inert가
            허브 쪽을, 그 트랩이 상세 쪽 경계를 각각 책임진다). 데스크톱
            2단은 둘 다 항상 상호작용 가능해야 하므로 해당 없음.

            `ref={hubPaneRef}` — 허브로 돌아올 때 방금 보던 항목의 행을
            찾아 포커스하는 효과(위)가 쓰는 검색 범위다. */}
        <div
          ref={hubPaneRef}
          inert={mobileDetailOpen || undefined}
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
            would otherwise leave.

            `ref={panelRef}` is useFocusTrap's container (see that call
            above). `role`/`aria-modal`/`aria-labelledby`/`tabIndex` are only
            added while `mobileDetailOpen` — on desktop this pane is a
            same-page 2단 pane, not a modal, so it must NOT claim
            `role="dialog"` there (a screen reader would announce a
            non-dismissable "dialog" sitting right next to the list it's
            supposedly modal over). `aria-labelledby` points at the SAME
            literal id the focus effect above searches for — if the page is
            still showing its loading skeleton when this paints, the id
            simply doesn't resolve to anything yet; most screen readers
            re-resolve `aria-labelledby` once the element with that id shows
            up, so the name "catches up" the same way focus does. */}
        <div
          ref={panelRef}
          {...(mobileDetailOpen
            ? { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': DETAIL_TITLE_ID, tabIndex: -1 }
            : {})}
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
          {/* 모바일 전용 헤더 — 뒤로가기 버튼뿐이다(PR #82 AI 리뷰 Blocking
              fix: 예전엔 여기 h2로 제목을 또 그려서, 아래 contentPane 안의
              하위 페이지 자신의 h2와 제목이 두 번 보였다). 제목의 유일한
              출처는 이제 그 h2 하나뿐 — 이 헤더는 "[← 설정]"만 그려 허브로
              돌아간다는 목적만 전달한다. `sticky top-0`로 스크롤 중에도 항상
              맨 위에 고정한다(현재 구조에서 contentPane이 이미 별도로
              스크롤되므로 시각적으로는 이전과 같지만, 명시적으로 고정해
              둔다). 허브에 있을 때는 아예 렌더하지 않는다(어차피 전체가
              inert+화면 밖이다) — 이 조건이 아래 `contentPane`의 children
              배열 위치를 바꾸지 않는 것이 핵심이다(React가 조건식 자체를
              항상 같은 슬롯에 두므로 Outlet의 부모는 흔들리지 않는다). */}
          {mobileDetailOpen && (
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-surface p-3">
              <button
                type="button"
                onClick={handleBack}
                aria-label="설정 목록으로"
                className="flex h-11 items-center gap-1 rounded-control px-2 text-text-muted transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                <ChevronLeftIcon className="text-xl" />
                <span className="text-label font-medium">설정</span>
              </button>
            </div>
          )}
          {/* contentPane: Outlet의 실제 부모. 데스크톱/모바일 모두에서 항상
              이 자리, 이 타입(div)에 산다 — 위 헤더가 있다/없다로 바뀌는 건
              이 div "앞"의 형제뿐이라 Outlet 자신의 부모 Fiber 위치는 전혀
              흔들리지 않는다(셸 리마운트가 없다는 이 파일의 핵심 불변 조건).
              `contentPaneRef`는 위 focus 이펙트가 하위 페이지의
              `#settings-detail-title`을 찾는 관찰 범위다. */}
          <div
            ref={contentPaneRef}
            className={isDesktop ? 'p-4 md:p-6' : 'flex-1 overflow-y-auto p-4'}
          >
            <Outlet />
          </div>
        </div>
      </div>
      {tutorialDialog}
    </div>
  )
}

export default SettingsLayout
