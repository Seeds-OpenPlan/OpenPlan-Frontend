/*
  DEV-only mock for the stats feature's reads. Two unrelated cohorts live here:

  1. getCorrectionProposal ([가정—신규], ST-F1-09 AC-2 "제안 칩") — see its own
     comment below, unchanged from before ST-F1-11.
  2. getStatsSummaries/getStatsDeviations/getStatsTimePatterns (ST-F1-11, the
     수행 통계 screen) — realistic period-keyed tables so every AC (기간 토글 ·
     편차 토글 '없음' 그룹 · 4구간 TimeBandChart · 카테고리 미사용 힌트) has data
     to render on a fresh checkout, matching Desktop.Status.png's "이번 주"
     numbers exactly for that one period so the reference screen is
     reproducible without touching a real backend.
*/

const MOCK_LATENCY_MS = 60
const delay = (ms = MOCK_LATENCY_MS) => new Promise((resolve) => setTimeout(resolve, ms))

// category -> { suggestedMinutes, sampleSize }. suggestedMinutes is what the
// chip offers to fill the 예상시간 field with on click (never automatically).
const PROPOSALS = {
  코딩테스트: { suggestedMinutes: 75, sampleSize: 6 },
  취업준비: { suggestedMinutes: 100, sampleSize: 4 },
  // 자기계발: intentionally absent.
}

// --- ST-F1-11: 수행 통계 -----------------------------------------------------

const DEFAULT_PERIOD = 'week'

