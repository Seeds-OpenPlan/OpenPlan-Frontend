import { useNavigate } from 'react-router-dom'
import { AuthShell } from '../../components/auth/AuthShell'
import { Button } from '../../components/common/Button'

/*
  SCR-LANDING — 비인증 진입점. 로그인/회원가입 화면과 같은 AuthShell(브랜드
  마크+워드마크+태그라인)을 그대로 쓴다 — 랜딩의 "서비스 소개" 역할을 그
  헤더 자체가 이미 하고 있어(로고+태그라인), 별도 히어로 레이아웃을 새로
  만들지 않고 이 화면군의 첫 화면으로 재사용한다.

  3개 가치 제안 불릿은 [가정-확장] 카피 — ui-spec §AUTH가 아직 이 화면의
  문구를 확정하지 않아, 서비스 개요(00. 작업 분배 안내)가 이미 쓰는 핵심
  기능 3축(계획 검증·재계획·실행 기록)을 그대로 옮겼다.
*/
const VALUE_PROPS = [
  { title: '계획을 세우면 바로 검증합니다', body: '겹침·충돌·가용시간 초과를 저장 전에 알려줘요' },
  { title: '무리한 주에는 대안을 제안해요', body: '마감 우선·최소 변경 등 재계획 3안 중 골라 적용' },
  { title: '실제 소요 시간을 기록해 다음 계획에 반영', body: '예상과 실제의 차이를 통계로 보여줘요' },
]

export function LandingPage() {
  const navigate = useNavigate()

  return (
    <AuthShell>
      <ul className="flex flex-col gap-3">
        {VALUE_PROPS.map((v) => (
          <li key={v.title} className="rounded-control border border-border bg-surface-sunken p-3">
            <p className="text-label font-medium text-text">{v.title}</p>
            <p className="text-caption text-text-muted">{v.body}</p>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2">
        <Button variant="primary" size="lg" onClick={() => navigate('/login')}>
          로그인
        </Button>
        <Button variant="secondary" size="lg" onClick={() => navigate('/signup')}>
          회원가입
        </Button>
      </div>
    </AuthShell>
  )
}

export default LandingPage
