import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '../common/Badge'
import { ErrorState } from '../common/ErrorState'
import { CheckCircleIcon } from '../common/statusIcons'
import { compareBySeverity, severityLabels } from '../../features/plan/violationMessages'
import { resolveIssueCopy } from '../../features/dashboard/dashboardIssueCopy'
import { resolveAction } from '../../features/dashboard/actionRouting'

/*
  S5 · 먼저 확인할 내용 — DASH-03·04에 더해 S2 우선 행동(DASH-02·RB-DASH-01)까지
  흡수한다 (product-owner 지시, ui-spec-dash.md §DASH.2/§DASH.5 대비 델타 — 사양
  갱신 필요, 리드에게 보고됨). RB-DASH-01 원문이 "미배치 태스크·마감 임박 태스크
  ·고정 일정 충돌·가용 시간 초과 중 둘 이상 동시 존재 시 최고 우선순위 규칙으로
  선정된 행동"이라고 정의하는 이상, `priorityAction`은 이 목록과 같은 문제
  집합에서 뽑힌 한 항목이다 — 별도 카드로 다시 보여주면 같은 정보가 두 번
  노출되므로, 목록 맨 위에서 강조만 한다.

  강조는 색만으로 하지 않는다(NFR-017) — severity 배지 옆에 "우선 행동" 배지를
  병기하고, isPriority 행은 테두리로도 구분한다. `priorityAction`과 `risks`가
  서로 다른 문제일 수도 있어(맨 위에 별도 항목으로 추가) `id`가 겹칠 때만(서버가
  실제로 같은 리소스를 가리키는 경우) 같은 행에 강조만 얹는다 — 계약이 없어 이
  dedup은 방어적 조치일 뿐이다.

  dashboard-redesign delta (오너 목업, round 2 — 컴팩트화): 각 행을 여러 줄
  (배지+source 줄, 본문 줄, 별도 액션 버튼)에서 한 줄 [severity 배지] [내용
  텍스트(truncate)] [우선 행동 배지]로 압축했다. `risk.source`(예: "주간
  계획") 표시와 행별 액션 Button은 빠졌다 — 대신 행 전체가 버튼이 되어 클릭하면
  기존에 그 Button이 하던 이동(`resolveAction`의 route)을 그대로 수행한다.
  ImpactList의 "행 전체가 Link" 패턴(`-mx-2 ... px-2` 오프셋)과 같은 자리에서
  같은 트릭을 쓰되, 목적지가 외부 라우트 하나로 고정되지 않고 서버가 준
  actionType마다 달라 Link 대신 `navigate()`를 호출하는 네이티브 <button>이다.
  route가 없는 행(서버가 이 build가 모르는 actionType을 보낸 경우)은 여전히
  비인터랙티브 <div>로 남는다 — "갈 곳 없는 버튼"보다 "문제만 알려주는 텍스트"가
  낫다는 기존 판단은 그대로다.
*/
export function RiskList({ error = false, onRetry, priorityAction = null, risks = [] }) {
  const navigate = useNavigate()

  const sorted = useMemo(() => {
    const base = Array.isArray(risks) ? risks : []
    if (!priorityAction) return [...base].sort(compareBySeverity)

    const matchIndex = priorityAction.id ? base.findIndex((r) => r.id === priorityAction.id) : -1
    const withPriority =
      matchIndex >= 0
        ? base.map((r, i) => (i === matchIndex ? { ...r, isPriority: true } : r))
        : [{ ...priorityAction, isPriority: true }, ...base]

    // 우선 행동은 severity와 무관하게 항상 맨 위 — RB-DASH-01이 이미 "최고
    // 우선순위 규칙"으로 골라준 결과이므로, 나머지는 기존 차단>경고 정렬 그대로.
    return [...withPriority].sort((a, b) => {
      if (a.isPriority && !b.isPriority) return -1
      if (!a.isPriority && b.isPriority) return 1
      return compareBySeverity(a, b)
    })
  }, [risks, priorityAction])

  if (error) {
    return (
      <section>
        <h2 className="mb-2 text-title font-semibold text-text">먼저 확인할 내용</h2>
        <ErrorState variant="section" onAction={onRetry} />
      </section>
    )
  }

  // 통합된 긍정 카드 자리(구 AC-3): 우선 행동도 없고 나열할 위험도 없을 때만 —
  // 즉 정말로 "아무 문제 없음"일 때만 보여준다. 위험은 있는데 우선 행동만
  // 없는 경우(RB-DASH-01의 "둘 이상 동시 존재" 조건 미충족)는 목록이 비어
  // 있지 않으므로 그대로 나열한다.
  if (!priorityAction && sorted.length === 0) {
    return (
      <div className="rounded-card border border-border bg-surface p-4">
        <h2 className="text-title font-semibold text-text">먼저 확인할 내용</h2>
        <div className="mt-2 flex items-start gap-2">
          <CheckCircleIcon className="mt-0.5 shrink-0 text-success-600" size={20} />
          <div>
            <p className="text-body font-medium text-text">지금 처리할 문제가 없습니다</p>
            <p className="mt-0.5 text-label text-text-muted">계획대로 진행하면 됩니다</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <h2 className="text-title font-semibold text-text">먼저 확인할 내용</h2>
      <ul className="mt-2 divide-y divide-border">
        {sorted.map((risk) => {
          const copy = resolveIssueCopy(risk)
          const route = resolveAction(risk.actionType, risk.actionParams)
          // 행 전체 클릭 타깃의 공통 클래스 — route가 있을 때만 hover/focus
          // 상태를 얹는다(정말로 클릭 가능한 행만 그렇게 보이도록).
          const rowClass = [
            '-mx-2 flex w-full items-center gap-2 rounded-control px-2 py-2.5 text-left transition-colors',
            route
              ? 'hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring'
              : '',
            risk.isPriority ? 'border border-brand-200 bg-brand-50/60' : '',
          ].join(' ')
          const rowContent = (
            <>
              <Badge
                tone={copy.severity === 'blocking' ? 'danger' : 'warning'}
                label={severityLabels[copy.severity]}
              />
              <span className="min-w-0 flex-1 truncate text-label font-medium text-text">{copy.text}</span>
              {risk.isPriority && <Badge tone="brand" label="우선 행동" />}
            </>
          )
          return (
            <li key={risk.id}>
              {route ? (
                <button type="button" className={rowClass} onClick={() => navigate(route.to)}>
                  {rowContent}
                </button>
              ) : (
                <div className={rowClass}>{rowContent}</div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default RiskList
