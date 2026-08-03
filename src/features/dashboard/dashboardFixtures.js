/*
  DEV-only mock for GET /dashboard (OP-DASH-ASSEMBLE). The real backend still
  exposes five separate endpoints (07번 API CSV: weekly-status · todo-items ·
  risk-solutions · today-execution · weekly-impact) — ui-spec §DASH adopts a
  single assembled call as the FE contract pending a real BE-1 endpoint, so this
  file stands in for that assembly, shaped to the ui-spec §DASH data-key table
  (NOT the five raw CSV bodies). Same dev-fallback convention as planFixtures.js:
  only ever reached in DEV, only on a network error (dashboardApi.js).

  Numbers below intentionally mirror the Desktop.Dashboard.png reference (6시간
  30분/45시간 · 14% · 자료구조 53% 등) so a fresh checkout renders the exact
  screen the design was reviewed against.
*/

const MOCK_LATENCY_MS = 120
const delay = (ms = MOCK_LATENCY_MS) => new Promise((resolve) => setTimeout(resolve, ms))

// Today's date at a fixed hour, for the S3 today-execution rows — real hours so
// ExecutionLogForm's duration math (endAt - startAt) behaves normally regardless
// of what day this mock happens to run on.
function todayAt(hour, minute = 0) {
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

function addMinutesISO(iso, minutes) {
  return new Date(new Date(iso).getTime() + minutes * 60000).toISOString()
}

export async function mockDashboard() {
  await delay()
  const task1Start = todayAt(9)
  const task2Start = todayAt(11)
  const task3Start = todayAt(14)

  return {
    planStatus: 'DRAFT',
    isEmpty: false,

    weeklyStatus: {
      status: 'OK',
      plannedMinutes: 390, // 6시간 30분
      availableMinutes: 2700, // 45시간
      focusWindow: '09:00–18:00',
      adjustDays: [], // 이번 주는 손 볼 요일 없음
    },

    // r2: 기준 카드가 삭제되면서 "고정일정 충돌 n건"의 유일한 노출점이 risks의
    // 고정 일정 충돌 행이 됐다(ui-spec-dash.md §DASH.5 "확인 필요→BE" 항목).
    // 이 mock은 그 요구를 그대로 반영해 같은 `id`를 risks 배열에도 등록해
    // 둔다 — RiskList의 dedup 경로(같은 id면 그 행에 강조만 얹고 중복 추가
    // 안 함)가 실제로 타는 데이터.
    priorityAction: {
      id: 'risk-fixed-conflict',
      // W3: violationMessages.js's own catalog re-keyed 'V2' → 'V2_FIXED_CONFLICT'
      // (real server ruleId, see that file's own header) — this code must stay
      // in sync with it, or dashboardIssueCopy.resolveIssueCopy's own
      // `violationCatalog[issue.code]` lookup silently misses and this card
      // falls back to raw server text it was never given (empty label/message).
      code: 'V2_FIXED_CONFLICT',
      severity: 'blocking',
      params: { blockTitle: '회의', otherTitle: '스터디', timeRange: '화요일 14:00–15:00' },
      actionType: 'FIXED_CONFLICT_RESOLVE',
      actionParams: {},
    },

    todayExecution: {
      dateLabel: '5월 6일 화요일',
      expectedMinutes: 210, // 예상 3시간 30분
      remainingAvailableMinutes: 240, // 남은 가용 4시간
      items: [
        {
          id: 'exec-1',
          timeLabel: '09:00',
          title: '자료 조사',
          type: 'TASK',
          expectedMinutes: 60,
          isTop: true, // RB-DASH-02 선정 결과 = "오늘 먼저"
          completed: false,
          taskId: 'task-201',
          startAt: task1Start,
          endAt: addMinutesISO(task1Start, 60),
        },
        {
          id: 'exec-2',
          timeLabel: '11:00',
          title: '스터디',
          type: 'SCHEDULE',
          expectedMinutes: 60,
          isTop: false,
          completed: false,
          startAt: task2Start,
          endAt: addMinutesISO(task2Start, 60),
        },
        {
          id: 'exec-3',
          timeLabel: '14:00',
          title: '요약 정리',
          type: 'TASK',
          expectedMinutes: 30,
          isTop: false,
          completed: true,
          taskId: 'task-202',
          startAt: task3Start,
          endAt: addMinutesISO(task3Start, 30),
        },
      ],
    },

    weeklyImpact: {
      projects: [
        {
          projectId: 'proj-1',
          name: '자료구조',
          adjustCount: 2,
          investedMinutes: 205, // 3시간 25분
          availablePercent: 8,
          unplacedCount: 1,
          sharePercent: 53,
        },
        {
          projectId: 'proj-2',
          name: '취업 준비',
          adjustCount: 1,
          investedMinutes: 125, // 2시간 5분
          availablePercent: 5,
          unplacedCount: 0,
          sharePercent: 32,
        },
      ],
    },

    // risk-fixed-conflict가 priorityAction과 같은 id를 공유(위 참고) — 서버가
    // 실제로 이렇게 응답한다는 보장은 없다(계약 미확정, §DASH.5), 그 전제를
    // mock에서 시연해 두는 것. 나머지 둘은 V-코드가 없는 이 화면 고유의
    // 리스크(서버 문구 그대로 소비).
    risks: [
      {
        id: 'risk-fixed-conflict',
        // W3: kept in sync with priorityAction's own code above — see that
        // field's own comment.
        code: 'V2_FIXED_CONFLICT',
        severity: 'blocking',
        source: '주간 계획',
        params: { blockTitle: '회의', otherTitle: '스터디', timeRange: '화요일 14:00–15:00' },
        actionType: 'FIXED_CONFLICT_RESOLVE',
        actionParams: {},
      },
      {
        id: 'risk-1',
        code: 'DAILY_AVAILABILITY_OVERRUN',
        severity: 'blocking',
        source: '주간 계획',
        label: '하루 가용시간 과도 초과',
        message: '하루 가용시간 과도 초과',
        actionType: 'INCOMPLETE_REPLAN',
        actionParams: {},
      },
      {
        id: 'risk-2',
        code: 'DEADLINE_TASK_UNPLACED',
        severity: 'warning',
        source: '주간 계획',
        label: '마감 태스크 미배치',
        message: '마감 태스크 미배치',
        actionType: 'UNPLACED_TASK_PLACE',
        actionParams: {},
      },
    ],
  }
}

export default mockDashboard