// 프로젝트 명은 이 화면 전용 mock이라 dashboardFixtures.js/projectFixtures.js의
// proj-*와 겹치지 않는다(두 파일 모두 이미 서로 다른 프로젝트 이름/ID를 쓰는
// 것과 같은 전제 — 각 feature의 mock은 독립적으로 자기완결적이다).
const SUMMARIES_BY_PERIOD = {
  week: {
    completionRate: { percent: 78, deltaPercent: 12, comparisonLabel: '전주 대비' },
    totalTime: { performedMinutes: 1470, plannedMinutes: 1680 }, // 24.5h / 28h
    avgDeviation: { percent: 18, direction: 'over' }, // 예상보다 오래
    delayedTaskCount: { count: 3, needsReplan: true },
    projectInvestments: [
      { projectId: 'stat-proj-ds', name: '자료구조', performedMinutes: 480, plannedMinutes: 420, availablePercent: 114, isOver: true },
      { projectId: 'stat-proj-pf', name: '포트폴리오', performedMinutes: 270, plannedMinutes: 300, availablePercent: 90, isOver: false },
      { projectId: 'stat-proj-jp', name: '취업 준비', performedMinutes: 330, plannedMinutes: 240, availablePercent: 137, isOver: true },
    ],
    delayedTasks: [
      { taskId: 'stat-task-1', title: '논문 초안 작성', projectName: '취업 준비', progressPercent: 67, overdueLabel: '2일 초과' },
      { taskId: 'stat-task-2', title: '자료구조 시험 준비', projectName: '포트폴리오', progressPercent: 21, overdueLabel: '1일 초과' },
      { taskId: 'stat-task-3', title: '대표 사례 캡션 정리', projectName: '포트폴리오', progressPercent: 0, overdueLabel: '마감일' },
    ],
  },
  month: {
    completionRate: { percent: 71, deltaPercent: 5, comparisonLabel: '전월 대비' },
    totalTime: { performedMinutes: 5820, plannedMinutes: 6600 },
    avgDeviation: { percent: 12, direction: 'over' },
    delayedTaskCount: { count: 7, needsReplan: true },
    projectInvestments: [
      { projectId: 'stat-proj-ds', name: '자료구조', performedMinutes: 1800, plannedMinutes: 1680, availablePercent: 107, isOver: true },
      { projectId: 'stat-proj-pf', name: '포트폴리오', performedMinutes: 1080, plannedMinutes: 1200, availablePercent: 90, isOver: false },
      { projectId: 'stat-proj-jp', name: '취업 준비', performedMinutes: 1320, plannedMinutes: 960, availablePercent: 137, isOver: true },
    ],
    delayedTasks: [
      { taskId: 'stat-task-1', title: '논문 초안 작성', projectName: '취업 준비', progressPercent: 67, overdueLabel: '2일 초과' },
      { taskId: 'stat-task-2', title: '자료구조 시험 준비', projectName: '포트폴리오', progressPercent: 21, overdueLabel: '1일 초과' },
      { taskId: 'stat-task-3', title: '대표 사례 캡션 정리', projectName: '포트폴리오', progressPercent: 0, overdueLabel: '마감일' },
    ],
  },
  last3months: {
    completionRate: { percent: 74, deltaPercent: 3, comparisonLabel: '지난 3개월 평균 대비' },
    totalTime: { performedMinutes: 16800, plannedMinutes: 21600 },
    avgDeviation: { percent: 9, direction: 'over' },
    delayedTaskCount: { count: 15, needsReplan: true },
    projectInvestments: [
      { projectId: 'stat-proj-ds', name: '자료구조', performedMinutes: 5400, plannedMinutes: 5040, availablePercent: 107, isOver: true },
      { projectId: 'stat-proj-pf', name: '포트폴리오', performedMinutes: 3240, plannedMinutes: 3600, availablePercent: 90, isOver: false },
      { projectId: 'stat-proj-jp', name: '취업 준비', performedMinutes: 3960, plannedMinutes: 2880, availablePercent: 137, isOver: true },
    ],
    delayedTasks: [
      { taskId: 'stat-task-1', title: '논문 초안 작성', projectName: '취업 준비', progressPercent: 67, overdueLabel: '2일 초과' },
      { taskId: 'stat-task-2', title: '자료구조 시험 준비', projectName: '포트폴리오', progressPercent: 21, overdueLabel: '1일 초과' },
      { taskId: 'stat-task-3', title: '대표 사례 캡션 정리', projectName: '포트폴리오', progressPercent: 0, overdueLabel: '마감일' },
    ],
  },
  all: {
    // '전체' has no previous period to compare against — deltaPercent/
    // comparisonLabel stay null so SummaryCards knows to omit that caption
    // line entirely instead of rendering a meaningless "null% 대비".
    completionRate: { percent: 76, deltaPercent: null, comparisonLabel: null },
    totalTime: { performedMinutes: 42000, plannedMinutes: 54000 },
    avgDeviation: { percent: 7, direction: 'over' },
    delayedTaskCount: { count: 22, needsReplan: true },
    projectInvestments: [
      { projectId: 'stat-proj-ds', name: '자료구조', performedMinutes: 9600, plannedMinutes: 9000, availablePercent: 107, isOver: true },
      { projectId: 'stat-proj-pf', name: '포트폴리오', performedMinutes: 6000, plannedMinutes: 6600, availablePercent: 91, isOver: false },
      { projectId: 'stat-proj-jp', name: '취업 준비', performedMinutes: 7440, plannedMinutes: 5400, availablePercent: 138, isOver: true },
    ],
    delayedTasks: [
      { taskId: 'stat-task-1', title: '논문 초안 작성', projectName: '취업 준비', progressPercent: 67, overdueLabel: '2일 초과' },
      { taskId: 'stat-task-2', title: '자료구조 시험 준비', projectName: '포트폴리오', progressPercent: 21, overdueLabel: '1일 초과' },
      { taskId: 'stat-task-3', title: '대표 사례 캡션 정리', projectName: '포트폴리오', progressPercent: 0, overdueLabel: '마감일' },
    ],
  },
}

