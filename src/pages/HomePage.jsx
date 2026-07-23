import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorState } from '../components/common/ErrorState'
import { LoadingSkeleton } from '../components/common/LoadingSkeleton'
import { ExecutionLogForm } from '../components/plan/ExecutionLogForm'
import { StatusBoard } from '../components/dashboard/StatusBoard'
import { TodayBoard } from '../components/dashboard/TodayBoard'
import { ImpactList } from '../components/dashboard/ImpactList'
import { RiskList } from '../components/dashboard/RiskList'
import { DashboardEmptyState } from '../components/dashboard/DashboardEmptyState'
import { useDashboardQuery } from '../features/dashboard/useDashboard'
import { useLogExecution } from '../features/plan/usePlanData'
import { currentWeekStartISO, weekLabelKO } from '../features/plan/planTime'
import { useAppStore, selectCanWrite } from '../store/useAppStore'
import { systemMessages } from '../constants/systemMessages'
import { useIsDesktop } from '../hooks/useMediaQuery'

// §DASH.0.4's own [가정]: the reference PNG's caption word ("진행 중") isn't the
// literal copy — the spec maps the week's PLAN status straight to text instead.
// Kept as the one place this mapping lives, pending the still-open exact-wording
// confirmation the spec itself flags.
const PLAN_STATUS_LABELS = { DRAFT: '작성 중', CONFIRMED: '확정됨' }

