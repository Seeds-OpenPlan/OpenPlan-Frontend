/*
  DEV-only mock for the stats feature's reads. Two unrelated cohorts live here:

  1. getCorrectionProposal ([가정—신규], ST-F1-09 AC-2 "제안 칩") — see its own
     comment below, unchanged from before ST-F1-11.
  2. getStatsSummaries/getStatsDeviations/getStatsTimePatterns (ST-F1-11, the
     수행 통계 screen) — realistic period-keyed tables so every AC (기간 토글 ·
     편차 토글 '없음' 그룹 · 4구간 TimeBandChart · 카테고리 미사용 힌트) has data
     to render on a fresh checkout.

  [버그 수정 2026-08] 이 세 mock은 원래 실 계약과 다른 필드명·enum 값·envelope
  key를 썼다 — dev에서는 늘 mock만 타서 그 불일치가 한 번도 드러나지 않았고,
  그 상태로 실 서버에 붙였을 때에야 통계 화면 전체가 "이 영역을 불러오지
  못했습니다"로 깨졌다(422 — period/groupBy 값 불일치, 필드명 불일치는 값이
  전부 undefined로 읽혀 화면이 비정상 렌더). 재발을 막는 유일한 방법은 이
  mock도 정본(openapi-live-76c7009.yaml StatsSummary/DeviationReport/
  TimePatternReport)과 같은 모양으로 맞춰 두는 것이라, 아래 세 표 전부를
  그 스키마에 맞춰 다시 썼다.
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

const DEFAULT_PERIOD = 'WEEKLY'

// period -> StatsSummary(계약) 그대로의 모양. rangeStart/rangeEnd는 팀리드가
// 실 서버에 curl로 확인한 "이번 주" 값(2026-08-24~30)을 그대로 재사용해, mock과
// 실 서버가 최소한 이 한 조합에선 같은 날짜를 보여주도록 맞췄다.
// completionRate/varianceRate는 [불확실] 0~100 퍼센트 스케일이라고 가정한
// 값이다 — 계약(`type: [number, "null"]`)엔 스케일 표기가 없고, 실 서버는
// 지금 이 계정에 이력이 없어(전부 null/empty:true) 실측으로 확인할 방법이
// 없었다. 이력이 쌓인 뒤 실제 응답과 다르면 이 mock과 SummaryCards.jsx의
// 포맷팅(있는 그대로 `%` 붙이기)을 함께 고쳐야 한다.
const SUMMARIES_BY_PERIOD = {
  WEEKLY: {
    period: 'WEEKLY',
    rangeStart: '2026-08-24',
    rangeEnd: '2026-08-30',
    totalEstimatedMinutes: 1680,
    totalActualMinutes: 1470,
    completionRate: 78,
    varianceRate: 18,
    empty: false,
  },
  MONTHLY: {
    period: 'MONTHLY',
    rangeStart: '2026-08-01',
    rangeEnd: '2026-08-31',
    totalEstimatedMinutes: 6600,
    totalActualMinutes: 5820,
    completionRate: 71,
    varianceRate: 12,
    empty: false,
  },
}

// groupBy -> period -> DeviationReport.rows(계약) 그대로의 모양. `자기계발`의
// `deviationRate: null`은 실수가 아니라 AC-5(카테고리 미사용 힌트)가 항상 뜨도록
// 고정한 데이터 — 이 카테고리는 어느 기간을 봐도 실적이 없다는 전제
// (projectFixtures.js가 같은 카테고리를 "제안 칩 없음" 상태로 쓰는 것과 같은
// 전제를 공유한다). estimatedMinutes/actualMinutes는 계약에 실재하는 필드지만
// 화면 어디서도 아직 안 읽는다(편차 패널은 deviationMinutes만 표시, Desktop.
// Status.png 정본 기준) — 그래도 실 응답 모양을 그대로 재현해 두면 나중에 그
// 필드를 쓰는 화면이 생겨도 mock을 다시 안 고쳐도 된다.
const DEVIATIONS_BY_PERIOD = {
  PROJECT: {
    WEEKLY: [
      { groupId: 'stat-proj-ds', groupName: '자료구조', estimatedMinutes: 400, actualMinutes: 474, deviationMinutes: 74, deviationRate: 19 },
      { groupId: 'stat-proj-jp', groupName: '취업 준비', estimatedMinutes: 210, actualMinutes: 330, deviationMinutes: 120, deviationRate: 57 },
      { groupId: 'stat-proj-pf', groupName: '포트폴리오', estimatedMinutes: 300, actualMinutes: 270, deviationMinutes: -30, deviationRate: -10 },
    ],
    MONTHLY: [
      { groupId: 'stat-proj-ds', groupName: '자료구조', estimatedMinutes: 1600, actualMinutes: 1868, deviationMinutes: 68, deviationRate: 17 },
      { groupId: 'stat-proj-jp', groupName: '취업 준비', estimatedMinutes: 900, actualMinutes: 1210, deviationMinutes: 110, deviationRate: 34 },
      { groupId: 'stat-proj-pf', groupName: '포트폴리오', estimatedMinutes: 1200, actualMinutes: 1080, deviationMinutes: -25, deviationRate: -9 },
    ],
  },
  CATEGORY: {
    WEEKLY: [
      { groupId: null, groupName: '취업준비', estimatedMinutes: 180, actualMinutes: 275, deviationMinutes: 95, deviationRate: 53 },
      { groupId: null, groupName: '코딩테스트', estimatedMinutes: 150, actualMinutes: 190, deviationMinutes: 40, deviationRate: 27 },
      { groupId: null, groupName: '자기계발', estimatedMinutes: 0, actualMinutes: 0, deviationMinutes: 0, deviationRate: null },
      { groupId: null, groupName: '없음', estimatedMinutes: 60, actualMinutes: 75, deviationMinutes: 15, deviationRate: 25 },
    ],
    MONTHLY: [
      { groupId: null, groupName: '취업준비', estimatedMinutes: 720, actualMinutes: 1080, deviationMinutes: 90, deviationRate: 25 },
      { groupId: null, groupName: '코딩테스트', estimatedMinutes: 600, actualMinutes: 810, deviationMinutes: 35, deviationRate: 5 },
      { groupId: null, groupName: '자기계발', estimatedMinutes: 0, actualMinutes: 0, deviationMinutes: 0, deviationRate: null },
      { groupId: null, groupName: '없음', estimatedMinutes: 240, actualMinutes: 300, deviationMinutes: 12, deviationRate: 25 },
    ],
  },
}

// period -> TimePatternReport(계약) 그대로의 모양. 새벽(DAWN)은 두 기간 모두
// totalCount 0/completionRate null로 고정해 뒀다 — 사용자가 새벽에 작업한
// 기록이 한 번도 없다는 전제(TimeBandChart의 "기록 없음" dashed-bar 경로가
// 실제로 렌더되도록). MORNING/AFTERNOON/NIGHT 수치는 예전 per-hour mock을
// 그대로 4구간으로 합산해 재현한 값이라 화면에 보이는 비율은 이전과 동일하다.
const TIME_PATTERNS_BY_PERIOD = {
  WEEKLY: {
    empty: false,
    slots: [
      { slot: 'DAWN', totalCount: 0, completedCount: 0, completionRate: null },
      { slot: 'MORNING', totalCount: 29, completedCount: 23, completionRate: 79 },
      { slot: 'AFTERNOON', totalCount: 32, completedCount: 20, completionRate: 63 },
      { slot: 'NIGHT', totalCount: 23, completedCount: 7, completionRate: 30 },
    ],
  },
  MONTHLY: {
    empty: false,
    slots: [
      { slot: 'DAWN', totalCount: 0, completedCount: 0, completionRate: null },
      { slot: 'MORNING', totalCount: 115, completedCount: 92, completionRate: 80 },
      { slot: 'AFTERNOON', totalCount: 128, completedCount: 80, completionRate: 63 },
      { slot: 'NIGHT', totalCount: 92, completedCount: 28, completionRate: 30 },
    ],
  },
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
    const byPeriod = DEVIATIONS_BY_PERIOD[groupBy] ?? DEVIATIONS_BY_PERIOD.PROJECT
    const rows = byPeriod[period] ?? byPeriod[DEFAULT_PERIOD]
    return { groupBy, empty: rows.length === 0, rows }
  },

  async getStatsTimePatterns(period) {
    await delay()
    return TIME_PATTERNS_BY_PERIOD[period] ?? TIME_PATTERNS_BY_PERIOD[DEFAULT_PERIOD]
  },
}

// AC-4 이력 0 빈 상태 — [버그 수정 2026-08] 예전엔 실 서버의 204를 흉내내려고
// null을 반환했지만, 팀리드가 curl로 확인한 실제 응답은 204가 아니라 200 +
// `empty: true`다(statsApi.js의 isEmptyPayload/normalizeSummaries 주석 참고).
// 그 실제 모양을 재현하도록 반환값을 바꿨다 — 지금 사이클엔 이 빈 상태를
// 흉내낼 실제 UI 스위치가 없어 어디서도 호출되지 않지만, 계약을 고정해 두면
// 그 스위치가 생기는 즉시 바로 맞아떨어진다.
export async function getStatsSummariesEmpty() {
  await delay()
  return {
    period: DEFAULT_PERIOD,
    rangeStart: null,
    rangeEnd: null,
    totalEstimatedMinutes: 0,
    totalActualMinutes: 0,
    completionRate: null,
    varianceRate: null,
    empty: true,
  }
}

export default mockBackend
