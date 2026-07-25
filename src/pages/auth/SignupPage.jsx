import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthShell } from '../../components/auth/AuthShell'
import { PasswordChecklist } from '../../components/auth/PasswordChecklist'
import { isPasswordValid } from '../../components/auth/passwordPolicy'
import { Button } from '../../components/common/Button'
import { useSignup } from '../../features/auth/useAuth'

const FIELD =
  'w-full rounded-control border border-border bg-surface px-3 py-2 text-label text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/*
  SCR-AUTH-SIGNUP (AUTH-03 · AC5 비밀번호 체크리스트·재발송 60초 쿨다운).
  60초 쿨다운 자체는 이 화면이 아니라 다음 화면(SCR-AUTH-VERIFY)의 몫이다 —
  가입 직후 이동해서야 "재발송" 버튼이 존재하므로, 이 화면은 가입 폼 제출까지만
  다루고 쿨다운 타이머는 VerifyEmailPage로 넘긴다(그 화면이 실제 재발송 호출을
  갖고 있다).
*/
export function SignupPage() {
  const navigate = useNavigate()
  const nameRef = useRef(null)
  const errorId = useId()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [agreedToTerms, setAgreedToTerms] = useState(false)

  const signupMutation = useSignup()

  // Thomas 리뷰 MINOR: nameRef가 그냥 죽은 ref로 남아있던 것을 첫 필드
  // autofocus에 실제로 쓴다.
  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  const trimmedName = name.trim()
  const emailValid = EMAIL_RE.test(email)
  const passwordValid = isPasswordValid(password)
  const passwordsMatch = password.length > 0 && password === confirmPassword
  const canSubmit = trimmedName && emailValid && passwordValid && passwordsMatch && agreedToTerms

  const submit = (e) => {
    e.preventDefault()
    if (!canSubmit || signupMutation.isPending) return
    signupMutation.mutate(
      { name: trimmedName, email, password },
      { onSuccess: () => navigate('/verify-email', { state: { email } }) },
    )
  }

  const signupErrorCopy =
    signupMutation.error?.code === 'E-AUTH-409'
      ? '이미 가입된 이메일입니다. 로그인해 주세요.'
      : signupMutation.isError
        ? '가입을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.'
        : null

  return (
    <AuthShell
      footer={
        <span>
          이미 계정이 있으신가요?{' '}
          <Link to="/login" className="font-medium text-brand-600 hover:underline">
            로그인
          </Link>
        </span>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <h1 className="sr-only">회원가입</h1>

        <label className="flex flex-col gap-1">
          <span className="text-caption font-medium text-text-muted">이름</span>
          <input
            ref={nameRef}
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={FIELD}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-caption font-medium text-text-muted">이메일</span>
          <input
            type="email"
            autoComplete="email"
            placeholder="example@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-describedby={signupErrorCopy ? errorId : undefined}
            aria-invalid={signupErrorCopy ? true : undefined}
            className={FIELD}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-caption font-medium text-text-muted">비밀번호</span>
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
          <span className="text-caption font-medium text-text-muted">비밀번호 확인</span>
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

        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-border-strong text-brand-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
          />
          <span className="text-label text-text">이용약관 및 개인정보 처리방침에 동의합니다</span>
        </label>

        {signupErrorCopy && (
          <span id={errorId} role="alert" className="text-caption text-danger-700">
            {signupErrorCopy}
          </span>
        )}

        <Button type="submit" variant="primary" size="lg" loading={signupMutation.isPending} disabled={!canSubmit}>
          가입하기
        </Button>
      </form>
    </AuthShell>
  )
}

export default SignupPage
