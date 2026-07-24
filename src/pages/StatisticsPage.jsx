import { useState } from 'react'
import { ErrorState } from '../components/common/ErrorState'
import { EmptyState } from '../components/common/EmptyState'
import { StatsToggle } from '../components/stats/StatsToggle'
import { SummaryCards, SummaryCardsSkeleton } from '../components/stats/SummaryCards'
import { ProjectInvestmentList, ProjectInvestmentListSkeleton } from '../components/stats/ProjectInvestmentList'
import { DelayedTaskList, DelayedTaskListSkeleton } from '../components/stats/DelayedTaskList'
import { TimeBandChart, TimeBandChartSkeleton } from '../components/stats/TimeBandChart'
import { DeviationPanel, DeviationPanelSkeleton } from '../components/stats/DeviationPanel'
import { useStatsSummaries, useStatsDeviations, useStatsTimePatterns } from '../features/stats/useStats'
import { useCategories } from '../features/project/useProjectData'
import {
  STATS_PERIODS,
  DEFAULT_STATS_PERIOD,
  DEFAULT_DEVIATION_GROUP_BY,
} from '../features/stats/statsConstants'
import { useIsDesktop } from '../hooks/useMediaQuery'

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
  three independently-flickering sections). `useCategories` is deliberately NOT
  part of that gate: it is a small, rarely-changing lookup list (see its own
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
*/
function StatisticsPage() {
  const isDesktop = useIsDesktop()
  const [period, setPeriod] = useState(DEFAULT_STATS_PERIOD)
  const [groupBy, setGroupBy] = useState(DEFAULT_DEVIATION_GROUP_BY)

  const summariesQuery = useStatsSummaries(period)
  const deviationsQuery = useStatsDeviations(groupBy, period)
  const timePatternsQuery = useStatsTimePatterns(period)
  const categoriesQuery = useCategories()

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
    const mainSkeleton = [
      <ProjectInvestmentListSkeleton key="pil" />,
      <DelayedTaskListSkeleton key="dtl" />,
    ]
    const asideSkeleton = [<TimeBandChartSkeleton key="tbc" />, <DeviationPanelSkeleton key="dp" />]
    return (
      <div className="flex flex-col gap-6">
        {header}
        <SummaryCardsSkeleton />
        <TwoColumnLayout
          isDesktop={isDesktop}
          mobileOrder={[...mainSkeleton, ...asideSkeleton]}
          desktopMain={mainSkeleton}
          desktopAside={asideSkeleton}
        />
      </div>
    )
  }

  const summaries = summariesQuery.data

  // AC-4 이력 0 빈 상태 — 오류가 아니다(§07 API 명세서 /stats/summaries의 204
  // "조회 기간 내 통계 없음" 분기, statsApi.js normalizeSummaries 참고). 카드·
  // 목록·차트·편차 패널을 전부 EmptyState 하나로 대체하되 헤더(제목+기간
  // 토글)는 유지한다 — 사용자가 다른 기간을 시도해 볼 수 있어야 하기 때문.
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
  const categories = categoriesQuery.data ?? []

  const mainNodes = [
    <ProjectInvestmentList key="pil" projects={summaries.projectInvestments} />,
    <DelayedTaskList key="dtl" tasks={summaries.delayedTasks} />,
  ]
  // deviationsQuery는 페이지 로딩 게이트 밖에 있으므로(위 헤더 주석) 여기서
  // 그 자신의 isLoading을 직접 보고 스켈레톤/실패널을 고른다 — 첫 로딩(true)
  // 에서만 스켈레톤이고, groupBy를 바꿔 새 키로 재요청하는 동안은
  // keepPreviousData 덕에 isLoading이 false로 유지돼 이전 목록이 그대로 보인다.
  const asideNodes = [
    <TimeBandChart key="tbc" bands={timePatterns.bands} summary={timePatterns.summary} />,
    deviationsQuery.isLoading ? (
      <DeviationPanelSkeleton key="dp" />
    ) : (
      <DeviationPanel
        key="dp"
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        deviations={deviations}
        categories={categories}
      />
    ),
  ]

  return (
    <div className="flex flex-col gap-6">
      {header}
      <SummaryCards
        period={period}
        completionRate={summaries.completionRate}
        totalTime={summaries.totalTime}
        avgDeviation={summaries.avgDeviation}
        delayedTaskCount={summaries.delayedTaskCount}
      />
      <TwoColumnLayout
        isDesktop={isDesktop}
        mobileOrder={[...mainNodes, ...asideNodes]}
        desktopMain={mainNodes}
        desktopAside={asideNodes}
      />
    </div>
  )
}

/*
  DashboardPage(HomePage.jsx)와 같은 이유로 같은 모양을 이 파일에도 그대로
  둔다 — 두 독립된 flex 컬럼(그리드 row 공유 없음)이라야 한쪽이 길어져도
  다른 쪽 다음 카드가 밀리지 않고, 모바일/데스크톱 순서 분기는 JS(useIsDesktop)
  에서 한다(자세한 이유는 HomePage.jsx의 TwoColumnLayout 주석 참고 — 페이지마다
  반복되는 이 트레이드오프는 팀리드가 이미 확인한 사항이라 공용화하지 않고
  그대로 둔다).
*/
function TwoColumnLayout({ isDesktop, mobileOrder, desktopMain, desktopAside }) {
  if (isDesktop) {
    return (
      <div className="flex flex-row items-start gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-6">{desktopMain}</div>
        <div className="flex w-80 shrink-0 flex-col gap-6">{desktopAside}</div>
      </div>
    )
  }
  return <div className="flex flex-col gap-6">{mobileOrder}</div>
}

export default StatisticsPage
