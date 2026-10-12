import { TUTORIAL_EVENTS } from './tutorialEvents'

/*
  TUT-03~08 step catalog — the "n/6" the coachmark counts against. Each entry
  is deliberately data, not JSX: TutorialOverlay is the only place that reads
  this, so a copy/route/target/completion-rule change never touches the
  overlay's own navigation/event-wiring logic.

  GUIDED-ACTIONS REDESIGN (owner-approved, 2026-10): a step used to be purely
  self-paced — [다음] advanced regardless of whether the user had actually
  done anything (see this file's OLD header, kept below in spirit by
  TutorialOverlay's own comment). Every step below now also carries:

    - `buildSearch(targets, nonce)` — the "open the real UI for me" request,
      encoded as a query string TutorialOverlay appends when it navigates
      into this step (e.g. `create=3` on /projects). This reuses the SAME
      query-param idiom this codebase already uses for every other
      screen-to-screen open request (ProjectsPage's `?create=1`, WeeklyPage's
      `?openUnplaced=1`/`?project=`/`?openReplan=1`) rather than inventing a
      second, parallel "request channel" — the receiving screen owns
      reading/opening/stripping its own param exactly like those existing
      seams already do, so this file and TutorialOverlay never reach into a
      screen's internal state directly (§4 "화면이 소유한 상태를 직접
      건드리지 말고… URL search param" — the codebase already leans this
      way, so it's the consistent choice, not a new convention). `targets`
      fills in the pieces that depend on what THIS run already created —
      e.g. step 2 needs to open the SPECIFIC project step 1 just made, not
      any project.

      `nonce` (owner report, 2026-10: "할 일 창이 자동으로 열릴 때도 있고 안
      열릴 때도 있다") — a counter TutorialOverlay increments on every REAL
      navigation (the initial auto-open AND every [다시 열기] click), threaded
      into the "boolean trigger" params below (`create`/`addTask`/
      `openUnplaced`/`addSchedule` — each previously hardcoded to the literal
      `'1'`). Two DIFFERENT real requests computing the SAME literal value
      meant react-router sometimes saw NO location change at all (navigating
      to a URL identical to the current one is a no-op — nothing for
      useSearchParamRequest to react to), most reproducible on [다시 열기]
      or re-entering a step the user had already visited. A monotonic nonce
      makes every REAL request's own URL distinct from the one before it, by
      construction, regardless of which exact timing window caused a given
      occurrence — see TutorialOverlay.jsx's own `requestNonceRef` and
      useSearchParamRequest.js's own widened `isMatch` default (now "any
      non-empty string", not just `'1'`) this relies on. `project`/
      `highlightBlocks` below are UNCHANGED — their own values are already
      real per-run DATA (a project id, a list of block ids), not a fixed
      literal, so the same collision class barely applies to them and they
      keep reading cleanly as "the thing being pointed at" rather than
      growing an unrelated counter suffix.
    - `targetId` — unchanged shape for a static anchor (TUT-03/04's buttons),
      but may also be a FUNCTION of `targets` for a step whose anchor is a
      per-run, dynamically created element (TUT-05's own unplaced-task card
      carries `data-tut-id="tut-unplaced-task-{taskId}"` — see
      UnplacedTaskCard.jsx) rather than a fixed id shared by every run.
    - `event` / `matches(payload, targets)` / `captureTarget(payload)` — the
      completion rule. `event` names which tutorialEvents.js event type
      counts; `matches` narrows it to the ONE instance this run actually
      cares about (so, say, creating a SECOND unrelated project while on
      step 1 can't accidentally satisfy step 2's "a task was added to MY
      sample project"); `captureTarget` is what gets merged into the
      targets this run remembers for the NEXT step's own `matches`.
      DELETE_SAMPLE (TUT-07) does not use this trio — its rule needs to track
      TWO ids clearing independently, which doesn't fit this single-event
      shape, so TutorialOverlay special-cases it directly (see that file).
  No more `nextDisabledReason` field (owner decision, 2026-10, removed
  [이전]/[다음] entirely — see TutorialOverlay.jsx's own header). Each step's
  `body` already states what to do ("새 프로젝트 폼이 자동으로 열립니다.
  이름을 입력하고 저장하세요.", etc.) in the SAME words the old gate caption
  used to repeat next to a now-nonexistent disabled button — nothing to fold
  in that wasn't already there.

  `targetId` matches a `data-tut-id` attribute placed on a REAL button in the
  REAL screen — the whole point of AC3 ("실기능 재사용, 모의 화면 금지"): the
  coachmark highlights the actual control, the user performs the actual
  action, and now the overlay ALSO detects that action's own success event
  instead of only trusting a manual [다음].

  [한계] TUT-06/07 (일정 추가·삭제) keep `targetId: null` — the real controls
  they describe (CalendarGrid's per-cell right-click/long-press menu, and the
  block action menu) are transient, not a single static always-mounted
  element. TUT-06's form auto-opens anyway (see `buildSearch`), so the
  un-anchored fallback only matters for the brief moment before/after that
  modal is open; TUT-07 instead gets a REAL highlight via WeeklyPage's own
  existing PLAN-23 focus-ring mechanism (`?highlightBlocks=`, see WeeklyPage's
  own comment on that param) rather than Coachmark's ring — a second,
  already-built "point at a specific block" feature this redesign reuses
  instead of teaching Coachmark a new per-block anchor it would need anyway
  only for this one step.
*/
export const TUTORIAL_STEPS = [
  {
    key: 'CREATE_PROJECT', // TUT-03
    route: '/projects',
    buildSearch: (targets, nonce) => `create=${nonce}`,
    targetId: 'tut-create-project',
    title: '샘플 프로젝트를 만들어 보세요',
    body: '새 프로젝트 폼이 자동으로 열립니다. 이름을 입력하고 저장하세요.',
    event: TUTORIAL_EVENTS.PROJECT_CREATED,
    // Nothing prior to compare against — this is the first sample this run
    // creates, so any project creation while this step is active counts.
    matches: () => true,
    captureTarget: (payload) => ({ projectId: payload.projectId }),
  },
  {
    key: 'ADD_TASK', // TUT-04
    route: '/projects',
    buildSearch: (targets, nonce) => (targets.projectId ? `expanded=${targets.projectId}&addTask=${nonce}` : ''),
    targetId: 'tut-add-task',
    title: '태스크를 추가해 보세요',
    body: '방금 만든 프로젝트가 펼쳐지고 태스크 추가 폼이 열립니다. 제목과 예상 시간을 입력해 저장하세요.',
    event: TUTORIAL_EVENTS.TASK_CREATED,
    // `!targets.projectId` (stale/pre-redesign cursor with no recorded id,
    // §7 판단) falls back to "any task creation counts" rather than blocking
    // forever on an id this run never captured — see TutorialOverlay's own
    // header for why this degrades gracefully instead of guessing a
    // substitute project.
    matches: (payload, targets) => !targets.projectId || payload.projectId === targets.projectId,
    captureTarget: (payload) => ({ taskId: payload.taskId }),
  },
  {
    key: 'PLACE_TASK', // TUT-05
    route: '/weekly',
    // Reuses WeeklyPage's EXISTING `?project=`/`?openUnplaced=1` seam
    // (PROJ-15/19) verbatim — the panel opens pre-filtered to the sample
    // project, which in practice already narrows it to the one task this run
    // made. The actual visual highlight comes from `targetId` below, not a
    // query param — see UnplacedTaskCard's own `data-tut-id`.
    buildSearch: (targets, nonce) =>
      [targets.projectId ? `project=${targets.projectId}` : null, `openUnplaced=${nonce}`].filter(Boolean).join('&'),
    targetId: (targets) => (targets.taskId ? `tut-unplaced-task-${targets.taskId}` : null),
    title: '태스크를 캘린더에 배치해 보세요',
    body: '미배치 패널이 열리고 방금 만든 태스크가 강조됩니다. 캘린더 칸으로 드래그하세요. (휴대폰도 카드를 눌러 끌 수 있습니다. 카드에 포커스한 뒤 Enter로도 빈 시간에 바로 배치할 수 있습니다 — 전용 버튼은 없고 이 키보드 동작이 "빠른 배치"입니다.)',
    event: TUTORIAL_EVENTS.TASK_PLACED,
    matches: (payload, targets) => !targets.taskId || payload.taskId === targets.taskId,
    // `placedBlockId` only feeds DELETE_SAMPLE's cosmetic `highlightBlocks`
    // hint (buildSearch below on that step) — it can be null on the
    // auto-place path (tutorialEvents.js header) without weakening TUT-07's
    // actual completion check, which keys off `targets.taskId` (captured at
    // ADD_TASK, unaffected by which placement path was used — B1/S4 fix,
    // TutorialOverlay.jsx header) rather than this block id.
    captureTarget: (payload) => ({ placedBlockId: payload.planBlockId ?? null }),
  },
  {
    key: 'ADD_SCHEDULE', // TUT-06
    route: '/weekly',
    buildSearch: (targets, nonce) => `addSchedule=${nonce}`,
    targetId: null,
    title: '프로젝트와 무관한 일정을 추가해 보세요',
    body: '일정 추가 폼이 자동으로 열리고, 이번 주 비어 있는 시간대가 미리 채워집니다. 제목을 확인하고 저장해 보세요.',
    event: TUTORIAL_EVENTS.SCHEDULE_CREATED,
    matches: () => true,
    // `scheduleBlockId` keeps feeding DELETE_SAMPLE's `highlightBlocks`
    // request below (a point-at-this-block hint, cosmetic). `scheduleId` is
    // the actual completion key (B1 fix) — see TutorialOverlay.jsx's header
    // for why a `planBlockId` alone can't survive an undo-recreate.
    captureTarget: (payload) => ({ scheduleBlockId: payload.planBlockId ?? null, scheduleId: payload.scheduleId ?? null }),
  },
  {
    key: 'DELETE_SAMPLE', // TUT-07
    route: '/weekly',
    // WeeklyPage reads this once and fires its OWN existing PLAN-23 focus-ring
    // (the same highlight "검토 항목 선택"/"블록 클릭" already use) at
    // whichever of these two ids is still present in the current week's
    // blocks — see that file's own comment on `highlightBlocks`. Cosmetic
    // only: the actual completion judgment (TutorialOverlay.jsx) keys off
    // `targets.taskId`/`targets.scheduleId` instead, not these block ids.
    buildSearch: (targets) => {
      const ids = [targets.placedBlockId, targets.scheduleBlockId].filter(Boolean)
      return ids.length > 0 ? `highlightBlocks=${ids.join(',')}` : ''
    },
    targetId: null,
    title: '연습으로 만든 블록을 정리해 보세요',
    // A FUNCTION (like `targetId`/`buildSearch` above), not a static string —
    // Thomas code review SHOULD-FIX: the copy must name only what this run
    // actually recorded (a stale §7 cursor may be missing one of the two, or
    // even both), not always claim "태스크는... 일정은..." regardless.
    body: (targets) => {
      const hasTask = Boolean(targets.taskId)
      const hasSchedule = Boolean(targets.scheduleId)
      if (hasTask && hasSchedule) {
        return '방금 만든 블록이 캘린더에서 강조됩니다. 메뉴를 열어(우클릭, 휴대폰은 길게 누르기) 태스크는 [배치 해제]로, 일정은 [일정 삭제]로 정리해 보세요.'
      }
      if (hasTask) {
        return '방금 배치한 태스크 블록이 캘린더에서 강조됩니다. 메뉴를 열어(우클릭, 휴대폰은 길게 누르기) [배치 해제]로 정리해 보세요.'
      }
      if (hasSchedule) {
        return '방금 만든 일정 블록이 캘린더에서 강조됩니다. 메뉴를 열어(우클릭, 휴대폰은 길게 누르기) [일정 삭제]로 정리해 보세요.'
      }
      // 둘 다 기록이 없다(§7 스테일 커서) — 가리킬 블록이 없으므로 기능
      // 설명만 한다 (TutorialOverlay의 bypass 규칙과 짝을 이룬다).
      return '캘린더의 블록에서 메뉴를 열어(우클릭, 휴대폰은 길게 누르기) 태스크는 [배치 해제]로, 일정은 [일정 삭제]로 정리할 수 있습니다.'
    },
    // TutorialOverlay 특수 분기 전용 — 이 다섯 단계와 같은 단일 event/matches
    // 모양이 아니라 상태 기반 규칙이다("이 run이 기록한 taskId/scheduleId가
    // 전부 현재 weekPlan 캐시에서 사라졌는가"). 그 이유(이벤트 로그 누적 방식을
    // 버린 이유 포함)는 TutorialOverlay.jsx 헤더.
  },
  {
    key: 'COMPLETE', // TUT-08
    route: '/weekly',
    buildSearch: () => '',
    targetId: null,
    title: '튜토리얼을 완료했습니다',
    body: '핵심 조작 흐름을 모두 실습했습니다. 이제 실제 프로젝트와 계획을 자유롭게 만들어 보세요.',
  },
]

export default TUTORIAL_STEPS
