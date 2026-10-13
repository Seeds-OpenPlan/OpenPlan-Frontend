import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog } from '../../components/common/Dialog'
import { BottomSheet } from '../../components/common/BottomSheet'
import { Button } from '../../components/common/Button'
import { useLockedIsDesktop } from '../../hooks/useMediaQuery'
import { useSession } from '../auth/useAuth'
import { useUpdateOnboardingProgress } from './useOnboarding'
import { resetTutorialStep } from '../tutorial/tutorialProgressStore'
import { onboardingCopy } from './onboardingCopy'
import { suppressPendingSelfBack } from '../../utils/overlayHistory'

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
  const [confirmOpen, setConfirmOpen] = useState(false)
  // D1: 다이얼로그는 `confirmOpen`으로 토글된다 — 열려 있는 동안 셸이 안
  // 바뀌게 열리는 시점에 고정한다.
  const isDesktop = useLockedIsDesktop(confirmOpen)
  const confirmBtnRef = useRef(null)
  const sessionQuery = useSession()
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
    /*
      The FE-only step cursor (tutorialProgressStore.js) is reset in onSuccess,
      AFTER the server PATCH confirms `tutorialCompleted:false` — not before,
      and not unconditionally. Two reasons, one load-bearing and one just for
      symmetry/safety with TutorialOverlay's own `finish` (Thomas code review
      BLOCKER fixed there; this hook got the analogous question asked of it):

      1. Unlike `finish`'s bug, resetting early here was never actually
         VISIBLE: TutorialOverlay's `running` gate requires tutorialCompleted
         to already be false, which it still isn't during this PATCH's flight
         (old value `true` persists in the cache until onSuccess) — so a
         stale step=0 sitting around while running stays false renders
         nothing regardless of order.
      2. It still matters on FAILURE: resetting unconditionally used to throw
         away the step cursor even when the server rejected the restart,
         leaving a "reset but not actually restarted" local state with no
         real consequence today, but no reason to keep it either. Only
         resetting on success keeps this hook correct by the same rule as
         `finish` — the local cursor only ever moves once the server has
         confirmed the state it's being reset FOR.

      Resetting here (not inside TutorialOverlay) rather than there matters
      regardless of ordering: THIS hook's instance (Settings/FAQ) is a
      different component from the one actually rendering the Coachmark
      (AppLayout) — the shared module-level store is what makes the reset
      visible there too, on the very next render, with no remount required.
    */
    updateOnboardingProgress.mutate(
      { tutorialCompleted: false },
      {
        onSuccess: () => {
          resetTutorialStep(sessionQuery.data?.userId)
          // 이 다이얼로그를 닫은 것(맨 위 setConfirmOpen(false))과 PATCH 성공 뒤의 이동이
          // 겹치는 경우다 — overlayHistory.js의 self-back() 지연 재확인 창(두 프레임)보다
          // 이 PATCH가 더 오래 걸리면(실 네트워크 왕복) 재확인이 먼저 self-back()을 불러
          // 버려, 뒤이은 이 navigate('/')가 그 back()과 경합해 킥오프 다이얼로그가 0.1초
          // 보였다가 사라지는 사고(TUT-09, owner 리뷰 S2)로 이어질 수 있다. navigate()
          // 바로 앞에서 알려 그 재확인이 포기하게 한다.
          suppressPendingSelfBack()
          navigate('/')
        },
      },
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
