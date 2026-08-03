import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthShell } from '../../components/auth/AuthShell'
import { PasswordChecklist } from '../../components/auth/PasswordChecklist'
import { isPasswordValid } from '../../components/auth/passwordPolicy'
import { Button } from '../../components/common/Button'
import { ErrorState } from '../../components/common/ErrorState'
import { useConfirmPasswordReset } from '../../features/auth/useAuth'
import { toast } from '../../hooks/useToasts'

const FIELD =
  'w-full rounded-control border border-border bg-surface px-3 py-2 text-label text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring'

/*
  SCR-AUTH-RESET (AUTH-06). Reads `?token=` from the emailed link. A page
  reached with NO token at all (typed by hand, an old bookmark, whatever) has
  nothing to submit against, so it skips the form entirely and points back to
  the request screen rather than showing a form that can only ever fail.
*/
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const confirmMutation = useConfirmPasswordReset()

  if (!token) {
    return (
      <AuthShell>
        <ErrorState
          variant="section"
          title="유효하지 않은 링크입니다"
          description="비밀번호 재설정 메일의 링크로 다시 접근해 주세요."
          actionLabel="재설정 메일 다시 받기"
          onAction={() => navigate('/reset-password')}
        />
      </AuthShell>
    )
  }

  const passwordValid = isPasswordValid(password)
  const passwordsMatch = password.length > 0 && password === confirmPassword
  const canSubmit = passwordValid && passwordsMatch

  const submit = (e) => {
    e.preventDefault()
    if (!canSubmit || confirmMutation.isPending) return
    confirmMutation.mutate(
      { token, password },
      {
        onSuccess: () => {
          toast({ tone: 'success', message: '비밀번호가 변경되었습니다. 다시 로그인해 주세요.' })
          navigate('/login', { replace: true })
        },
      },
    )
  }

  // 실서버 E-AUTH-006 "재설정 링크 만료·사용됨"(410) — 실서버 대조 2026-08-03,
  // 존재하지 않는 `E-AUTH-422`를 대체.
  const tokenInvalid = confirmMutation.error?.code === 'E-AUTH-006'

  if (tokenInvalid) {
    return (
      <AuthShell>
        <ErrorState
          variant="section"
          title="링크가 만료되었거나 이미 사용되었습니다"
          description="비밀번호 재설정을 다시 요청해 주세요."
          actionLabel="재설정 메일 다시 받기"
          onAction={() => navigate('/reset-password')}
        />
      </AuthShell>
    )
  }

  return (
    <AuthShell
      footer={
        <Link to="/login" className="font-medium text-brand-600 hover:underline">
          로그인으로 돌아가기
        </Link>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <h1 className="text-title font-semibold text-text">새 비밀번호 설정</h1>

        <label className="flex flex-col gap-1">
          <span className="text-caption font-medium text-text-muted">새 비밀번호</span>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={FIELD}
          />
        </label>
        <PasswordChecklist password={password} />

        <label className="flex flex-col gap-1">
          <span className="text-caption font-medium text-text-muted">새 비밀번호 확인</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={FIELD}
          />
          {confirmPassword.length > 0 && !passwordsMatch && (
            <span role="alert" className="text-caption text-danger-700">
              비밀번호가 일치하지 않습니다
            </span>
          )}
        </label>

        {/* Thomas 리뷰 MAJOR: E-AUTH-006(위의 tokenInvalid 분기)가 아닌 다른
            실패(네트워크·5xx 등)는 이전엔 아무 피드백 없이 조용히 사라졌다. */}
        {confirmMutation.isError && !tokenInvalid && (
          <ErrorState variant="inline" title="비밀번호를 저장하지 못했습니다" />
        )}

        <Button type="submit" variant="primary" size="lg" loading={confirmMutation.isPending} disabled={!canSubmit}>
          비밀번호 저장
        </Button>
      </form>
    </AuthShell>
  )
}

export default ResetPasswordPage
