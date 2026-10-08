/*
  TUT-03~08 step catalog — the "n/6" the coachmark counts against. Each entry
  is deliberately data, not JSX: TutorialOverlay is the only place that reads
  this, so a copy/route/target change never touches the overlay's own logic.

  `targetId` matches a `data-tut-id` attribute placed on a REAL button in the
  REAL screen (ProjectsPage/ProjectExpandedPanel) — the whole point of AC3
  ("실기능 재사용, 모의 화면 금지"): the coachmark highlights the actual control,
  the user performs the actual action, and the coachmark's own [다음] only
  advances the TUTORIAL's bookkeeping (self-paced, not auto-detected — see
  TutorialOverlay's own header for why).

  [한계] TUT-06/07 (일정 추가·삭제) have `targetId: null` — those actions are
  reached via the weekly grid's own dynamic right-click/drag interactions
  (per-cell context menus, drag handles), not a single static, always-mounted
  element WeeklyPage renders regardless of state. Anchoring precisely there
  would mean adding tutorial-specific hooks into that file's already-complex,
  actively-owned drag/menu logic — out of scope for this pass. These two steps
  fall back to Coachmark's un-anchored "instruction bubble" shape instead of a
  highlighted element (see Coachmark.jsx).
*/
export const TUTORIAL_STEPS = [
  {
    key: 'CREATE_PROJECT', // TUT-03
    route: '/projects',
    targetId: 'tut-create-project',
    title: '샘플 프로젝트를 만들어 보세요',
    body: '위 [+ 새 프로젝트] 버튼을 눌러 이름을 입력하고 저장하세요.',
  },
  {
    key: 'ADD_TASK', // TUT-04
    route: '/projects',
    targetId: 'tut-add-task',
    title: '태스크를 추가해 보세요',
    body: '방금 만든 프로젝트를 펼친 뒤 [+ 태스크 추가]로 제목과 예상 시간을 입력해 저장하세요.',
  },
  {
    key: 'PLACE_TASK', // TUT-05
    route: '/projects',
    targetId: 'tut-goto-weekly',
    title: '태스크를 캘린더에 배치해 보세요',
    body: '[이 프로젝트로 주간 계획] 버튼으로 이동한 뒤, 미배치 패널의 태스크를 캘린더 칸으로 드래그하세요.',
  },
  {
    key: 'ADD_SCHEDULE', // TUT-06
    route: '/weekly',
    targetId: null,
    /*
      "모바일은 길게 누르기" — 2026-10 1차 수정에서 "이 체크아웃엔 터치
      롱프레스 JS 핸들러가 없다"를 근거로 뺐었는데, 전제가 틀렸다(Thomas
      리뷰 SHOULD-FIX). CalendarGrid의 빈 칸 `onContextMenu`는 데스크톱
      우클릭만 받는 게 아니다 — Android Chrome은 터치를 길게 누르면 별도
      JS 구현 없이도 자체적으로 네이티브 `contextmenu` DOM 이벤트를
      발생시키므로, 같은 핸들러가 그대로 받는다. 이 앱의 출시 대상이
      Android TWA이므로 이게 실제 동작 경로다. iOS Safari는 길게 눌러도
      `contextmenu`를 쏘지 않아 이 문구가 보장하진 않는다. PR #68이 도입할
      예정인 별도의 커스텀 롱프레스 처리와는 무관한, 이미 동작하는
      브라우저 네이티브 경로다 — 혼동하지 말 것.
    */
    title: '프로젝트와 무관한 일정을 추가해 보세요',
    body: '캘린더의 빈 칸을 우클릭(휴대폰은 길게 누르기)해 일정 추가를 선택하고 제목과 시간을 입력하세요.',
  },
  {
    key: 'DELETE_SAMPLE', // TUT-07
    route: '/weekly',
    targetId: null,
    /*
      "각각 메뉴에서 삭제"는 실제 메뉴 라벨과 어긋났다(2026-10 수정) —
      WeeklyPage.jsx의 menuItemsFor: SCHEDULE 블록은 실제로 "일정 삭제"지만
      TASK 블록의 메뉴는 "배치 해제"다("삭제"라는 단어 자체가 없다). 둘을
      뭉뚱그려 "삭제"라고 하면 태스크 블록 메뉴를 보고 사용자가 헤맨다.

      이 메뉴를 여는 길(PlanBlock의 onContextMenu)도 ADD_SCHEDULE과 같은
      이유로 휴대폰(Android TWA)에서 길게 누르기로 열린다 — 위 주석 참고.
      iOS Safari는 보장 대상이 아니다.
    */
    title: '연습으로 만든 블록을 정리해 보세요',
    body: '방금 배치한 태스크는 메뉴의 [배치 해제]로, 일정은 [일정 삭제]로 정리해 보세요.',
  },
  {
    key: 'COMPLETE', // TUT-08
    route: '/weekly',
    targetId: null,
    title: '튜토리얼을 완료했습니다',
    body: '핵심 조작 흐름을 모두 실습했습니다. 이제 실제 프로젝트와 계획을 자유롭게 만들어 보세요.',
  },
]

export default TUTORIAL_STEPS