/*
  ST-F1-10 orchestrator (ui-spec-dash.md §DASH r2 — 판단/실행 2축 재구성). One
  GET (OP-DASH-ASSEMBLE) assembles all sections; this page owns only the
  §DASH.7 state selection (loading/error/empty/normal) and the cross-section
  wiring (navigation targets, the execution-log popover).

  r2 layout (§DASH.0.2 · §DASH.8):
    메인열(판단, 1fr):   S1 상태 보드 → S5 먼저 볼 문제(우선 행동 강조행) → S4 이번 주 투입
    보조열(실행, 320px): S3 오늘 할 일
  기준 카드(BaselineCard)는 완전히 삭제됐다 — 가용시간 값은 S1 메타 라인과,
  고정일정 충돌 건수는 S5의 고정 일정 충돌 행과 중복이었다(오너 지적, §DASH.0.1).
*/
function DashboardPage() {
  const navigate = useNavigate()
  const isDesktop = useIsDesktop()
  const dashboardQuery = useDashboardQuery()
  const logExecution = useLogExecution()
  const canWrite = useAppStore(selectCanWrite)

  const [execLog, setExecLog] = useState(null) // { block } | null
  // Client-only "just logged" overlay (PLAN-15 연계): the single dashboard GET
  // has no per-row PATCH of its own, so a successful log flips that ROW's
  // visual completion locally rather than waiting on a refetch that has no way
  // to know which today-execution row just changed.
  const [justLoggedIds, setJustLoggedIds] = useState(() => new Set())

  const data = dashboardQuery.data
  // Pure client-side computation (no server round trip) so the week caption
  // still renders even when the whole GET has failed (§DASH.7 "error" keeps the
  // shell — h1 + week caption — up while the content area shows one ErrorState).
  const weekLabel = weekLabelKO(currentWeekStartISO())
  const planStatusLabel = data ? (PLAN_STATUS_LABELS[data.planStatus] ?? PLAN_STATUS_LABELS.DRAFT) : null

  const submitExecLog = ({ actualMinutes, memo }) => {
    if (!execLog) return
    const { block } = execLog
    const endedAt = new Date(new Date(block.startAt).getTime() + actualMinutes * 60000).toISOString()
    logExecution.mutate(
      { taskId: block.taskId, body: { startedAt: block.startAt, endedAt, actualMinutes, memo } },
      {
        onSuccess: () => {
          setJustLoggedIds((prev) => new Set(prev).add(block.planBlockId))
          setExecLog(null)
        },
      },
    )
  }

  const openExecLog = (item) =>
    setExecLog({
      block: {
        planBlockId: item.id,
        title: item.title,
        startAt: item.startAt,
        endAt: item.endAt,
        estimatedMinutes: item.expectedMinutes,
        taskId: item.taskId,
      },
    })

  // §DASH.7 "error(요청 자체 실패)": the GET is already auto-retried once by the
  // global query policy (ADR-0001); past that, ONE section-wide ErrorState
  // replaces the whole content area. variant="section", NOT "page" — the page
  // shell (h1, week caption, and AppLayout's header/tabs above it) stays up.
  if (dashboardQuery.isError) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader weekLabel={weekLabel} planStatusLabel={null} />
        <ErrorState variant="section" onAction={() => dashboardQuery.refetch()} />
      </div>
    )
  }

  if (dashboardQuery.isLoading || !data) {
    const listSkeleton = (key, count) => (
      <LoadingSkeleton
        key={key}
        preset="listRow"
        count={count}
        className="rounded-card border border-border bg-surface p-4"
      />
    )
    const statusSkeleton = <LoadingSkeleton key="skel-s1" preset="statCard" />
    const riskSkeleton = listSkeleton('skel-s5', 3)
    const impactSkeleton = listSkeleton('skel-s4', 2)
    const todaySkeleton = listSkeleton('skel-s3', 3)
    return (
      <div className="flex flex-col gap-6">
        <PageHeader weekLabel={weekLabel} planStatusLabel={null} />
        {/* Same column split as the real content below (§DASH.7 loading row) —
            zero layout shift once data arrives. */}
        <TwoColumnLayout
          isDesktop={isDesktop}
          mobileOrder={[statusSkeleton, riskSkeleton, todaySkeleton, impactSkeleton]}
          desktopMain={[statusSkeleton, riskSkeleton, impactSkeleton]}
          desktopAside={[todaySkeleton]}
        />
      </div>
    )
  }

  // §DASH.6 — 프로젝트 0 · 이번 주 계획 블록 0. 보조열 없이 단일 열: S1(0값
  // 렌더 — 가용시간은 온보딩 산출물) + EmptyState. 오늘 할 일도 정의상 비어
  // 있으므로 보조열을 세울 이유가 없다(r2 §DASH.6).
  if (data.isEmpty) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader weekLabel={weekLabel} planStatusLabel={planStatusLabel} />
        <div className="flex flex-col gap-6">
          <StatusBoard
            error={data.weeklyStatus?.error}
            onRetry={() => dashboardQuery.refetch()}
            status={data.weeklyStatus?.status}
            plannedMinutes={data.weeklyStatus?.plannedMinutes}
            availableMinutes={data.weeklyStatus?.availableMinutes}
            focusWindow={data.weeklyStatus?.focusWindow}
            adjustDays={data.weeklyStatus?.adjustDays}
            onOpenWeekly={() => navigate('/weekly')}
          />
          <DashboardEmptyState />
        </div>
      </div>
    )
  }

  const items = (data.todayExecution?.items ?? []).map((item) =>
    justLoggedIds.has(item.id) ? { ...item, completed: true } : item,
  )

  // One element per section, built once and then handed to TwoColumnLayout in
  // whichever arrangement (flat mobile order vs. the two desktop columns) the
  // current breakpoint needs — see that component's header for why this is a
  // JS/render-time split rather than a single CSS grid. 우선 행동은 별도 노드가
  // 없다 — RiskList(S5)에 데이터로만 전달되어 목록 맨 위에서 강조된다.
  const statusNode = (
    <StatusBoard
      key="s1"
      error={data.weeklyStatus?.error}
      onRetry={() => dashboardQuery.refetch()}
      status={data.weeklyStatus?.status}
      plannedMinutes={data.weeklyStatus?.plannedMinutes}
      availableMinutes={data.weeklyStatus?.availableMinutes}
      focusWindow={data.weeklyStatus?.focusWindow}
      adjustDays={data.weeklyStatus?.adjustDays}
      onOpenWeekly={() => navigate('/weekly')}
    />
  )
  const todayNode = (
    <TodayBoard
      key="s3"
      error={data.todayExecution?.error}
      onRetry={() => dashboardQuery.refetch()}
      dateLabel={data.todayExecution?.dateLabel}
      expectedMinutes={data.todayExecution?.expectedMinutes}
      remainingAvailableMinutes={data.todayExecution?.remainingAvailableMinutes}
      items={items}
      canWrite={canWrite}
      offlineReason={systemMessages.offline.disabledReason}
      onLog={openExecLog}
    />
  )
  const impactNode = (
    <ImpactList
      key="s4"
      error={data.weeklyImpact?.error}
      onRetry={() => dashboardQuery.refetch()}
      projects={data.weeklyImpact?.projects}
    />
  )
  const riskNode = (
    <RiskList
      key="s5"
      // 두 원본 섹션(우선 행동·위험 목록) 중 하나라도 실패하면 병합된 카드
      // 전체를 오류로 취급한다 — 절반만 강조된 목록을 보여줄 방법이 없어서다.
      error={Boolean(data.priorityAction?.error || data.risks?.error)}
      onRetry={() => dashboardQuery.refetch()}
      priorityAction={data.priorityAction?.error ? null : data.priorityAction}
      risks={data.risks?.error || !Array.isArray(data.risks) ? [] : data.risks}
    />
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader weekLabel={weekLabel} planStatusLabel={planStatusLabel} />

      {/* 메인열(판단): 상태 보드 → 먼저 볼 문제(우선 행동 흡수) → 이번 주 투입.
          보조열(실행, 320px): 오늘 할 일 하나. §DASH.0.2 r2 최종 구성. */}
      <TwoColumnLayout
        isDesktop={isDesktop}
        mobileOrder={[statusNode, riskNode, todayNode, impactNode]}
        desktopMain={[statusNode, riskNode, impactNode]}
        desktopAside={[todayNode]}
      />

      {/* PLAN-15 실제 시간 기록 — WeeklyPage와 동일 폼을 재사용(§DASH.3). */}
      {execLog && (
        <ExecutionLogForm
          key={execLog.block.planBlockId}
          block={execLog.block}
          onClose={() => setExecLog(null)}
          onSubmit={submitExecLog}
          submitting={logExecution.isPending}
        />
      )}
    </div>
  )
}

