import { useState } from 'react'
import { ErrorState } from '../components/common/ErrorState'
import { EmptyState } from '../components/common/EmptyState'
import { StatsToggle } from '../components/stats/StatsToggle'
import { SummaryCards, SummaryCardsSkeleton } from '../components/stats/SummaryCards'
import { TimeBandChart, TimeBandChartSkeleton } from '../components/stats/TimeBandChart'
import { DeviationPanel, DeviationPanelSkeleton } from '../components/stats/DeviationPanel'
import { useStatsSummaries, useStatsDeviations, useStatsTimePatterns } from '../features/stats/useStats'
import { useTaskCategories } from '../features/project/useProjectData'
import {
  STATS_PERIODS,
  DEFAULT_STATS_PERIOD,
  DEFAULT_DEVIATION_GROUP_BY,
} from '../features/stats/statsConstants'

/*
  ST-F1-11 orchestrator (RB-STAT-01/03 표면, Desktop.Status.png/Mobile.Status.png
  정본). Three independent GETs back this screen (summaries · deviations ·
  time-patterns, all scoped by the SAME `period` — AC-1's one toggle governs
  every section, matching the reference design's single toggle row up top).
  `groupBy` is a second, narrower toggle that only re-scopes the 편차 분석 panel
  (AC-2). Both are plain useState here — page-local UI state, not written
  anywhere else, so Zustand would be overkill (same call HomePage already makes
  for its own execLog popover state).

  TRADE-OFF: error is gated on ALL THREE queries together (dashboard's RiskList
  already sets this precedent — "두 섹션 중 하나라도 실패하면 합쳐서 오류 취급" —
  when there is no good partial-content affordance, one shared error state beats
  three independently-flickering sections). `useTaskCategories` is deliberately
  NOT part of that gate: it is a small, rarely-changing lookup list (see its own
  long staleTime) purely for AC-5's hint row, and blocking the whole page on it
  would be disproportionate to what it's for.

  LOADING is different: deviationsQuery is deliberately EXCLUDED from the
  page-level `isLoading` gate (only summaries/timePatterns block the initial
  skeleton). Reason — flipping the 편차 그룹 토글 (AC-2) changes deviationsQuery's
  key, and if that query were part of the shared gate, every groupBy flip would
  blank the ENTIRE page back to the full skeleton even though summaries/
  timePatterns already have perfectly good data. Instead deviationsQuery is
  rendered independently right where DeviationPanel sits (see the "normal"
  branch below) — its OWN isLoading (true only before its very first
  successful fetch; `useStatsDeviations`'s `keepPreviousData` keeps it false on
  every later groupBy/period change) decides Skeleton vs. real panel there.

  [버그 수정 2026-08] 이 화면은 원래 ProjectInvestmentList("이번 주 투입")·
  DelayedTaskList("지연 발생 태스크") 두 목록을 좌측 메인 컬럼에, TimeBandChart·
  DeviationPanel을 우측 320px 사이드바에 두는 2단 레이아웃(TwoColumnLayout,
  useIsDesktop)이었다 — 그런데 그 두 목록이 읽던 `projectInvestments`/
  `delayedTasks`는 정본 StatsSummary에 없는 필드다(statsApi.js normalizeSummaries
  주석 참고). 없는 데이터를 보여주는 척 대신 두 목록 컴포넌트 자체를 화면에서
  뺐고, 그 결과 메인 컬럼이 통째로 비므로 "메인 + 좁은 사이드바" 2단 구조를
  유지할 이유가 없어졌다 — 남은 두 섹션(시간대 차트 · 편차 분석)을 데스크톱에서
  나란히 2열로, 모바일에서 세로로 쌓는 단순 grid로 바꿨다(TwoColumnLayout/
  useIsDesktop 삭제). Desktop.Status.png 정본과는 이제 다른 배치이지만, 백엔드가
  낼 수 없는 데이터를 위해 빈 컬럼을 그대로 둘 수는 없었다 — 디자인 재검토가
  필요하면 팀리드/Jonnathan에게 별도 보고.
*/
function StatisticsPage() {
  const [period, setPeriod] = useState(DEFAULT_STATS_PERIOD)
  const [groupBy, setGroupBy] = useState(DEFAULT_DEVIATION_GROUP_BY)

  const summariesQuery = useStatsSummaries(period)
  const deviationsQuery = useStatsDeviations(groupBy, period)
  const timePatternsQuery = useStatsTimePatterns(period)
  const categoriesQuery = useTaskCategories()

  const isError = summariesQuery.isError || deviationsQuery.isError || timePatternsQuery.isError
  const isLoading = summariesQuery.isLoading || timePatternsQuery.isLoading || !summariesQuery.data

  const retryAll = () => {
    summariesQuery.refetch()
    deviationsQuery.refetch()
    timePatternsQuery.refetch()
  }

  // AC-1 기간 토글은 loading/error/empty 어느 상태에서도 살아 있다 — 다른 기간을
  // 눌러 보는 것 자체가 이 화면에서 벗어나지 않고 취할 수 있는 유일한 다음
  // 행동이라서다(DashboardPage의 PageHeader가 error/loading에서도 유지되는
  // 이유와 동일, ui-spec-dash §DASH.7).
  const header = (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <h1 className="text-2xl font-bold text-text">통계</h1>
      <StatsToggle options={STATS_PERIODS} value={period} onChange={setPeriod} ariaLabel="기간 선택" size="lg" />
    </div>
  )

  if (isError) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ErrorState variant="section" onAction={retryAll} />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <SummaryCardsSkeleton />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <TimeBandChartSkeleton />
          <DeviationPanelSkeleton />
        </div>
      </div>
    )
  }

  const summaries = summariesQuery.data

  // AC-4 이력 0 빈 상태 — 오류가 아니다(실 서버는 200 + `empty:true`로 알린다,
  // statsApi.js normalizeSummaries 참고). 카드·차트·편차 패널을 전부 EmptyState
  // 하나로 대체하되 헤더(제목+기간 토글)는 유지한다 — 사용자가 다른 기간을
  // 시도해 볼 수 있어야 하기 때문.
  if (!summaries.hasHistory) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <EmptyState
          title="아직 수행 이력이 없어요"
          description="태스크를 완료 처리하고 실제 수행 시간을 기록하면 이 기간의 통계가 여기에 표시됩니다."
        />
      </div>
    )
  }

  const deviations = deviationsQuery.data ?? []
  const timePatterns = timePatternsQuery.data ?? { bands: [], summary: '' }
  // W3: useTaskCategories now returns the real preset OBJECTS
  // ({taskCategoryId, name, sortOrder, createdAt}), not bare name strings —
  // but DeviationPanel's own `categories` prop (AC-5 "카테고리 미사용" hint)
  // compares against deviations' `label`, which the [가정—확장] stats
  // endpoint still groups by NAME (statsApi.getCorrectionProposal's own
  // header explains why that endpoint was never migrated to categoryId).
  // Extracting `.name` here is the one adapter this page needs — DeviationPanel
  // itself is unchanged.
  const categories = (categoriesQuery.data ?? []).map((c) => c.name)

  return (
    <div className="flex flex-col gap-6">
      {header}
      <SummaryCards
        period={period}
        completionRate={summaries.completionRate}
        totalEstimatedMinutes={summaries.totalEstimatedMinutes}
        totalActualMinutes={summaries.totalActualMinutes}
        varianceRate={summaries.varianceRate}
      />
      {/* ProjectInvestmentList/DelayedTaskList가 빠지며 남은 두 섹션만 있어
          (위 헤더 주석의 [버그 수정 2026-08]) 데스크톱은 2열, 모바일은 1열로
          쌓는 단순 grid를 쓴다 — deviationsQuery는 페이지 로딩 게이트 밖에
          있으므로(위 헤더 주석) 여기서 그 자신의 isLoading을 직접 보고
          스켈레톤/실패널을 고른다: 첫 로딩(true)에서만 스켈레톤이고, groupBy를
          바꿔 새 키로 재요청하는 동안은 keepPreviousData 덕에 isLoading이
          false로 유지돼 이전 목록이 그대로 보인다. */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <TimeBandChart bands={timePatterns.bands} summary={timePatterns.summary} />
        {deviationsQuery.isLoading ? (
          <DeviationPanelSkeleton />
        ) : (
          <DeviationPanel
            groupBy={groupBy}
            onGroupByChange={setGroupBy}
            deviations={deviations}
            categories={categories}
          />
        )}
      </div>
    </div>
  )
}

export default StatisticsPage
