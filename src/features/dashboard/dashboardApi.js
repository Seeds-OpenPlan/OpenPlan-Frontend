/*
  OP-DASH-ASSEMBLE → GET /dashboard. Contract CONFIRMED (W6, 2026-08-23):
  `DashboardView` in `.agent-team/04-architecture/openapi-live-76c7009.yaml`
  (실서버 origin/main 76c7009에서 추출, 리드 실측). Every previous header
  comment here said "FE-adopted contract pending BE-1" / "[가정, contract
  unconfirmed]" — that was true while no contract existed; it is no longer
  true, and this file's job is now "adapt the real server shape", not
  "guess one". Real server keys (statusBoard/riskIssues/todayBoard/
  weeklyImpactProjects/priorityAction/busyWeekdays) are FLATTER and simpler
  than what this file used to invent (weeklyStatus/risks/todayExecution/
  weeklyImpact with per-row severity/params/percent fields the server never
  actually sends) — normalizeDashboard below is now a real translation layer,
  not a pass-through.

  Why the OUTPUT shape below still uses the OLD internal key names
  (weeklyStatus/todayExecution/weeklyImpact/risks/priorityAction/planStatus/
  isEmpty) even though the server doesn't: `src/pages/HomePage.jsx` reads
  exactly this shape and is OUTSIDE this story's owned paths
  (`src/features/dashboard/**` + `src/components/dashboard/**` only) — every
  other person's parallel work in this worktree touches `src/pages/**`, so
  this file keeps HomePage.jsx's contract stable and absorbs the server's
  real shape entirely on this side. Only the fields the server genuinely
  cannot back (`planStatus`, `isEmpty`, `focusWindow`, `adjustDays`) get
  documented fallbacks/removals instead of fabricated values — see each
  helper's own comment.

  Same withDevFallback convention as planApi.js/taskApi.js — reused directly
  from planApi (not re-implemented) so the mock-fallback rule stays defined in
  exactly one place across every OP module. dashboardFixtures.js's mock now
  also mimics the SERVER shape (not the old internal one) — see that file's
  own header — because it feeds through this same normalizeDashboard below.
*/
import { apiClient } from '../../api/client'
import { withDevFallback } from '../plan/planApi'

/*
  dashboardFixtures.js를 최상단 정적 import로 들이지 않는다 — authApi.js의
  loadAuthMock()과 같은 이유(그 파일 헤더 참조): 정적 import는 실행 경로와
  무관하게 번들러가 항상 포함시켜, DEV 전용 mock 데이터가 프로덕션 청크에도
  그대로 실린다. 아래처럼 `import.meta.env.DEV` 분기 안에서만 동적 import를
  호출하면, Vite가 빌드 시 그 값을 리터럴 false로 치환해 분기 전체가 도달
  불가능해지고 번들러가 통째로 제거한다.
*/
async function loadDashboardMock() {
  if (!import.meta.env.DEV) return null
  const { mockDashboard } = await import('./dashboardFixtures')
  return mockDashboard
}

/**
 * A section is present in the payload → pass it through as-is (including a
 * legitimate `null`, which several sections use for "nothing to show" —
 * priorityAction: null is the AC-3 긍정 카드, riskIssues: [] is "지금 볼 문제가
 * 없습니다"). A section MISSING from the payload (key absent → undefined) means
 * the assembly's own partial-failure case (§DASH.7) — normalized to a sentinel
 * object so the page can tell "this section failed" apart from "this section is
 * legitimately empty" without guessing at whatever shape the real error marker
 * turns out to be. (DashboardView's own schema never marks a section nullable
 * for this reason, so `undefined` — a key genuinely missing from the response —
 * stays the one reliable "something upstream went wrong" signal.)
 */
function sectionOrError(value) {
  return value === undefined ? { error: true } : value
}

/** 'YYYY-MM-DDTHH:mm:ss...' → '09:00' local time — matches the 24h HH:MM style
 * every other time-of-day label in this screen already uses (design PNG). Kept
 * local to this file rather than added to planTime.js: that module is owned by
 * the weekly-calendar story (outside this story's owned paths) and only deals
 * in whole-day/duration math today, not a single wall-clock instant. */
