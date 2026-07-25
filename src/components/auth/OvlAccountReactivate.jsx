import { useId, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog } from '../common/Dialog'
import { BottomSheet } from '../common/BottomSheet'
import { Button } from '../common/Button'
import { Banner } from '../common/Banner'
import { useIsDesktop } from '../../hooks/useMediaQuery'

/*
  OVL-ACCT-REACT (ACCT-05, + ACCT-06's "삭제 안내" sub-state — that user
  story has NO screen of its own per ux-flow-map's coverage table, "ACCT-06
  시스템"; its only UI surface IS this overlay's expired branch). Two entry
  points share this exact component:
    1. SCR-AUTH-LOGIN — login() rejects with E-AUTH-DEACTIVATED; `info` comes
       straight from that error's `details` (no account query — the user
       isn't authenticated yet).
    2. SettingsAccountPage — an already-authenticated dev-stub session whose
       account resource happens to be DEACTIVATED; `info` comes from
       useAccount()'s cached fields instead.
  Either way this component only renders what it's handed — it owns no
  fetching of its own, which is what makes sharing it between an
  unauthenticated and an authenticated caller possible at all.

  `info` shape: { daysRemaining, reactivationDeadlineDays, deletionEligible } —
  see features/auth/reactivationInfo.js's `deriveReactivationInfo` for how
  both callers above produce it (kept in its own non-component module so this
  file can stay component-only — react-refresh/only-export-components).
*/
export function OvlAccountReactivate({ open, onClose, onReactivate, submitting = false, info }) {
  const isDesktop = useIsDesktop()
  const navigate = useNavigate()
  const titleId = useId()
  const primaryRef = useRef(null)

  if (!open || !info) return null

  const { daysRemaining, reactivationDeadlineDays, deletionEligible } = info

  const content = deletionEligible ? (
    // ACCT-06: 유예기간을 넘겨 데이터가 이미 삭제 처리된 상태 — 재활성화
    // 버튼 자체를 없애고 재가입 유도로만 이어간다(되돌릴 수 없는 상태를
    // 재활성화 가능한 것처럼 보여주지 않는다).
    <div className="flex flex-col gap-4">
      <h2 id={titleId} className="text-title font-semibold text-text">
        계정과 데이터가 삭제되었습니다
      </h2>
      <Banner
        tone="danger"
        sticky={false}
        icon={<span aria-hidden="true">!</span>}
        message={`비활성화 후 ${reactivationDeadlineDays}일이 지나 계정 데이터가 완전히 삭제되었습니다`}
      />
      <p className="text-label text-text-muted">
        이 계정은 더 이상 복구할 수 없습니다. 계속 이용하시려면 새로 회원가입해 주세요.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="md" onClick={onClose}>
          닫기
        </Button>
        <Button ref={primaryRef} variant="primary" size="md" onClick={() => navigate('/signup')}>
          회원가입하기
        </Button>
      </div>
    </div>
  ) : (
    <div className="flex flex-col gap-4">
      <h2 id={titleId} className="text-title font-semibold text-text">
        계정이 비활성화되어 있습니다
      </h2>
      <Banner
        tone="warning"
        sticky={false}
        icon={<span aria-hidden="true">!</span>}
        message={`${daysRemaining}일 이내 재활성화하지 않으면 계정과 데이터가 삭제됩니다`}
      />
      <p className="text-label text-text-muted">
        지금 재활성화하면 기존 계획·프로젝트 데이터와 함께 바로 대시보드로 이동합니다.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="md" onClick={onClose}>
          취소
        </Button>
        <Button ref={primaryRef} variant="primary" size="md" loading={submitting} onClick={onReactivate}>
          계정 재활성화
        </Button>
      </div>
    </div>
  )

  if (isDesktop) {
    return (
      <Dialog open onClose={onClose} labelledById={titleId} initialFocusRef={primaryRef}>
        {content}
      </Dialog>
    )
  }
  return (
    <BottomSheet open onClose={onClose} labelledById={titleId} initialFocusRef={primaryRef}>
      {content}
    </BottomSheet>
  )
}

export default OvlAccountReactivate
