import { useNavigate } from 'react-router-dom'
import { Button } from '../common/Button'

/*
  §DASH.6 온보딩 직후 전체 빈 상태. S2~S5 네 섹션을 이 카드 하나로 대체한다(S1은
  0값으로 그대로 유지 — DashboardPage 참조). ui-spec-dash.md §DASH.8은 이 카드를
  ui-spec-proj §PROJ.11의 신규 공통 `EmptyState`와 공유할 것을 제안하지만, 이
  카드는 size="lg"(48px 터치 타겟) 버튼 + font-semibold 제목을 쓰는 반면 공통
  EmptyState는 size="md" 버튼 + font-medium 제목으로 고정돼 있어 — 지금 그대로
  바꿔 끼우면 이 화면만 조용히 버튼이 작아지고 제목이 가늘어진다. 그 차이를
  오너 승인 없이 지우는 대신 대시보드 전용으로 유지하고, 오너의 "빈 박스 제거"
  결정만 반영한다(장식 아이콘 삭제, py-10→py-8로 축소 — 공통 EmptyState가 아이콘
  제거 때 같은 이유로 조정한 값과 동일선상).
*/
export function DashboardEmptyState() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface px-4 py-8 text-center">
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