function formatTimeKO(iso) {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/**
 * DASH-01 상태 보드. Server sends `deltaMinutes` (양수=여유, 음수=초과) — no
 * `status` word at all; `TIGHT`(여유 부족) has no threshold anywhere in the
 * contract, so only the two states the sign can actually distinguish are
 * derived. StatusBoard.jsx's STATUS_COPY keeps a `TIGHT` entry for when/if a
 * real threshold arrives, but this derivation can never select it today —
 * that's not a bug, it's the honest limit of a two-valued sign.
 *
 * `focusWindow`/`adjustDays` (구 코드가 쓰던 필드) have no server counterpart
 * at all — StatusBoard.jsx no longer accepts those props (removed there, not
 * defaulted here) rather than rendering a fabricated "집중 시간"/"손 볼 요일"
 * line from data that doesn't exist.
 */
function normalizeStatusBoard(statusBoard) {
  if (!statusBoard) return undefined
  const deltaMinutes = statusBoard.deltaMinutes ?? 0
  return {
    status: deltaMinutes < 0 ? 'OVERLOAD' : 'OK',
    plannedMinutes: statusBoard.plannedMinutes ?? 0,
    availableMinutes: statusBoard.availableMinutes ?? 0,
    deltaMinutes,
    weekStartDate: statusBoard.weekStartDate,
  }
}

/** One todayBoard row: server's `estimatedMinutes`/`selectionRank`/`taskId`
 * shape → the fields TodayBoard.jsx already renders (unchanged component —
 * only this mapping is new). */
function normalizeTodayItem(item) {
  return {
    id: item.planBlockId,
    // DashboardView.todayBoard.items의 `title`이 정규화에서 빠져 있었다 —
    // TodayBoard.jsx:107이 `{item.title}`을 그대로 렌더하므로 이 필드가 없으면
    // 모든 행이 시간만 보이고 제목이 항상 undefined였다(W6 리뷰 B1). 계약에
    // 있는 필드라 `?? ''` 같은 임의 폴백을 씌우지 않는다 — 서버가 언젠가 정말
    // title을 안 보내는 경우가 생기면 그 결손이 화면에 그대로 드러나야 다음
    // 회귀도 이번처럼 즉시 눈에 띈다.
    title: item.title,
    timeLabel: formatTimeKO(item.startAt),
    // 서버는 항목 종류를 별도 필드로 안 준다 — taskId가 없는 행은 애초에 붙을
    // 태스크가 없는 고정 일정 행이라는 뜻이므로(같은 전제를 TodayBoard.jsx의
    // [기록] 버튼 노출 조건도 이미 쓰고 있다), 같은 신호로 SCHEDULE/TASK를
    // 유도한다.
    type: item.taskId == null ? 'SCHEDULE' : 'TASK',
    expectedMinutes: item.estimatedMinutes ?? 0,
    // RB-DASH-02 "오늘 먼저" 배지: 예전엔 서버가 isTop 불리언을 직접 줬다는
    // 가정이었지만, 실제로는 selectionRank(1 = 최우선 선정)로 순위를 준다 —
    // 1등만 "오늘 먼저"로 취급한다. (완료 항목은 TodayBoard.jsx가 렌더
    // 단계에서 이미 별도로 걸러낸다.)
    isTop: item.selectionRank === 1,
    completed: Boolean(item.completed),
    taskId: item.taskId,
    startAt: item.startAt,
    endAt: item.endAt,
  }
}

/** DASH-05 오늘 할 일. Server's todayBoard has no top-level "오늘 예상 총량"
 * field (구 mock의 `expectedMinutes`) — summed from `items[].estimatedMinutes`
 * instead (완료 여부 무관하게 전부 합산 — "오늘 계획된 총량"이라는 기존
 * 의미를 그대로 유지). `estimatedMinutes: null`인 행은 0으로 취급되어 합계가
 * 과소평가될 수 있다 — 서버가 실제로 null을 보내는 케이스가 흔하면 리드에게
 * 별도 보고할 것. */
function normalizeTodayBoard(todayBoard) {
  if (!todayBoard) return undefined
  const items = Array.isArray(todayBoard.items) ? todayBoard.items.map(normalizeTodayItem) : []
  return {
    expectedMinutes: items.reduce((sum, it) => sum + (it.expectedMinutes ?? 0), 0),
    remainingAvailableMinutes: todayBoard.remainingMinutes ?? 0,
    items,
  }
}

/** DASH-06. Server gives `impactBadges[]` (enum), not the minutes/percent
 * fields the old mock invented (`investedMinutes`/`availablePercent`/
 * `sharePercent`/`adjustCount`/`unplacedCount`) — ImpactList.jsx was rewritten
 * to render badges instead of a percent bar, so this is a straight pass-through
 * of the two real fields plus the badge list. */
function normalizeWeeklyImpact(weeklyImpactProjects) {
  if (weeklyImpactProjects === undefined) return undefined
  return {
    projects: Array.isArray(weeklyImpactProjects)
      ? weeklyImpactProjects.map((p) => ({
          projectId: p.projectId,
          name: p.name,
          impactBadges: Array.isArray(p.impactBadges) ? p.impactBadges : [],
        }))
      : [],
  }
}

function normalizeDashboard(raw) {
  const data = raw ?? {}
  return {
    // planStatus/isEmpty: DashboardView에 없는 필드. HomePage.jsx가 여전히 이
    // 두 키를 그대로 읽으므로(그 파일은 이 스토리의 소유 경로 밖 — 손대지
    // 않음) 반환 모양은 유지하되, 계약이 줄 수 없는 값이라 고정 폴백을 쓴다:
    //  - planStatus: 항상 'DRAFT'. 계획 확정 여부를 나타낼 서버 필드가
    //    DashboardView에 없다 (바뀌기 전 mock도 항상 DRAFT만 보냈으므로
    //    이건 새 회귀가 아니다) — PageHeader 캡션의 실제 정확도가 필요하면
    //    별도 API가 있어야 한다. 리드 보고 사항.
    //  - isEmpty: 항상 false. "온보딩 빈 화면"을 트리거할 신뢰 가능한 단일
    //    신호가 계약에 없다 (예: weeklyImpactProjects가 비어 있어도 "프로젝트
    //    0개"라는 뜻은 아니다 — 이번 주에 영향이 없을 뿐일 수 있다). false로
    //    두면 각 섹션이 이미 자기 자신의 빈 상태(오늘 할 일 없음/문제 없음/
    //    영향 프로젝트 없음)를 개별 렌더하므로 화면은 깨지지 않는다 — 다만
    //    DashboardEmptyState의 "새 프로젝트" 온보딩 CTA는 뜨지 않는다.
    planStatus: 'DRAFT',
    isEmpty: false,

    weeklyStatus: sectionOrError(normalizeStatusBoard(data.statusBoard)),
    priorityAction: data.priorityAction === undefined ? { error: true } : data.priorityAction,
    todayExecution: sectionOrError(normalizeTodayBoard(data.todayBoard)),
    weeklyImpact: sectionOrError(normalizeWeeklyImpact(data.weeklyImpactProjects)),
    risks: data.riskIssues === undefined ? { error: true } : data.riskIssues,

    // DASH-07 — 요일별 잔여 가용 %. 이번 정합 작업 범위는 "받아 두기"까지다
    // (UI 신설은 스토리 범위 밖, 리드 지시) — 가공 없이 배열만 통과시킨다.
    // 소비하는 화면이 생기면 이 키에서 읽으면 된다.
    busyWeekdays: Array.isArray(data.busyWeekdays) ? data.busyWeekdays : [],
  }
}

export function getDashboard() {
  return withDevFallback(
    () => apiClient.get('/dashboard'),
    async () => (await loadDashboardMock())(),
  ).then(normalizeDashboard)
}

export default getDashboard