/*
  §DASH.0의 두 컬럼 배치, CSS grid 대신 이 방식을 쓰는 이유(팀리드 확인 완료 —
  변경 금지 항목, §DASH.8):

  `grid-column`만으로 나누면 두 컬럼이 grid row를 공유해서, 한쪽이 다른 쪽보다
  훨씬 길면 짧은 쪽 다음 카드 시작 지점이 상대 컬럼 높이만큼 밀린다(실측 확인된
  버그). 두 개의 독립된 flex 컬럼은 이 결합이 구조적으로 없다 — 각자 자기
  박스이므로 상대 쪽 높이와 무관하게 바로 이어 붙는다.

  대신 "하나의 평평한 DOM으로 모바일 낭독 순서까지 동시에 만족"은 안 되므로
  (모바일은 두 컬럼을 인터리브한 순서가 필요), 브레이크포인트 분기를 CSS가
  아니라 JS(useIsDesktop — 다른 반응형 분기와 같은 훅)에서 한다:
  - 모바일: `mobileOrder` 배열을 있는 그대로 하나의 flex-col에 나열. 재배치
    트릭이 아예 없으므로 DOM=시각=Tab 순서가 항상 같다.
  - 데스크톱: `desktopMain`/`desktopAside`가 각각 독립된 flex-col 박스(보조열은
    `w-80`=320px 고정, §DASH.0.2)로 나란히 선다. 여기서의 DOM/Tab 순서는
    컬럼 단위(메인 전체 → 보조 전체)인데, 시각 순서와 일치하므로 팀리드가
    허용한 범위다(모바일과 달리 여기선 "시각=필요한 순서"이기 때문).

  각 섹션은 호출부에서 한 번만 만들어 필요한 배열에 담아 넘긴다 — `isDesktop`
  하나가 어느 브랜치를 렌더할지 정하므로 두 트리가 동시에 마운트되는 일은 없다.
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

// §DASH.0.4 + product-owner 지시(변경 금지 항목): 캡션을 제목과 같은 줄,
// 제목 오른쪽에 둔다 — 페이지 높이가 제목만 있는 다른 화면들과 같아지도록.
// items-baseline으로 서로 다른 폰트 크기의 텍스트 베이스라인을 맞춘다.
// flex-wrap은 아주 좁은 화면에서의 안전장치일 뿐, 일반 폭에서는 한 줄.
function PageHeader({ weekLabel, planStatusLabel }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h1 className="text-2xl font-bold text-text">대시보드</h1>
      <p className="text-label text-text-muted">
        {weekLabel}
        {planStatusLabel && (
          <>
            {' · '}
            <span className="font-medium text-brand-600">{planStatusLabel}</span>
          </>
        )}
      </p>
    </div>
  )
}

export default DashboardPage