// groupBy -> period -> rows. `자기계발`의 sampleSize:0 은 실수가 아니라
// AC-5(카테고리 미사용 힌트)가 항상 뜨도록 고정한 데이터 — 이 카테고리는 어느
// 기간을 봐도 한 번도 기록된 적이 없다는 전제(projectFixtures.js가 이미 같은
// 카테고리를 "제안 칩 없음" 상태로 쓰는 것과 같은 전제를 공유한다).
const DEVIATIONS_BY_PERIOD = {
  project: {
    week: [
      { key: 'stat-proj-ds', label: '자료구조', deviationMinutes: 74, sampleSize: 9 },
      { key: 'stat-proj-jp', label: '취업 준비', deviationMinutes: 120, sampleSize: 5 },
      { key: 'stat-proj-pf', label: '포트폴리오', deviationMinutes: -30, sampleSize: 4 },
    ],
    month: [
      { key: 'stat-proj-ds', label: '자료구조', deviationMinutes: 68, sampleSize: 32 },
      { key: 'stat-proj-jp', label: '취업 준비', deviationMinutes: 110, sampleSize: 18 },
      { key: 'stat-proj-pf', label: '포트폴리오', deviationMinutes: -25, sampleSize: 14 },
    ],
    last3months: [
      { key: 'stat-proj-ds', label: '자료구조', deviationMinutes: 70, sampleSize: 88 },
      { key: 'stat-proj-jp', label: '취업 준비', deviationMinutes: 115, sampleSize: 52 },
      { key: 'stat-proj-pf', label: '포트폴리오', deviationMinutes: -28, sampleSize: 40 },
    ],
    all: [
      { key: 'stat-proj-ds', label: '자료구조', deviationMinutes: 72, sampleSize: 160 },
      { key: 'stat-proj-jp', label: '취업 준비', deviationMinutes: 118, sampleSize: 95 },
      { key: 'stat-proj-pf', label: '포트폴리오', deviationMinutes: -27, sampleSize: 75 },
    ],
  },
  category: {
    week: [
      { key: '취업준비', label: '취업준비', deviationMinutes: 95, sampleSize: 6 },
      { key: '코딩테스트', label: '코딩테스트', deviationMinutes: 40, sampleSize: 8 },
      { key: '자기계발', label: '자기계발', deviationMinutes: 0, sampleSize: 0 },
      { key: null, label: '없음', deviationMinutes: 15, sampleSize: 3 },
    ],
    month: [
      { key: '취업준비', label: '취업준비', deviationMinutes: 90, sampleSize: 22 },
      { key: '코딩테스트', label: '코딩테스트', deviationMinutes: 35, sampleSize: 30 },
      { key: '자기계발', label: '자기계발', deviationMinutes: 0, sampleSize: 0 },
      { key: null, label: '없음', deviationMinutes: 12, sampleSize: 11 },
    ],
    last3months: [
      { key: '취업준비', label: '취업준비', deviationMinutes: 92, sampleSize: 60 },
      { key: '코딩테스트', label: '코딩테스트', deviationMinutes: 38, sampleSize: 85 },
      { key: '자기계발', label: '자기계발', deviationMinutes: 0, sampleSize: 0 },
      { key: null, label: '없음', deviationMinutes: 14, sampleSize: 30 },
    ],
    all: [
      { key: '취업준비', label: '취업준비', deviationMinutes: 91, sampleSize: 110 },
      { key: '코딩테스트', label: '코딩테스트', deviationMinutes: 37, sampleSize: 150 },
      { key: '자기계발', label: '자기계발', deviationMinutes: 0, sampleSize: 0 },
      { key: null, label: '없음', deviationMinutes: 13, sampleSize: 55 },
    ],
  },
}

// [hour, completedCount, totalCount] tuples — only hours with ANY tracked
// execution appear; 00~05시(새벽)는 네 기간 모두 통째로 빠져 있다(사용자가
// 새벽에 작업한 기록이 한 번도 없다는 전제) — statsApi.js의 밴드 집계가 이
// "그 시간대 항목 자체가 없음"을 rate: null(="기록 없음")로 구분해서 읽는다.
function hourRows(tuples) {
  return tuples.map(([hour, completedCount, totalCount]) => ({ hour, completedCount, totalCount }))
}

