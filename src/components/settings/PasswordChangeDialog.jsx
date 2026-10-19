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
  E-COM-001(Bean Validation 실패)의 details.fields[0]에서 실패한 필드명을
  뽑는다(AI 리뷰 S1). 계약 확인: GlobalExceptionHandler.handleValidation
  (openplan-backend origin/main) — MethodArgumentNotValidException의 각
  FieldError를 `Map.of("field", fe.getField(), "rule", ..., "message", ...)`
  로 담으므로, 여기 `field`는 ChangePasswordRequest 레코드의 컴포넌트명
  그대로("currentPassword" 또는 "newPassword")다.

  객체(`{field, ...}`)만 가정하지 않고 문자열도 받는다 — 이 코드베이스의
  기존 관례(usePlanData.js의 같은 처리 참고, 거기 주석이 설명하는 과거
  실측 기록)를 따른 방어적 처리다. 한쪽 모양만 가정하면 다른 모양일 때
  조용히 undefined가 되어, 필드를 가리는 이 로직 전체가 무효가 된다.
*/
function pickBadField(error) {
  const raw = error?.details?.fields?.[0]
  return typeof raw === 'string' ? raw : raw?.field
}

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

  닫기 금지 조건은 `finalizing`만이 아니라 `changePassword.isPending`도 포함한다
  (Thomas 리뷰 B1). PATCH 자체가 아직 날아가 있는 동안에도 취소로 닫을 수 있게
  열어 두면, 사용자가 "이미 닫았다"고 믿은 뒤에 그 PATCH가 뒤늦게 성공해
  onSuccess(handlePasswordChangeSuccess)가 동의 없이 로그아웃·이동을 실행해
  버린다 — useTutorialRestart.jsx가 겪은 것과 같은 모양의 "취소했는데 실행되는"
  경합이다.

  닫기를 막는 방식도 내부에서 onClose를 삼키는 래퍼가 아니라, blocked일 때
  Dialog/BottomSheet에 **onClose 자체를 아예 넘기지 않는다**(undefined) —
  useTutorialRestart.jsx와 같은 패턴(Thomas 리뷰 B2). 이유: 하드웨어 뒤로
  가기(useOverlayBackButton.js)는 `onCloseRef.current`가 **falsy**일 때만
  "닫을 수 없는 오버레이"로 보고 `ensureOverlayEntry()`로 소비된 히스토리
  엔트리를 되돌려 놓는다 — 내부에서 아무것도 안 하는 함수라도 "함수가 있다"는
  사실 자체가 `ensureOverlayEntry()`를 건너뛰게 만들어, 뒤로 가기 한 번으로
  보호 엔트리를 영구히 잃는다(Esc·배경 클릭·취소 버튼은 onClose가 아예 없으면
  Dialog.jsx/BottomSheet.jsx가 그 자리에서 끝내므로 자동으로 함께 막힌다).
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
  // E-COM-001은 currentPassword(@NotBlank)·newPassword(@NotBlank+@Size) 둘 중
  // 어느 쪽이 실패해도 같은 코드로 온다 — badField로 실제 실패한 필드를 가려서
  // 그 칸에만 붙인다(위 pickBadField 헤더 참고). 재현: 현재 비밀번호에 공백만
  // 넣으면(@NotBlank 위반) 이전 버전은 이 분기가 없어 항상 새 비밀번호 칸에
  // 오류를 붙였다(AI 리뷰 S1).
  const badField = code === 'E-COM-001' ? pickBadField(changePassword.error) : null

  // E-USER-001: 현재 비밀번호 불일치 — 위 헤더 참조(소셜 계정 분기는 버튼
  // 단계에서 이미 걸러졌으므로 여기선 항상 이 의미로 고정해 보여준다).
  const currentPasswordError =
    code === 'E-USER-001'
      ? '현재 비밀번호가 올바르지 않습니다'
      : badField === 'currentPassword'
        ? '현재 비밀번호를 입력해 주세요'
        : null
  // badField가 정확히 'newPassword'로 특정될 때만 붙인다 — 필드 정보가
  // 없거나(details.fields 비어 있음) 둘 다 아닌 이름이면 여기 붙이지 않고
  // 아래 onError의 토스트 폴백에 맡긴다(알 수 없는 필드를 새 비밀번호 탓으로
  // 단정하지 않는다).
  const newPasswordError = badField === 'newPassword' ? '새 비밀번호가 정책에 맞지 않습니다(8~72자)' : null

  // 닫기 금지 조건 — 위 컴포넌트 헤더 "닫기 금지 조건은..." 단락 참고. PATCH가
  // 날아가 있는 동안(changePassword.isPending)과 PATCH 성공 뒤 호출부가
  // 로그아웃을 정착시키는 동안(finalizing) 둘 다 막는다.
  const blocked = changePassword.isPending || finalizing

  // blocked일 때 onClose 자체를 undefined로 끊는다(래퍼 함수를 넘기지 않는다) —
  // 위 컴포넌트 헤더 "닫기를 막는 방식도..." 단락 참고. Esc·배경 클릭은
  // Dialog/BottomSheet가 onClose 부재를 보고 자동으로 막고, 취소 버튼은 아래
  // disabled={blocked}로 같이 막는다.
  const closeDialog = blocked ? undefined : onClose

  const passwordValid = isPasswordValid(newPassword)
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword
  // trim() 기준(AI 리뷰 S1 후속 판단) — 서버의 @NotBlank(ChangePasswordRequest.
  // currentPassword)는 공백만 있는 값을 "비어 있다"고 본다. 클라이언트가
  // length > 0만 보면 공백 한 칸도 통과시켜 그 요청이 그대로 서버까지 가고,
  // 위 badField 분기가 없던 버전에서는 그 결과(E-COM-001, badField
  // "currentPassword")가 엉뚱하게 새 비밀번호 칸 오류로 보였다(재현 그대로).
  // badField 분기로 그 오표시는 이미 고쳤지만, 애초에 공백만 입력한 제출
  // 자체를 서버 왕복 없이 막는 쪽이 서버 규칙과 더 정확히 맞고 불필요한
  // 요청도 아낀다.
  const canSubmit = currentPassword.trim().length > 0 && passwordValid && passwordsMatch

  // 실패 뒤 사용자가 다시 타이핑하면 그 오류를 버린다 — AppleConnectDialog와
  // 같은 이유(옛 오류 문구가 새로 고친 입력에도 그대로 달려 있지 않게).
  const editField = (setter) => (value) => {
    if (changePassword.isError) changePassword.reset()
    setter(value)
  }

  // blocked 중엔 재제출도 막는다(버튼 disabled만으로는 폼 submit 이벤트 자체를
  // 막지 못한다 — 엔터 키로 우회될 수 있다).
  const submit = (e) => {
    e.preventDefault()
    if (!canSubmit || blocked) return
    changePassword.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => onSuccess(),
        onError: (error) => {
          // 인라인으로 이미 보여준 경우만 토스트를 생략한다: E-USER-001은
          // 항상, E-COM-001은 badField가 currentPassword/newPassword 둘 중
          // 하나로 실제 특정됐을 때만. 그 외 — 네트워크·5xx는 물론, E-COM-001인데
          // details.fields가 없거나 알 수 없는 필드명인 경우(위 currentPasswordError/
          // newPasswordError 헤더 참고)까지 포함 — 는 전부 여기 토스트로
          // 폴백한다(필드를 못 가린 오류를 조용히 묻어 두지 않는다).
          const errorBadField = error?.code === 'E-COM-001' ? pickBadField(error) : null
          const shownInline =
            error?.code === 'E-USER-001' || errorBadField === 'currentPassword' || errorBadField === 'newPassword'
          if (!shownInline) {
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
        <Button type="button" variant="secondary" size="md" onClick={closeDialog} disabled={blocked}>
          취소
        </Button>
        <Button type="submit" variant="primary" size="md" loading={blocked} disabled={!canSubmit || blocked}>
          변경
        </Button>
      </div>
    </form>
  )

  if (isDesktop) {
    return (
      <Dialog open onClose={closeDialog} labelledById={titleId} initialFocusRef={firstFieldRef}>
        {content}
      </Dialog>
    )
  }
  return (
    <BottomSheet open onClose={closeDialog} labelledById={titleId} initialFocusRef={firstFieldRef}>
      {content}
    </BottomSheet>
  )
}

export default PasswordChangeDialog
