import { useNavigate } from 'react-router-dom'
import { Button } from '../common/Button'
import { EmptyBoxIcon } from './dashboardIcons'

/*
  §DASH.6 온보딩 직후 전체 빈 상태. S2~S5 네 섹션을 이 카드 하나로 대체한다(S1은
  0값으로 그대로 유지 — DashboardPage 참조). ui-spec-dash.md §DASH.8은 이 카드를
  ui-spec-proj §PROJ.11의 신규 공통 `EmptyState`와 공유할 것을 제안하지만, 그
  컴포넌트는 아직 common/에 없고(다른 담당자가 그 스토리에서 만들 예정) 이 화면
  담당 범위는 common/*을 건드리지 않는 것이라, 지금은 대시보드 전용으로 둔다 —
  공통 EmptyState가 착지하면 이 파일을 그걸로 교체하면 된다.
*/
export function DashboardEmptyState() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface px-4 py-10 text-center">
      <EmptyBoxIcon className="text-text-disabled" size={48} />
      <p className="text-body font-semibold text-text">첫 프로젝트를 만들어 시작하세요</p>
      <p className="max-w-[36ch] text-label text-text-muted">
        프로젝트와 태스크를 만들면 이번 주 상태가 여기에 표시됩니다
      </p>
      <Button variant="primary" size="lg" onClick={() => navigate('/projects?create=1')}>
        새 프로젝트
      </Button>
    </div>
  )
}

export default DashboardEmptyState
