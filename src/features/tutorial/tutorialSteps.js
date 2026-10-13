import { TUTORIAL_EVENTS } from './tutorialEvents'

/*
  TUT-03~08 step catalog. Each entry is deliberately data, not JSX:
  TutorialOverlay is the only place that reads this, so a copy/route/
  target/completion-rule change never touches the overlay's own
  navigation/event-wiring logic.

  RING-BASED REDESIGN (owner decision, 2026-10 — supersedes the GUIDED-
  ACTIONS auto-open redesign this file used to describe, kept below in
  spirit only where the reasoning still applies): the previous version had
  TutorialOverlay navigate into each step with a query param that auto-
  opened a form/panel for the user ("할 일 창을 자동으로 열어 주는 것"). The
  owner's own dev-testing of that design concluded it should go — a user
  who never has to find the real control themselves never learns where it
  is, and the auto-open timing itself proved to intermittently miss. Every
  step now instead points Coachmark's ring at a REAL, already-visible
  control (`targetId`) and tells the user to click/drag it; nothing here
  ever calls `navigate()` with a request param anymore (TutorialOverlay's
  OWN header explains the one exception — entering PLACE_TASK still
  auto-navigates the ROUTE itself, /projects → /weekly, since there is no
  on-screen "go to weekly" control this flow points at).

  Each entry carries:
    - `route` — which pathname this step expects to be shown on
      (TutorialOverlay's own OFF-ROUTE prompt compares this against the
      CURRENT location; see that file's header).
    - `targetId` — a STATIC `data-tut-id` string, or a FUNCTION of
      `targets` for a per-run dynamic anchor (e.g. PLACE_TASK's own sample
      task card). `null` for a step with no single control to ring (ADD_
      SCHEDULE's own target is a per-cell right-click menu, DELETE_SAMPLE's
      is the block action menu — both transient, not a single always-
      mounted element).
    - `title`/`body` — EITHER directly on the step (no sub-steps), or on
      each entry of `subSteps` (see ADD_TASK/PLACE_TASK below) when the
      SAME completion rule spans more than one on-screen action worth
      calling out separately ("2-1"/"2-2" — owner decision, 2026-10).
      `body` may be a FUNCTION of `(targets, weekBlocks)` (DELETE_SAMPLE
      only) returning either a plain string or a checklist DATA object —
      see that step's own comment.
    - `subSteps` (optional) + `subStepIndex(targets, uiState)` — which of
      `subSteps` is CURRENTLY active, decided by real ON-SCREEN STATE, not
      a separate event (owner decision, 2026-10: "하위 단계 전환은 UI
      상태로 판정한다"). `uiState` is TutorialOverlay's own small bundle of
      cross-component signals it already has to read for OTHER reasons
      (`expandedProjectId` from the `?expanded=` URL param ProjectsPage's
      own accordion already keeps there; `unplacedPanelOpen` from
      activeWeekStore.js, since WeeklyPage's own panel-open state has no
      URL reflection at all — see that module's own header).
    - `event` / `matches(payload, targets)` / `captureTarget(payload)` —
      the COMPLETION rule, UNCHANGED in shape and reasoning from the prior
      redesign (owner decision, 2026-10: "진행 판정은 지금처럼 이벤트와
      상태 기반을 유지한다") — completely INDEPENDENT of `subSteps`, which
      only decide what to SHOW, never when to ADVANCE. `event` names which
      tutorialEvents.js event type counts; `matches` narrows it to the ONE
      instance this run actually cares about; `captureTarget` is what gets
      merged into the targets this run remembers for the NEXT step's own
      `matches`/anchor/body. DELETE_SAMPLE does not use this trio — its
      rule needs to track TWO ids clearing independently, which doesn't fit
      this single-event shape, so TutorialOverlay special-cases it
      directly (see that file).

  PROGRESS NUMBERING — 5 main steps, not 6: COMPLETE (TUT-08) is
  deliberately not one of them — it is a terminal "you're done" screen with
  nothing to click toward, not a 6th thing-to-do. The label TutorialOverlay
  shows never carries this "5" as a visible denominator ("2-1", not
  "2-1/5" — owner's own later feedback, 2026-10, dropped the fraction an
  earlier pass had shown) — see that file's own `progressLabel` comment.
*/
export const TUTORIAL_STEPS = [
  {
    key: 'CREATE_PROJECT', // TUT-03, "1"
    route: '/projects',
    targetId: 'tut-create-project',
    title: '샘플 프로젝트를 만들어 보세요',
    body: '[+ 새 프로젝트]를 눌러 샘플 프로젝트를 만들어 보세요.',
    event: TUTORIAL_EVENTS.PROJECT_CREATED,
    // Nothing prior to compare against — this is the first sample this run
    // creates, so any project creation while this step is active counts.
    matches: () => true,
    captureTarget: (payload) => ({ projectId: payload.projectId }),
  },
  {
    key: 'ADD_TASK', // TUT-04, "2"
    route: '/projects',
    event: TUTORIAL_EVENTS.TASK_CREATED,
    // `!targets.projectId` (stale/pre-redesign cursor with no recorded id,
    // §7 판단) falls back to "any task creation counts" rather than blocking
    // forever on an id this run never captured — see TutorialOverlay's own
    // header for why this degrades gracefully instead of guessing a
    // substitute project.
    matches: (payload, targets) => !targets.projectId || payload.projectId === targets.projectId,
    captureTarget: (payload) => ({ taskId: payload.taskId }),
    // 2-1 → 2-2 판정: 그 프로젝트 행이 펼쳐졌는가. `?expanded=` URL
    // param으로 읽는다 — ProjectsPage의 toggleExpand/expandInProgress가
    // 이미 이 param 하나로 "어느 행이 열려 있는가"를 전부 표현하므로(그
    // 화면 자신의 헤더 주석), 패널-오픈 전용 저장소를 새로 만들 필요가 없다.
    subStepIndex: (targets, uiState) => (uiState.expandedProjectId === targets.projectId ? 1 : 0),
    subSteps: [
      {
        targetId: (targets) => (targets.projectId ? `tut-project-row-${targets.projectId}` : null),
        title: '태스크를 추가해 보세요',
        body: '방금 만든 프로젝트를 펼치고 태스크 추가를 눌러보세요.',
      },
      {
        // ProjectExpandedPanel의 "+ 태스크 추가" 버튼(태스크가 이미 있을
        // 때)과 TaskStructuringDraft의 빈 상태 "태스크 직접 추가" 버튼(샘플
        // 프로젝트는 항상 0개로 시작하므로 실제로 보이는 쪽) 둘 다 같은 id를
        // 공유한다 — Coachmark의 "보이는 쪽만 고른다" 로직이 그중 실제로
        // 마운트된 하나를 찾는다(두 파일 자신의 주석 참고).
        targetId: 'tut-add-task',
        title: '태스크를 추가해 보세요',
        body: '[+ 태스크 추가]를 눌러 태스크를 만들어 보세요.',
      },
    ],
  },
  {
    key: 'PLACE_TASK', // TUT-05, "3"
    route: '/weekly',
    event: TUTORIAL_EVENTS.TASK_PLACED,
    matches: (payload, targets) => !targets.taskId || payload.taskId === targets.taskId,
    // `placedBlockId` — kept for backward-compat with an in-flight §7 stale
    // cursor, but no longer the thing DELETE_SAMPLE highlights by (owner
    // report, 2026-10: "자동 배치나 실행 취소 후 새 id인 경우에는 강조되지
    // 않을 수 있다" — TutorialOverlay.jsx's own highlight-recompute effect
    // now looks up the LIVE block by `targets.taskId` every time instead,
    // which survives exactly those two cases). `taskTitle` — DELETE_SAMPLE's
    // checklist body (below) needs a title that SURVIVES the block being
    // fully removed (weekPlan has nothing left to read it off at that
    // point); captured here from the event payload (`usePlaceTask`/
    // `useApplyAutoPlace`, see tutorialEvents.js header) while a live block
    // still exists to have taken it from.
    captureTarget: (payload) => ({ placedBlockId: payload.planBlockId ?? null, taskTitle: payload.title ?? null }),
    // 3-1 → 3-2 판정: 미배치 패널이 열렸는가. `panelOpen`은 WeeklyPage의
    // 순수 로컬 state라 URL에 안 남는다 — activeWeekStore.js가 발행하는
    // 값을 읽는다(그 모듈 자신의 헤더).
    subStepIndex: (targets, uiState) => (uiState.unplacedPanelOpen ? 1 : 0),
    subSteps: [
      {
        targetId: 'tut-unplaced-toggle',
        title: '태스크를 캘린더에 배치해 보세요',
        body: '[미배치] 버튼을 눌러 패널을 열어보세요.',
      },
      {
        // UnplacedTaskCard 자신의 고정 id (per-run) — 패널이 열리면 그 안의
        // 샘플 태스크 카드를 직접 가리킨다.
        targetId: (targets) => (targets.taskId ? `tut-unplaced-task-${targets.taskId}` : null),
        title: '태스크를 캘린더에 배치해 보세요',
        body: '캘린더 빈 칸으로 끌어다 놓으세요(휴대폰은 길게 누른 뒤 끌기).',
      },
    ],
  },
  {
    key: 'ADD_SCHEDULE', // TUT-06, "4"
    route: '/weekly',
    // 전용 UI 컨트롤이 없다(캘린더 빈 칸 우클릭/길게 누르기 메뉴는 transient
    // — 늘 마운트돼 있는 단일 엘리먼트가 아니다) — targetId 없음, 링 없이
    // 안내 패널만 뜬다(Coachmark의 "un-anchored" 모양).
    targetId: null,
    title: '일정을 추가해 보세요',
    // "자동으로 열리고/채워집니다" 뉘앙스 전부 제거(owner decision,
    // 2026-10) — 이제 폼도 안 열고 빈 시간도 안 채운다. TutorialOverlay의
    // 4단계 전용 findFirstFreeSlot 호출/addSchedule 요청도 함께 제거됐다
    // (WeeklyPage.jsx 자신의 주석 참고) — quickPlace가 쓰는 고정일정 점유
    // 반영(S3)은 이 제거와 무관하게 그대로 유지된다.
    body: '추가하고 싶은 요일의 빈 공간을 우클릭(휴대폰은 길게 누르기)해 일정을 추가해 보세요.',
    event: TUTORIAL_EVENTS.SCHEDULE_CREATED,
    matches: () => true,
    // `scheduleBlockId` kept for backward-compat (see PLACE_TASK's own
    // identical note above on why DELETE_SAMPLE's highlight no longer reads
    // it directly). `scheduleId` is the actual completion key (B1 fix) —
    // see TutorialOverlay.jsx's header for why a `planBlockId` alone can't
    // survive an undo-recreate. `scheduleTitle` — same reasoning as
    // PLACE_TASK's `taskTitle` above, captured from the event payload
    // (`useCreateScheduleBlock`, see tutorialEvents.js header).
    captureTarget: (payload) => ({
      scheduleBlockId: payload.planBlockId ?? null,
      scheduleId: payload.scheduleId ?? null,
      scheduleTitle: payload.title ?? null,
    }),
  },
  {
    key: 'DELETE_SAMPLE', // TUT-07, "5"
    route: '/weekly',
    // No `highlightBlocks` request here — TutorialOverlay.jsx's own
    // dedicated effect looks up whichever block CURRENTLY carries
    // `targets.taskId`/`targets.scheduleId` every time the week's own
    // block list changes, and sends `highlightBlocks` itself (the same
    // WeeklyPage PLAN-23 focus-ring mechanism every other owner-report
    // iteration of this step has used) — this step needs nothing here.
    targetId: null,
    title: '연습으로 만든 블록을 정리해 보세요',
    /*
      A FUNCTION returning a DATA object (`{ checklist, footer }`), not a
      plain string like every other step's `body` — Coachmark.jsx's own
      render sites turn that shape into the actual `<ul>`/`<li>` JSX (see
      its own `renderBody`/`TutorialChecklist` helpers); kept as data here,
      not JSX, so this file stays a plain `.js` module (no Fast-Refresh
      component-boundary rule to satisfy — `react-refresh/only-export-
      components` flags a `.jsx` file that exports non-component values
      like `TUTORIAL_STEPS`).

      PROGRESS CHECKLIST, computed from the CURRENT weekPlan state
      (`weekBlocks`, TutorialOverlay's own `weekPlanQuery`), not a static
      claim about what happened once:
        ① names BOTH items that must clear, with a LIVE count ("남은 N개")
           for a TASK that may be SPLIT across several placements (A4) —
           never just "a block" singular.
        ② never claims "강조됩니다" unconditionally — the highlight can
           miss nothing now (see this step's own `buildSearch`-removal note
           above), but the copy still only describes what to click via the
           menu, not a guarantee about the ring.
        ③ no longer ends with "모두 정리하면 자동으로 다음 단계로
           넘어갑니다" (owner decision, 2026-10, this redesign) — [다시
           열기] is gone everywhere else in this run too, and advancing
           still happens automatically either way; the line was dropped as
           part of the same "stop narrating automatic behavior" pass as
           every other step's own auto-nuance removal.

      Each item's own `done`/`label` is exactly PasswordChecklist.jsx's own
      checklist shape (an icon that changes SHAPE not just color — NFR-017
      — plus `sr-only` text carrying "정리됨"/"남음" so a screen reader gets
      the SAME information a sighted user reads off the icon) — Coachmark.jsx
      renders it, this file just supplies the data.
    */
    body: (targets, weekBlocks) => {
      const items = []
      if (targets.taskId) {
        const remaining = (weekBlocks ?? []).filter((b) => b.taskId === targets.taskId)
        const title = remaining[0]?.title ?? targets.taskTitle ?? '태스크'
        items.push({
          done: remaining.length === 0,
          label:
            remaining.length > 0
              ? `「${title}」 블록 [배치 해제] — 남은 ${remaining.length}개`
              : `「${title}」 정리됨`,
        })
      }
      if (targets.scheduleId) {
        const remaining = (weekBlocks ?? []).filter((b) => b.scheduleId === targets.scheduleId)
        const title = remaining[0]?.title ?? targets.scheduleTitle ?? '일정'
        items.push({
          done: remaining.length === 0,
          label: remaining.length > 0 ? `「${title}」 [일정 삭제]` : `「${title}」 정리됨`,
        })
      }
      if (items.length === 0) {
        // 둘 다 기록이 없다(§7 스테일 커서) — 체크할 대상이 없으므로 기능
        // 설명만 한다 (TutorialOverlay의 bypass 규칙과 짝을 이룬다).
        return '캘린더의 블록에서 메뉴를 열어(우클릭, 휴대폰은 길게 누르기) 태스크는 [배치 해제]로, 일정은 [일정 삭제]로 정리할 수 있습니다.'
      }
      return {
        checklist: items,
        footer: '메뉴는 우클릭(휴대폰은 길게 누르기)으로 엽니다.',
      }
    },
    // TutorialOverlay 특수 분기 전용 — 이 다섯 단계와 같은 단일 event/matches
    // 모양이 아니라 상태 기반 규칙이다("이 run이 기록한 taskId/scheduleId가
    // 전부 현재 weekPlan 캐시에서 사라졌는가"). 그 이유(이벤트 로그 누적 방식을
    // 버린 이유 포함)는 TutorialOverlay.jsx 헤더.
  },
  {
    key: 'COMPLETE', // TUT-08, 번호 없음(진행 분모 밖) — 이 파일 자신의 헤더
    route: '/weekly',
    targetId: null,
    title: '튜토리얼을 완료했습니다',
    body: '핵심 조작 흐름을 모두 실습했습니다. 이제 실제 프로젝트와 계획을 자유롭게 만들어 보세요.',
  },
]

export default TUTORIAL_STEPS