const TIME_PATTERNS_BY_PERIOD = {
  week: hourRows([
    [6, 2, 3], [7, 3, 4], [8, 4, 5], [9, 5, 6], [10, 5, 6], [11, 4, 5],
    [12, 3, 5], [13, 3, 5], [14, 4, 6], [15, 4, 6], [16, 3, 5], [17, 3, 5],
    [18, 2, 5], [19, 2, 5], [20, 1, 4], [21, 1, 4], [22, 1, 3], [23, 0, 2],
  ]),
  month: hourRows([
    [6, 8, 11], [7, 12, 16], [8, 16, 20], [9, 20, 24], [10, 20, 24], [11, 16, 20],
    [12, 12, 20], [13, 12, 20], [14, 16, 24], [15, 16, 24], [16, 12, 20], [17, 12, 20],
    [18, 8, 20], [19, 8, 20], [20, 4, 16], [21, 4, 16], [22, 4, 12], [23, 0, 8],
  ]),
  // last3months/all: 오후 구간이 오전을 앞서도록 비중을 바꿔서, 기간 토글이
  // 실제로 다른 데이터를 반영한다는 것을 (79%→60%대 오전처럼) 눈에 보이게 한다.
  last3months: hourRows([
    [6, 18, 36], [7, 24, 42], [8, 30, 48], [9, 36, 54], [10, 30, 48], [11, 24, 42],
    [12, 36, 48], [13, 42, 54], [14, 48, 60], [15, 48, 60], [16, 42, 54], [17, 36, 48],
    [18, 18, 48], [19, 18, 48], [20, 12, 36], [21, 12, 36], [22, 6, 24], [23, 0, 12],
  ]),
  all: hourRows([
    [6, 27, 54], [7, 36, 63], [8, 45, 72], [9, 54, 81], [10, 45, 72], [11, 36, 63],
    [12, 54, 72], [13, 63, 81], [14, 72, 90], [15, 72, 90], [16, 63, 81], [17, 54, 72],
    [18, 27, 72], [19, 27, 72], [20, 18, 54], [21, 18, 54], [22, 9, 36], [23, 0, 18],
  ]),
}

export const mockBackend = {
  async getCorrectionProposal(category) {
    await delay()
    const entry = PROPOSALS[category]
    if (!entry) return null
    return { category, ...entry }
  },

  async getStatsSummaries(period) {
    await delay()
    return SUMMARIES_BY_PERIOD[period] ?? SUMMARIES_BY_PERIOD[DEFAULT_PERIOD]
  },

  async getStatsDeviations(groupBy, period) {
    await delay()
    const byPeriod = DEVIATIONS_BY_PERIOD[groupBy] ?? DEVIATIONS_BY_PERIOD.project
    return { groups: byPeriod[period] ?? byPeriod[DEFAULT_PERIOD] }
  },

  async getStatsTimePatterns(period) {
    await delay()
    return { efficiencyByHour: TIME_PATTERNS_BY_PERIOD[period] ?? TIME_PATTERNS_BY_PERIOD[DEFAULT_PERIOD] }
  },
}

// AC-4 이력 0 빈 상태 — 실 서버의 204(§07 API 명세서 "조회 기간 내 통계 없음")를
// statsApi.js가 그대로 "no history" 로 해석하는 경로와 동일한 모양(=payload
// 자체가 없음)을 재현해 둔다. DashboardEmptyState의 mockDashboardEmpty와 같은
// 이유로 지금 사이클엔 실제 UI 스위치가 없어 어디서도 호출되지 않지만, 계약을
// 고정해 두면 그 스위치가 생기는 즉시(혹은 실 서버가 204를 보내는 즉시) 바로
// 맞아떨어진다.
export async function getStatsSummariesEmpty() {
  await delay()
  return null
}

export default mockBackend
