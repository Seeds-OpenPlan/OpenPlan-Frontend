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
    title: '프로젝트와 무관한 일정을 추가해 보세요',
    body: '캘린더의 빈 칸을 우클릭(모바일은 길게 누르기)해 일정 추가를 선택하고 제목과 시간을 입력하세요.',
  },
  {
    key: 'DELETE_SAMPLE', // TUT-07
    route: '/weekly',
    targetId: null,
    title: '연습으로 만든 블록을 정리해 보세요',
    body: '방금 배치한 태스크와 일정 블록을 각각 메뉴에서 삭제해 보세요.',
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
