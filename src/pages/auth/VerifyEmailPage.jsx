import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthShell } from '../../components/auth/AuthShell'
import { Button } from '../../components/common/Button'
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton'
import { ErrorState } from '../../components/common/ErrorState'
import { CheckCircleIcon } from '../../components/common/statusIcons'
import { useVerifyEmail, useResendVerificationEmail } from '../../features/auth/useAuth'

const RESEND_COOLDOWN_SECONDS = 60

/*
  SCR-AUTH-VERIFY (AUTH-04). Two independently-reachable shapes sharing one
  route (`/verify-email`), branching on whether a token is in the URL:

  - NO token: the "메일함을 확인해 주세요" waiting state — where SignupPage
    lands the user right after signup (email carried via router `state`, not
    the URL, since it's a UX nicety — showing WHICH address — not a durable
    link param). Also directly reachable with nothing in state (a user who
    navigates here cold just doesn't see the address echoed back).
  - `?token=...`: the actual verification attempt. Runs once on mount (not
    user-triggered) — clicking the emailed link IS the action.
*/
export function VerifyEmailPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const email = location.state?.email

  const verifyMutation = useVerifyEmail()
  const resendMutation = useResendVerificationEmail()
  const [cooldown, setCooldown] = useState(0)
  // 마지막으로 검증을 시도한 토큰 값 자체를 저장(단순 boolean이 아님, Thomas
  // 리뷰 NIT) — StrictMode의 effect 이중 호출로 같은 토큰이 "만료"로 잘못
  // 보고되는 것은 막으면서도, 리마운트 없이 URL의 `?token=` 값만 바뀌는
  // 경우(같은 라우트에 다른 링크로 재진입)엔 새 토큰에 대해 다시 시도한다.
  const lastAttemptedTokenRef = useRef(null)

  useEffect(() => {
    if (!token || lastAttemptedTokenRef.current === token) return
    lastAttemptedTokenRef.current = token
    verifyMutation.mutate(token)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    if (cooldown <= 0) return undefined
    const id = setInterval(() => setCooldown((s) => Math.max(s - 1, 0)), 1000)
    return () => clearInterval(id)
  }, [cooldown])

  const handleResend = () => {
    if (!email || cooldown > 0) return
    resendMutation.mutate(email, {
      onSuccess: (data) => {
        setCooldown(RESEND_COOLDOWN_SECONDS)
        // devHint: 실 메일 발송이 없는 dev 환경에서 authFixtures.js가 돌려주는
        // 재현용 링크 — 화면엔 안 보여주고(실 서버 응답엔 없을 필드) 콘솔에만
        // 남겨 QA가 `/verify-email${devHint}`로 바로 검증 분기를 재현하게 한다.
        if (import.meta.env.DEV && data?.devHint) {
          console.info(`[auth] verify link (dev only): /verify-email${data.devHint}`)
        }
      },
    })
  }

  if (token) {
    if (verifyMutation.isPending || verifyMutation.isIdle) {
      return (
        <AuthShell>
          <LoadingSkeleton preset="card" />
        </AuthShell>
      )
    }
    if (verifyMutation.isSuccess) {
      return (
        <AuthShell>
          <div className="flex flex-col items-center gap-3 text-center">
            <CheckCircleIcon className="text-success-600" size={40} />
            <p className="text-body font-medium text-text">인증이 완료되었습니다</p>
            <p className="text-label text-text-muted">이제 로그인해서 서비스를 이용할 수 있습니다</p>
          </div>
          <Button variant="primary" size="lg" onClick={() => navigate('/login')}>
            로그인하러 가기
          </Button>
        </AuthShell>
      )
    }
    // 실패(만료·잘못된 토큰) — verifyMutation.isError
    return (
      <AuthShell>
        <ErrorState
          variant="section"
          title="인증 링크가 유효하지 않습니다"
          description="링크가 만료되었거나 이미 사용되었을 수 있습니다. 인증 메일을 다시 받아보세요."
        />
        {email && (
          <div className="flex justify-center">
            <Button variant="secondary" size="lg" loading={resendMutation.isPending} disabled={cooldown > 0} onClick={handleResend}>
              {cooldown > 0 ? `다시 보내기 (${cooldown}초 후 가능)` : '인증 메일 다시 보내기'}
            </Button>
          </div>
        )}
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-body font-medium text-text">메일함을 확인해 주세요</p>
        <p className="text-label text-text-muted">
          {email ? (
            <>
              <span className="font-medium text-text">{email}</span>(으)로 인증 메일을 보냈습니다
            </>
          ) : (
            '가입하신 이메일로 인증 메일을 보냈습니다'
          )}
        </p>
      </div>

      {email && (
        <div aria-live="polite" className="flex justify-center">
          <Button
            variant="secondary"
            size="lg"
            loading={resendMutation.isPending}
            disabled={cooldown > 0}
            onClick={handleResend}
          >
            {cooldown > 0 ? `다시 보내기 (${cooldown}초 후 가능)` : '인증 메일 다시 보내기'}
          </Button>
        </div>
      )}

      <p className="text-center text-caption text-text-muted">
        <Link to="/login" className="font-medium text-brand-600 hover:underline">
          로그인으로 돌아가기
        </Link>
      </p>
    </AuthShell>
  )
}

export default VerifyEmailPage
