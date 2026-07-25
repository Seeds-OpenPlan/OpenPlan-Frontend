import { useId, useRef } from 'react'
import { Dialog } from '../common/Dialog'
import { BottomSheet } from '../common/BottomSheet'
import { Button } from '../common/Button'
import { useIsDesktop } from '../../hooks/useMediaQuery'

/*
  OVL-ACCT-DEACT (ACCT-04). Shared by SettingsAccountPage AND (implicitly,
  as the thing SCR-AUTH-LOGIN's OVL-ACCT-REACT branch is the mirror image of)
  this story's own account surfaces — one component instead of the page's own
  ad-hoc ConfirmDialog, so the "삭제되는 데이터 범위" disclosure this AC asks
  for exists in exactly one place.

  The data-scope list below is [가정-확장] copy (no ui-spec §AUTH text yet) —
  worded to match what ACCT-04's own user story says survives ("30일 간
  복구 가능한 비활성화 상태") without overclaiming a scope BE hasn't confirmed.
*/
export function OvlAccountDeactivate({ open, onClose, onConfirm, submitting = false, reactivationDeadlineDays = 30 }) {
  const isDesktop = useIsDesktop()
  const titleId = useId()
  const confirmRef = useRef(null)

  if (!open) return null

  const content = (
    <div className="flex flex-col gap-4">
      <h2 id={titleId} className="text-title font-semibold text-text">
        계정을 비활성화할까요?
      </h2>
      <div className="flex flex-col gap-2 rounded-control border border-border bg-surface-sunken p-3 text-label text-text-muted">
        <p className="font-medium text-text">비활성화하면 이렇게 됩니다</p>
        <ul className="flex flex-col gap-1 pl-4">
          <li className="list-disc">즉시 로그아웃되고 계획·프로젝트에 접근할 수 없습니다</li>
          <li className="list-disc">
            {reactivationDeadlineDays}일 이내 다시 로그인하면 기존 데이터와 함께 복구할 수 있습니다
          </li>
          <li className="list-disc">{reactivationDeadlineDays}일이 지나면 계정과 모든 데이터가 완전히 삭제됩니다</li>
        </ul>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="md" onClick={onClose}>
          취소
        </Button>
        <Button ref={confirmRef} variant="danger" size="md" loading={submitting} onClick={onConfirm}>
          비활성화
        </Button>
      </div>
    </div>
  )

  if (isDesktop) {
    return (
      <Dialog open onClose={onClose} labelledById={titleId} initialFocusRef={confirmRef}>
        {content}
      </Dialog>
    )
  }
  return (
    <BottomSheet open onClose={onClose} labelledById={titleId} initialFocusRef={confirmRef}>
      {content}
    </BottomSheet>
  )
}

export default OvlAccountDeactivate
