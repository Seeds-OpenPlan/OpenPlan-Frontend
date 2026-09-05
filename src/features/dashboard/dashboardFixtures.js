/*
  DEV-only mock for GET /dashboard (OP-DASH-ASSEMBLE). Shaped to the REAL
  `DashboardView` server contract (W6, 2026-08-23 — `.agent-team/
  04-architecture/openapi-live-76c7009.yaml`), not the old FE-invented shape:
  this mock's output goes through the exact same `normalizeDashboard`
  (dashboardApi.js) a real response does, so it has to look like what the
  server actually sends (statusBoard/priorityAction/riskIssues/todayBoard/
  weeklyImpactProjects/busyWeekdays) — a mock still shaped like the old guess
  would silently normalize into something a real response never produces,
  which defeats the point of having dev and prod agree. Same dev-fallback
  convention as planFixtures.js: only ever reached in DEV, only on a network
  error (dashboardApi.js's withDevFallback).

  Numbers below still intentionally mirror the Desktop.Dashboard.png reference
  (6시간 30분/45시간 · 14% · 자료구조 53% 등) where the new leaner contract still
  has a field for them — DASH-06 (weeklyImpactProjects) no longer carries
  minutes/percent at all (badges only), so that reference detail (자료구조
  53%) can't be reproduced here anymore; see ImpactList.jsx's own header for
  why.
*/

import { hasCompletedExecution } from '../plan/planFixtures'

const MOCK_LATENCY_MS = 120
const delay = (ms = MOCK_LATENCY_MS) => new Promise((resolve) => setTimeout(resolve, ms))

// Today's date at a fixed hour, for the todayBoard rows — real hours so
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
    // DASH-01. plannedMinutes 390(6시간 30분) / availableMinutes 2700(45시간)
    // → deltaMinutes 2310(여유) — 양수이므로 normalizeStatusBoard가 status
    // 'OK'를 유도한다(dashboardApi.js 참고).
    statusBoard: {
      weekStartDate: new Date().toISOString().slice(0, 10),
      plannedMinutes: 390,
      availableMinutes: 2700,
      deltaMinutes: 2310,
    },

    // RB-DASH-01 최상위 1행동. actionType은 실제 서버 enum
    // (RESOLVE_FIXED_CONFLICT 등, openapi DashboardView 참고) — 구 mock의
    // FIXED_CONFLICT_RESOLVE 같은 FE 자체 발명 값이 아니다. routePath는
    // 서버가 직접 주는 목적지라 FE가 actionType→경로를 다시 조립할 필요가
    // 없다(actionRouting.js는 이제 라벨 카탈로그일 뿐 — 그 파일 헤더 참고).
    priorityAction: {
      actionType: 'RESOLVE_FIXED_CONFLICT',
      reason: '회의가 고정 일정 스터디와 화요일 14:00–15:00에 겹칩니다',
      routePath: '/weekly',
    },

    todayBoard: {
      items: [
        {
          planBlockId: 'block-201',
          taskId: 'task-201',
          title: '자료 조사',
          startAt: task1Start,
          endAt: addMinutesISO(task1Start, 60),
          estimatedMinutes: 60,
          // Reflects an actual mock POST /tasks/task-201/execution-logs
          // (planFixtures.hasCompletedExecution — only a 'COMPLETED' result counts,
          // not a 지연/중단 log) rather than a value frozen at
          // module load — otherwise this row snapped back to "미기록" on
          // every refetch/reload no matter what the user just logged.
          completed: hasCompletedExecution('task-201'),
          selectionRank: 1, // RB-DASH-02 선정 결과 = "오늘 먼저"
        },
        {
          // taskId: null → 고정 일정 행(붙을 태스크가 없다) — normalizeTodayItem이
          // 이 신호로 type을 'SCHEDULE'로 유도한다(dashboardApi.js 참고).
          planBlockId: 'block-202',
          taskId: null,
          title: '스터디',
          startAt: task2Start,
          endAt: addMinutesISO(task2Start, 60),
          estimatedMinutes: 60,
          completed: false,
          selectionRank: null,
        },
        {
          planBlockId: 'block-203',
          taskId: 'task-202',
          title: '요약 정리',
          startAt: task3Start,
          endAt: addMinutesISO(task3Start, 30),
          estimatedMinutes: 30,
          completed: true,
          selectionRank: null,
        },
      ],
      remainingMinutes: 240, // 남은 가용 4시간
    },

    weeklyImpactProjects: [
      // impactBadges만 있고 investedMinutes/sharePercent 등은 계약에 없다 —
      // ImpactList.jsx는 더 이상 진행바/퍼센트를 렌더하지 않는다.
      { projectId: 'proj-1', name: '자료구조', impactBadges: ['HAS_UNASSIGNED'] },
      { projectId: 'proj-2', name: '취업 준비', impactBadges: [] },
    ],

    // riskType이 priorityAction의 actionType과 매칭되는 관계를 보여 주기
    // 위한 것 — RESOLVE_FIXED_CONFLICT ↔ FIXED_CONFLICT (RiskList.jsx의
    // ACTION_TYPE_TO_RISK_TYPE 참고). 실제로 서버가 이렇게 짝지어 보낸다는
    // 계약상 보장은 없다(§DASH.5, 여전히 미확정) — 이 mock은 그 전제가
    // 실제로 있을 때 dedup 경로가 잘 도는지 시연해 두는 것뿐이다.
    riskIssues: [
      {
        riskType: 'FIXED_CONFLICT',
        count: 1,
        description: '회의가 고정 일정 스터디와 화요일 14:00–15:00에 겹칩니다',
        routePath: '/weekly',
      },
      {
        riskType: 'UNASSIGNED_TASKS',
        count: 1,
        description: '미배치 태스크가 1건 있습니다',
        routePath: '/weekly?openUnplaced=1',
      },
      {
        riskType: 'DEADLINE_SOON',
        count: 1,
        description: '마감이 임박한 태스크가 1건 있습니다',
        routePath: '/weekly',
      },
    ],

    // DASH-07. 이번 작업 범위는 데이터만 받아 두는 것까지다 — 소비하는 UI는
    // 아직 없다(dashboardApi.js의 busyWeekdays 통과 로직 참고).
    busyWeekdays: [{ weekday: 'TUE', remainingAvailabilityPercent: 12 }],
  }
}

export default mockDashboard
