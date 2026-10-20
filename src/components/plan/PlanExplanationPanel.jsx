import { useId, useRef, useState } from 'react'
import { Dialog } from '../common/Dialog'
import { BottomSheet } from '../common/BottomSheet'
import { Button } from '../common/Button'
import { ErrorState } from '../common/ErrorState'
import { SkeletonText } from '../common/Skeleton'
import { SpinnerIcon } from '../common/statusIcons'
import { useLockedIsDesktop } from '../../hooks/useMediaQuery'
import { useGeneratePlanExplanation } from '../../features/plan/usePlanData'
import { systemMessages } from '../../constants/systemMessages'

/*
  AI 설명 — on-demand AI explanation of the CURRENT weekly plan (POST
  /weekly-plans/{id}/explanation, no body). A trigger button near the
  plan/validation area opens a small overlay panel (same Dialog/mobile
  BottomSheet shell ReviewPanel uses, for one consistent overlay style across
  this screen) that shows the generated text.

  Deliberately an OVERLAY, not an inline card between SummaryBar and the
  calendar grid: WeeklyPage measures the grid's available height off two DOM
  landmarks (gridWrapperRef/floatingControlsRef) on resize/week-change ONLY —
  see that file's own `measure()` effect header. An inline card whose height
  changes as the explanation loads/arrives would move `gridWrapperRef`'s top
  WITHOUT re-triggering that measurement, leaving `gridMaxHeight` stale (a
  grid that's too short, or a scrollbar that shouldn't be there) until the
  next resize. An overlay renders in a portal outside this flow, so it can
  never do that; the trigger BUTTON itself stays in flow (right under
  PlanHeader — see WeeklyPage's render), but its height is constant across
  every mutation state (loading swaps the label for a spinner, same `h-8`
  class — Button.jsx), so its mere presence never perturbs the measurement
  either.

  `open` (this panel's own visibility) is tracked separately from the
  mutation's status on purpose: closing the panel must NOT throw away a
  result that already loaded (AppError or text) — reopening via the same
  trigger shows it again with no new request. The only thing that re-requests
  is the explicit "다시 생성" button inside the panel (spec: "re-requesting
  replaces the previous explanation").

  `key={weekStartISO}` at the call site (WeeklyPage) remounts this component
  on week change — the simplest way to satisfy "clear it when switching to a
  different plan/week" (a fresh mutation + `open=false`), no extra effect
  needed.
*/

const AI_UNAVAILABLE_COPY = '지금은 AI 설명을 만들 수 없습니다. 잠시 후 다시 시도해 주세요.'

// 상태 코드별로 다른 문구를 보여준다(팀장 지시). 이 화면 다른 쓰기들의 공통
// 패턴(onError 토스트 하나로 뭉개기)을 그대로 쓰면 503 계열(모델 일시 불가)과
// 그 외 실패가 똑같은 문구가 된다. 네트워크 오류·상태 없음(클라이언트
// 타임아웃도 같은 코드로 떨어진다 — api/client.js 헤더의 E-NET-OFFLINE)과
// 5xx는 "곧 다시 시도하면 될 수 있는" 쪽으로 묶고, 그 외(예: 계획을 찾을 수
// 없는 404)는 시스템 공통 실패 문구로 떨어진다.
function explanationErrorCopy(error) {
  if (!error) return null
  const status = error.status
  const looksTemporary = error.isNetwork || status == null || status >= 500
  return looksTemporary ? AI_UNAVAILABLE_COPY : systemMessages.error.writeTitle
}

