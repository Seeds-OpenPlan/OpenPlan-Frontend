import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog } from '../../components/common/Dialog'
import { BottomSheet } from '../../components/common/BottomSheet'
import { Button } from '../../components/common/Button'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import { useUpdateOnboardingProgress } from './useOnboarding'
import { onboardingCopy } from './onboardingCopy'

const TITLE_ID = 'tutorial-restart-title'

/*
  TUT-09 재실행 확인 다이얼로그 + 재시작 동작. Originally lived inline in
  SettingsLayout.jsx (그 화면의 "지원 및 정보" 행 하나가 유일한 진입점이던
  시절); ST-F1-15 AC-3이 FAQ 상단 배너를 두 번째 진입점(SC-12)으로 요구하면서
  여기로 뽑아냈다 — 두 호출부가 똑같은 확인 문구·같은 리셋 로직을 각자
  베껴 쓰면 나중에 한쪽만 고쳐지는 사고가 나기 쉽다.

  트리거(버튼/행의 마크업)는 호출자마다 다르므로(설정 허브의 목록 행 vs FAQ
  배너의 버튼) 여기서는 "열기" 함수와 렌더할 다이얼로그 엘리먼트만 돌려주고,
  실제 트리거 자체는 호출자가 그린다.
*/
export function useTutorialRestart() {
  const navigate = useNavigate()
  const isDesktop = useIsDesktop()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const confirmBtnRef = useRef(null)
  const updateOnboardingProgress = useUpdateOnboardingProgress()

  // 확인 후 progress를 kickoff 상태로 되돌리고 대시보드로 이동하면, 거기
  // 상시 마운트된 TutorialOverlay(AppLayout)가 갱신된 캐시를 그대로 읽어
  // TUT-01 킥오프부터 다시 시작한다 — 별도의 "재생 시작" 신호가 필요 없다.
  //
  // [한계] 결정문 §4.4가 원하는 "잔존 샘플 정리"는 실제로 하지 않는다 — 이전
  // 실행에서 만든 샘플 프로젝트/태스크는 실기능으로 생성되어 "샘플" 표식이
  // 없어 이 스토리 범위에서 안전하게 식별·삭제할 방법이 없다(오탐으로
  // 사용자의 실제 프로젝트를 지울 위험). 문구(restartBody)는 이 한계에 맞춰
  // 이미 정정되어 있다(onboardingCopy.js 자신의 주석 참고).
  const confirmRestart = () => {
    setConfirmOpen(false)
    updateOnboardingProgress.mutate(
      { tutorialCompleted: false, tutorialSkipped: false, tutorialStep: 0 },
      { onSuccess: () => navigate('/') },
    )
  }

  const dialogBody = (
    <div className="flex flex-col gap-4">
      <h2 id={TITLE_ID} className="text-title font-semibold text-text">
        {onboardingCopy.tutorial.restartTitle}
      </h2>
      <p className="text-body text-text-muted">{onboardingCopy.tutorial.restartBody}</p>
      <div className="mt-1 flex justify-end gap-2">
        <Button type="button" variant="secondary" size="md" onClick={() => setConfirmOpen(false)}>
          {onboardingCopy.tutorial.restartCancel}
        </Button>
        <Button ref={confirmBtnRef} type="button" variant="primary" size="md" onClick={confirmRestart}>
          {onboardingCopy.tutorial.restartConfirm}
        </Button>
      </div>
    </div>
  )

  const dialog =
    confirmOpen &&
    (isDesktop ? (
      <Dialog open onClose={() => setConfirmOpen(false)} labelledById={TITLE_ID} initialFocusRef={confirmBtnRef}>
        {dialogBody}
      </Dialog>
    ) : (
      <BottomSheet
        open
        onClose={() => setConfirmOpen(false)}
        labelledById={TITLE_ID}
        initialFocusRef={confirmBtnRef}
      >
        {dialogBody}
      </BottomSheet>
    ))

  return { requestRestart: () => setConfirmOpen(true), dialog }
}

export default useTutorialRestart
