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

// §DASH.0.4's own [가정]: the reference PNG's caption word ("진행 중") isn't the
// literal copy — the spec maps the week's PLAN status straight to text instead.
// Kept as the one place this mapping lives, pending the still-open exact-wording
// confirmation the spec itself flags.
const PLAN_STATUS_LABELS = { DRAFT: '작성 중', CONFIRMED: '확정됨' }

/*
  ST-F1-10 orchestrator (ui-spec-dash.md §DASH — 판단/실행 재구성). One
  GET (OP-DASH-ASSEMBLE) assembles all sections; this page owns only the
  §DASH.7 state selection (loading/error/empty/normal) and the cross-section
  wiring (navigation targets, the execution-log popover).

  Layout (dashboard-redesign 최종, 오너 지시 — 값/상태 로직은 그대로): 단일
  컬럼 세로 스택, 전부 full-width. 순서: S1 상태 보드(가로 배너로 내부 재구성
  — StatusBoard.jsx 참고) → S3 오늘 할 일 → S5 먼저 확인할 내용(우선 행동
  강조행) → S4 이번 주 프로젝트. 데스크톱/모바일 구조가 동일해(둘 다 같은
  flex-col) 브레이크포인트별 JS 분기가 필요 없다 — 이전 라운드들의 2컬럼/
  가로쌍/aside 실험은 전부 걷어냈다(그 경위는 DashboardLayout 주석 참고).
*/
function DashboardPage() {
  const navigate = useNavigate()
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
        {/* Same arrangement as the real content below (§DASH.7 loading row) —
            zero layout shift once data arrives. */}
        <DashboardLayout
          statusNode={statusSkeleton}
          todayNode={todaySkeleton}
          riskNode={riskSkeleton}
          impactNode={impactSkeleton}
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

  // One element per section, built once and handed to DashboardLayout below.
  // 우선 행동은 별도 노드가 없다 — RiskList(S5)에 데이터로만 전달되어 목록
  // 맨 위에서 강조된다.
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
      // dateLabel은 더 이상 TodayBoard에 넘기지 않는다(round 2, 오너 지적) —
      // PageHeader의 주차 캡션과 중복이었다. 서버/mock 필드 자체는 그대로
      // 두고(다른 소비처가 생길 수 있어 값은 안 건드림), 이 연결부만 끊는다.
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

      {/* 단일 컬럼: 상태 보드 → 오늘 할 일 → 먼저 확인할 내용(우선 행동
          흡수) → 이번 주 프로젝트. */}
      <DashboardLayout
        statusNode={statusNode}
        todayNode={todayNode}
        riskNode={riskNode}
        impactNode={impactNode}
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
  Dashboard-redesign 배치, 최종(오너 지시). 여기까지 오면서 상단 가로쌍(상태
  보드+오늘 할 일 나란히, 높이까지 강제로 맞춤)과 2컬럼(메인/320px aside)을
  차례로 시도했지만, 오너가 최종적으로 고른 건 그보다 단순한 단일 컬럼
  세로 스택이다 — 네 섹션이 전부 같은 폭으로 하나씩 쌓인다. 데스크톱과
  모바일이 완전히 같은 구조라 브레이크포인트 분기(JS든 CSS든) 자체가
  필요 없다 — 이 함수는 이제 그냥 고정 순서의 flex-col 하나다.
  전체 폭에서 상태 보드 혼자만 있으면 허전해 보이던 문제는 레이아웃이 아니라
  StatusBoard 내부를 가로 배너로 재구성해서 풀었다(그 카드 파일 참고).
*/
function DashboardLayout({ statusNode, todayNode, riskNode, impactNode }) {
  return (
    <div className="flex flex-col gap-6">
      {statusNode}
      {todayNode}
      {riskNode}
      {impactNode}
    </div>
  )
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
