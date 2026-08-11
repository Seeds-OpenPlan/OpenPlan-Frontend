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

  이름 입력 필드 없음 (오너 결정, 2026-08-08): 서버 계약(POST /users, openapi
  operationId: signUp)엔 애초에 name 자리가 없고, 이 앱은 이름을 온보딩
  ONB-02(PATCH /users/me/profile)에서만 받는다. 가입 화면에서 받아 봐야
  보낼 곳이 없을 뿐 아니라, 온보딩까지 이어붙일 수도 없다 — 이메일 인증은
  사용자가 메일 클라이언트에서 링크를 클릭해 들어오는 앱 밖 하드
  네비게이션이라 router state(SignupPage→VerifyEmailPage 사이의 email처럼)가
  그 경계를 못 넘는다. 입력받고 버리느니 온보딩 한 곳에서만 받는다 — 이
  화면에 이름 필드를 다시 추가하지 말 것(중복 질문이 된다).
*/
export function SignupPage() {
  const navigate = useNavigate()
  const emailRef = useRef(null)
  const errorId = useId()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [agreedToTerms, setAgreedToTerms] = useState(false)

  const signupMutation = useSignup()

  // 이름 필드가 빠지면서 첫 필드가 이메일이 됐다 — autofocus 대상도 그에
  // 맞춰 이동(이전엔 nameRef가 이 역할이었다).
  useEffect(() => {
    emailRef.current?.focus()
  }, [])

  const emailValid = EMAIL_RE.test(email)
  const passwordValid = isPasswordValid(password)
  const passwordsMatch = password.length > 0 && password === confirmPassword
  const canSubmit = emailValid && passwordValid && passwordsMatch && agreedToTerms

  const submit = (e) => {
    e.preventDefault()
    if (!canSubmit || signupMutation.isPending) return
    signupMutation.mutate(
      { email, password, termsAgreed: agreedToTerms },
      { onSuccess: () => navigate('/verify-email', { state: { email } }) },
    )
  }

  const signupErrorCopy =
    // 실서버 E-AUTH-003 "이미 가입된 이메일"(409) — 실서버 대조 2026-08-03,
    // 존재하지 않는 `E-AUTH-409`를 대체.
    signupMutation.error?.code === 'E-AUTH-003'
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
          <span className="text-caption font-medium text-text-muted">이메일</span>
          <input
            ref={emailRef}
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
