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
  /*
    [PR #81 AI 리뷰 "확인 필요" #1] 이전 버전은 PATCH를 시작하기 **전에**
    `setConfirmOpen(false)`로 다이얼로그부터 닫고, `suppressPendingSelfBack()`은
    PATCH가 성공한 뒤에야 불렀다 — "닫기"(그래서 스택이 0이 되어 재확인이 예약됨)와
    "억제 신호"(navigate 직전) 사이에 실 네트워크 왕복만큼의 간격이 생긴 것이다.
    overlayHistory.js의 더블 rAF 재확인은 그 네트워크 왕복보다 훨씬 먼저 끝나므로,
    억제가 걸리기도 전에 이미 self-back()이 불려 버렸다 — `suppressPendingSelfBack`의
    "navigate() 바로 앞에서 호출"이라는 계약이 이 호출부에서는 보호가 되지 못했다는
    뜻이다(리뷰에서 지적된 S2 재발 변형).

    고친 버전은 다른 "닫기+이동" 호출부(SettingsAccountPage 로그아웃,
    SessionExpiredOverlay, NotificationBell, SettingsLayout — 전부 "닫는 상태 갱신 →
    suppress → navigate"가 **같은 동기 콜백 안**에서 일어난다)와 같은 모양으로
    맞춘다 — 다이얼로그는 PATCH가 성공할 때까지 열어 두고(확인 버튼에 loading/disabled
    상태만 보여 준다, 아래 dialogBody의 `loading={updateOnboardingProgress.isPending}`),
    onSuccess 한 곳에서 "닫기 → 억제 → 이동"을 순서대로, 같은 틱에 처리한다. 이러면
    "닫기"가 실제로 일어나는 시점과 "억제 신호"가 항상 함께 붙어 있어 저 계약이 성립한다.
  */
  const confirmRestart = () => {
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
          // 닫기 → 억제 신호 → 이동, 이 순서로 같은 동기 콜백 안에서 — 위 함수 헤더 참고.
          setConfirmOpen(false)
          suppressPendingSelfBack()
          navigate('/')
        },
        onError: () => {
          // 실패하면 이동하지 않으므로 억제도 필요 없다 — 그냥 닫는다. 에러 토스트는
          // useUpdateOnboardingProgress 공통 onError(useOnboarding.js)가 이미 띄운다.
          setConfirmOpen(false)
        },
      },
    )
  }

  /*
    [PR #81 AI 리뷰 Should-fix, 이어지는 경합] 위 설계대로 다이얼로그를 PATCH 성공까지
    열어 두면, 그 대기 중에도 취소/Esc/백드롭/하드웨어 뒤로 가기로 "닫을" 수 있다는
    문제가 새로 생긴다 — 사용자가 취소로 닫아도 이미 날아간 PATCH는 계속 진행되고,
    그게 성공하면 onSuccess가 그대로 `resetTutorialStep`+`navigate('/')`를 실행해
    버린다("취소했는데 재시작되는" 경합).

    고친 버전은 pending 동안 다이얼로그를 **닫을 수 없게** 만든다 — `onClose`를
    `isPending`이면 Dialog/BottomSheet에 아예 넘기지 않는다(`undefined`). 이 한
    지점만 바꾸면 Esc·백드롭 클릭(Dialog.jsx/BottomSheet.jsx 둘 다 `onClose`가
    없으면 그 자리에서 끝낸다)과 BottomSheet 드래그 핸들(`onClose` 없으면 버튼이 아닌
    장식용 span)이 전부 같이 막힌다 — OVL-CONFLICT("선택만이 유일한 출구")가 이미
    쓰는, 이 코드베이스의 기존 "닫을 수 없는 오버레이" 관례 그대로다.

    하드웨어 뒤로 가기는 별도 경로(`useOverlayBackButton.js`)라 같은 `onClose` 체크로
    저절로 막히는지 직접 확인했다 — `onPopState`는 `!onCloseRef.current`(= onClose가
    undefined)일 때 오버레이를 닫는 대신 `ensureOverlayEntry()`로 소비된 히스토리
    엔트리를 다시 push한다(그 함수 자신의 주석: "닫을 수 없는 오버레이 — 소비된
    엔트리를 되돌려 놓는다"). 즉 ConflictOverlay가 이미 쓰는 바로 그 경로라, 여기서
    새로 만들 것 없이 `onClose`를 끊는 것 하나로 Esc·백드롭·드래그 핸들·하드웨어
    뒤로 가기가 전부 일관되게 막힌다.

    onSuccess 시점에 "다이얼로그가 아직 이 요청을 기다리고 있는지" 별도 ref로 재확인
    하는 방어는 넣지 않았다 — 위 네 경로를 전부 막았으므로 pending 중 이 다이얼로그를
    사용자 조작으로 닫을 방법이 아예 없고(Dialog는 전체 화면 백드롭 + 포커스 트랩이라
    바깥 클릭으로 다른 화면 조작도 못 한다), 그래서 onSuccess가 불릴 때 다이얼로그는
    항상 그 요청을 시작했던 바로 그 열림 상태 그대로다 — ref가 지켜 줄 "이미 닫힌/
    다른 요청으로 바뀐" 경우 자체가 생기지 않는다.
  */
  const confirmPending = updateOnboardingProgress.isPending
  const closeDialog = confirmPending ? undefined : () => setConfirmOpen(false)

  const dialogBody = (
    <div className="flex flex-col gap-4">
      <h2 id={TITLE_ID} className="text-title font-semibold text-text">
        {onboardingCopy.tutorial.restartTitle}
      </h2>
      <p className="text-body text-text-muted">{onboardingCopy.tutorial.restartBody}</p>
      <div className="mt-1 flex justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          size="md"
          disabled={confirmPending}
          onClick={() => setConfirmOpen(false)}
        >
          {onboardingCopy.tutorial.restartCancel}
        </Button>
        <Button
          ref={confirmBtnRef}
          type="button"
          variant="primary"
          size="md"
          loading={confirmPending}
          onClick={confirmRestart}
        >
          {onboardingCopy.tutorial.restartConfirm}
        </Button>
      </div>
    </div>
  )

  const dialog =
    confirmOpen &&
    (isDesktop ? (
      <Dialog open onClose={closeDialog} labelledById={TITLE_ID} initialFocusRef={confirmBtnRef}>
        {dialogBody}
      </Dialog>
    ) : (
      <BottomSheet open onClose={closeDialog} labelledById={TITLE_ID} initialFocusRef={confirmBtnRef}>
        {dialogBody}
      </BottomSheet>
    ))

  return { requestRestart: () => setConfirmOpen(true), dialog }
}

export default useTutorialRestart