function PanelBody({ titleId, closeRef, isPending, errorCopy, explanation, onRegenerate, onClose }) {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 id={titleId} className="text-title font-bold text-text">
          AI 설명
        </h2>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="rounded-control px-2 py-1 text-label text-text-muted hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          닫기
        </button>
      </div>

      {errorCopy ? (
        // ErrorState variant="inline"은 role="alert"로 스스로 안내한다(SR이
        // 즉시 읽는다) — 바깥에 또 aria-live를 씌우면 일부 스크린리더에서
        // 두 번 읽힌다. 이 화면 다른 곳(TicketCreateForm)도 ErrorState를
        // 그냥 그대로 쓰지 별도 aria-live로 감싸지 않는다 — 같은 선택.
        <ErrorState variant="inline" title={errorCopy} actionLabel="다시 시도" onAction={onRegenerate} />
      ) : (
        // 로딩→성공 전환은 role="alert"가 없어 스스로 안내하지 않으므로,
        // 여기서만 aria-live로 묶는다(SYS-03 "불러왔습니다" announce와 같은
        // 이유) — 모달이 열릴 때 포커스는 이미 "닫기"로 들어가 있어, 그 뒤
        // 안에서 바뀌는 내용은 이게 아니면 스크린리더가 못 듣는다.
        <div aria-live="polite" aria-atomic="true" className="flex flex-col gap-3">
          {isPending ? (
            <>
              <p className="flex items-center gap-2 text-label text-text-muted">
                <SpinnerIcon className="animate-spin motion-reduce:animate-none" />
                설명을 만드는 중…
              </p>
              <SkeletonText lines={4} />
            </>
          ) : (
            <>
              {/* 평문, 마크다운 없음(계약 그대로) — 텍스트 노드로만 렌더해
                  HTML 주입 경로를 원천적으로 막는다(React는 {text}를 항상
                  이스케이프한다; dangerouslySetInnerHTML을 쓰지 않는 한 —
                  이 컴포넌트는 어디서도 쓰지 않는다). */}
              <p className="whitespace-pre-line text-label leading-relaxed text-text">{explanation}</p>
              <p className="text-caption text-text-muted">AI가 작성한 설명입니다</p>
            </>
          )}
        </div>
      )}

      {!isPending && !errorCopy && (
        <div className="border-t border-border pt-4">
          <Button variant="secondary" size="md" onClick={onRegenerate} className="w-full">
            다시 생성
          </Button>
        </div>
      )}
    </div>
  )
}

export function PlanExplanationPanel({ weeklyPlanId, canWrite = true, offlineReason }) {
  const explain = useGeneratePlanExplanation()
  const [open, setOpen] = useState(false)
  // D1(ReviewPanel과 같은 이유): 열리는 시점의 데스크톱/모바일 여부에 고정—
  // 열려 있는 동안 창 폭이 바뀌어도(모바일 브라우저의 키보드 등) 셸이
  // 바뀌지 않는다.
  const isDesktop = useLockedIsDesktop(open)
  const titleId = useId()
  const closeRef = useRef(null)

  const handleOpen = () => {
    if (!weeklyPlanId || !canWrite) return
    setOpen(true)
    // 이미 결과가 있으면(패널을 한 번 닫았다가 다시 연 경우) 재요청하지
    // 않는다 — 같은 걸 다시 보는 것뿐이다. 새로 만들고 싶으면 패널 안의
    // "다시 생성"을 눌러야 한다(명시적 재요청만 이전 결과를 교체한다).
    if (explain.isIdle) explain.mutate(weeklyPlanId)
  }

  const handleRegenerate = () => {
    if (!weeklyPlanId || explain.isPending) return
    explain.mutate(weeklyPlanId)
  }

  const errorCopy = explain.isError ? explanationErrorCopy(explain.error) : null

  const trigger = (
    <Button
      variant="secondary"
      size="sm"
      onClick={handleOpen}
      loading={explain.isPending}
      loadingLabel="설명을 만드는 중…"
      disabled={!weeklyPlanId || !canWrite}
      disabledReason={!canWrite ? offlineReason : undefined}
    >
      AI 설명 보기
    </Button>
  )

  if (!open) return trigger

  const body = (
    <PanelBody
      titleId={titleId}
      closeRef={closeRef}
      isPending={explain.isPending}
      errorCopy={errorCopy}
      explanation={explain.data?.explanation}
      onRegenerate={handleRegenerate}
      onClose={() => setOpen(false)}
    />
  )

  return (
    <>
      {trigger}
      {isDesktop ? (
        <Dialog open={open} onClose={() => setOpen(false)} labelledById={titleId} initialFocusRef={closeRef} size="lg">
          {body}
        </Dialog>
      ) : (
        <BottomSheet open={open} onClose={() => setOpen(false)} labelledById={titleId} initialFocusRef={closeRef}>
          {body}
        </BottomSheet>
      )}
    </>
  )
}

export default PlanExplanationPanel
