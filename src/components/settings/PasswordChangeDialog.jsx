import { useId, useRef, useState } from 'react'
import { Dialog } from '../common/Dialog'
import { BottomSheet } from '../common/BottomSheet'
import { Button } from '../common/Button'
import { PasswordChecklist } from '../auth/PasswordChecklist'
import { isPasswordValid } from '../auth/passwordPolicy'
import { useLockedIsDesktop } from '../../hooks/useMediaQuery'
import { useChangePassword } from '../../features/settings/useSettings'
import { toast } from '../../hooks/useToasts'

const FIELD =
  'w-full rounded-control border border-border bg-surface px-3 py-2 text-label text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring'

/*
  PasswordChangeDialog — ACCT-02 (로그인 상태에서 현재 비밀번호를 확인한 뒤
  새 비밀번호로 교체). 계약은 PATCH /users/me/password(openapi.yaml ~362행,
  PasswordChangeService.java) 하나이고 응답은 200/빈 본문 또는 400뿐이다.

  "현재 비밀번호 불일치"와 "소셜 가입 계정(비밀번호 없음)"은 서버가 같은 코드
  E-USER-001로 합쳐 응답한다(계정 존재를 노출하지 않기 위해서 — 그 서비스
  자신의 javadoc). 이 모달은 그 둘을 다시 가르지 않는다 — 대신 호출부
  (SettingsAccountPage)가 loginType===SOCIAL이면 이 모달을 열 수 있는 버튼
  자체를 먼저 가린다. 그래서 여기 도달한 E-USER-001은 항상 "현재 비밀번호가
  틀렸다"로 읽어도 안전하다.

  새 비밀번호 규칙은 회원가입(SCR-AUTH-SIGNUP)·재설정(SCR-AUTH-RESET)과 같은
  PasswordChecklist/passwordPolicy를 그대로 재사용한다. 이 엔드포인트의 서버
  검증은 그 둘보다 느슨하다(ChangePasswordRequest.java — 8~72자만 강제,
  영문+숫자 @Pattern 없음)지만, 더 엄격한 클라이언트 규칙을 통과하면 이
  느슨한 조건은 항상 함께 통과하므로 절대 충돌하지 않는다. 화면마다 다른
  비밀번호 규칙을 보여주지 않기 위해 분리하지 않았다.

  성공 처리는 이 컴포넌트의 책임이 아니다 — 서버는 성공 시 전 refresh 세션을
  폐기하지만 지금 쥔 access 토큰(JWT, 최대 30분)은 그 자리에서 끊기지 않는다
  (settingsApi.changePassword 헤더 참조). "그래서 다음에 뭘 하는가"(로그아웃
  경로로 먼저 나가 안내하는 것)는 세션 캐시·라우팅을 함께 다뤄야 해서
  onSuccess 콜백 하나로 호출부(SettingsAccountPage.handlePasswordChangeSuccess)
  에 넘긴다.

  `finalizing`(호출부가 `logoutMutation.isPending`을 그대로 넘긴다)은 PATCH가
  성공한 뒤에도 호출부가 이어서 돌리는 로그아웃 요청이 끝날 때까지, 이
  다이얼로그가 오버레이 스택에서 사라지지 못하게 막는다 — Esc·배경 클릭·취소
  버튼을 전부 무시한다. 그동안 닫아 버리면 overlayHistory.js의 "닫기와 이동의
  경합"(그 파일 헤더 참고)에 걸린다: 스택이 0이 되는 시점과 호출부가 실제로
  navigate()하는 시점(로그아웃 네트워크 왕복 뒤) 사이 간격이 더블 rAF 재확인
  창보다 훨씬 길어서, 재확인이 먼저 self-back()을 불러 버린 뒤에야 navigate()가
  온다. 그래서 닫기는 호출부가 로그아웃까지 끝낸 바로 그 순간에만 일어나야
  한다(SettingsAccountPage.handlePasswordChangeSuccess 참고).
*/
export function PasswordChangeDialog({ onClose, onSuccess, finalizing = false }) {
  // D1: 부모가 열릴 때만 새로 마운트(fresh per open) — 마운트 시점에 고정.
  const isDesktop = useLockedIsDesktop()
  const titleId = useId()
  const currentErrorId = useId()
  const newErrorId = useId()
  const firstFieldRef = useRef(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const changePassword = useChangePassword()

  const code = changePassword.error?.code
  // E-USER-001: 현재 비밀번호 불일치 — 위 헤더 참조(소셜 계정 분기는 버튼
  // 단계에서 이미 걸러졌으므로 여기선 항상 이 의미로 고정해 보여준다).
  const currentPasswordError = code === 'E-USER-001' ? '현재 비밀번호가 올바르지 않습니다' : null
  // E-COM-001: Bean Validation 실패 — 이 폼의 PasswordChecklist가 막지 못한
  // 경우만 여기 도달한다(예: 72자 초과, ChangePasswordRequest.java `@Size`).
  const newPasswordError = code === 'E-COM-001' ? '새 비밀번호가 정책에 맞지 않습니다(8~72자)' : null

  // finalizing 동안은 onClose를 아예 부르지 않는다(위 컴포넌트 헤더 참고) —
  // Esc·배경 클릭·취소 버튼이 전부 이 한 함수를 거치므로 한 곳만 지키면 된다.
  const handleClose = () => {
    if (finalizing) return
    onClose()
  }

  const passwordValid = isPasswordValid(newPassword)
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword
  const canSubmit = currentPassword.length > 0 && passwordValid && passwordsMatch

  // 실패 뒤 사용자가 다시 타이핑하면 그 오류를 버린다 — AppleConnectDialog와
  // 같은 이유(옛 오류 문구가 새로 고친 입력에도 그대로 달려 있지 않게).
  const editField = (setter) => (value) => {
    if (changePassword.isError) changePassword.reset()
    setter(value)
  }

  // finalizing 중엔 폼이 이미 할 일을 다 했다(PATCH 성공) — 엔터로 재제출되는
  // 것도 막는다(버튼 disabled만으로는 폼 submit 이벤트 자체를 막지 못한다).
  const submit = (e) => {
    e.preventDefault()
    if (!canSubmit || changePassword.isPending || finalizing) return
    changePassword.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => onSuccess(),
        onError: (error) => {
          // 두 필드 오류(E-USER-001/E-COM-001)는 위에서 이미 인라인으로
          // 보여준다 — 그 외(네트워크·5xx 등)만 토스트로 알린다.
          if (error?.code !== 'E-USER-001' && error?.code !== 'E-COM-001') {
            toast({ tone: 'error', message: '비밀번호를 변경하지 못했습니다' })
          }
        },
      },
    )
  }

  const content = (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h2 id={titleId} className="text-title font-semibold text-text">
        비밀번호 변경
      </h2>

      <label className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">현재 비밀번호</span>
        <input
          ref={firstFieldRef}
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => editField(setCurrentPassword)(e.target.value)}
          aria-describedby={currentPasswordError ? currentErrorId : undefined}
          aria-invalid={currentPasswordError ? true : undefined}
          required
          className={FIELD}
        />
        {currentPasswordError && (
          <span id={currentErrorId} role="alert" className="text-caption text-danger-700">
            {currentPasswordError}
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">새 비밀번호</span>
        <input
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => editField(setNewPassword)(e.target.value)}
          aria-describedby={newPasswordError ? newErrorId : undefined}
          aria-invalid={newPasswordError ? true : undefined}
          required
          className={FIELD}
        />
        {newPasswordError && (
          <span id={newErrorId} role="alert" className="text-caption text-danger-700">
            {newPasswordError}
          </span>
        )}
      </label>
      <PasswordChecklist password={newPassword} />

      <label className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">새 비밀번호 확인</span>
        <input
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => editField(setConfirmPassword)(e.target.value)}
          required
          className={FIELD}
        />
        {confirmPassword.length > 0 && !passwordsMatch && (
          <span role="alert" className="text-caption text-danger-700">
            비밀번호가 일치하지 않습니다
          </span>
        )}
      </label>

      <div className="mt-1 flex justify-end gap-2">
        <Button type="button" variant="secondary" size="md" onClick={handleClose} disabled={finalizing}>
          취소
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="md"
          loading={changePassword.isPending || finalizing}
          disabled={!canSubmit || finalizing}
        >
          변경
        </Button>
      </div>
    </form>
  )

  if (isDesktop) {
    return (
      <Dialog open onClose={handleClose} labelledById={titleId} initialFocusRef={firstFieldRef}>
        {content}
      </Dialog>
    )
  }
  return (
    <BottomSheet open onClose={handleClose} labelledById={titleId} initialFocusRef={firstFieldRef}>
      {content}
    </BottomSheet>
  )
}

export default PasswordChangeDialog
