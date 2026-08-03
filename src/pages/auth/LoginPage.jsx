import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthShell } from '../../components/auth/AuthShell'
import { SocialButtons } from '../../components/auth/SocialButtons'
import { OvlAccountReactivate } from '../../components/auth/OvlAccountReactivate'
import { Button } from '../../components/common/Button'
import { Banner } from '../../components/common/Banner'
import { useLogin, useReactivateByEmail } from '../../features/auth/useAuth'

const FIELD =
  'w-full rounded-control border border-border bg-surface px-3 py-2 text-label text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring'

// 데모 계정 4종 — authFixtures.js의 헤더 코멘트가 정본. 화면에도 짧게
// 남겨 둬 리뷰/QA가 코드를 안 열어봐도 각 분기를 바로 시도해볼 수 있게 함.
const DEMO_HINT =
  'user@openplan.dev · unverified@openplan.dev · deactivated@openplan.dev · expired@openplan.dev (비번 공통: password123)'

/*
  SCR-AUTH-LOGIN (AUTH-01 · AC2 실패 카피/비활성 분기 · AC4 소셜 콜백 오류).

  로그인 성공 시 '/'(대시보드)로 이동한다 — 실제로는 지금도 dev-auth 스텁이
  모든 보호 라우트를 무조건 통과시키므로 이 네비게이션이 "인증했기 때문에"
  통과하는 건 아니지만, 4주차에 스텁이 빠지고 나면 이 successful-login →
  '/' 흐름이 그대로 실 동작이 된다(오너 지시: 화면만 먼저 만들어 둔다).
*/
export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const emailRef = useRef(null)
  const errorId = useId()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [reactivateInfo, setReactivateInfo] = useState(null) // ACCT-05/06 분기 진입 시에만 채움

  const loginMutation = useLogin()
  // 로그인 실패로 얻은 "남의(아직 미인증) 계정"을 email로 지목해 재활성화하는
  // 전용 훅 — SettingsAccountPage가 쓰는 useReactivateAccount(로그인된 나 전용,
  // email 인자 없음)와는 다른 함수다(Thomas 리뷰 MAJOR, useAuth.js 헤더 참조).
  const reactivateMutation = useReactivateByEmail()

  // AC4: 콜백 error 쿼리(E-AUTH-010) — 프로바이더가 돌아오며 붙인 쿼리스트링을
  // 그대로 읽어 배너로만 보여준다(봉투 아님 — api-contracts.md §3.4).
  const socialCallbackError = searchParams.get('error')

  // Thomas 리뷰 MINOR: emailRef가 그냥 죽은 ref로 남아있던 것을 첫 필드
  // autofocus에 실제로 쓴다 — 화면 도착 시 바로 타이핑을 시작할 수 있게.
  useEffect(() => {
    emailRef.current?.focus()
  }, [])

  const submit = (e) => {
    e.preventDefault()
    setReactivateInfo(null)
    loginMutation.mutate(
      { email, password },
      {
        onSuccess: () => navigate('/', { replace: true }),
        onError: (error) => {
          // 실서버 카탈로그(ErrorCode.java/errors.properties, 대조 2026-08-03):
          // E-AUTH-005 이메일 인증 미완료(403), E-AUTH-008 비활성화된 계정(409).
          // 이전엔 서버 enum에 없는 `E-AUTH-UNVERIFIED`/`E-AUTH-DEACTIVATED`를
          // 임의로 썼다.
          if (error?.code === 'E-AUTH-005') {
            navigate('/verify-email', { state: { email: error.details?.email ?? email } })
            return
          }
          if (error?.code === 'E-AUTH-008') {
            setReactivateInfo(error.details)
          }
        },
      },
    )
  }

  // DEV: 실제 소셜 로그인은 브라우저가 프로바이더로 완전히 나갔다가 콜백
  // 쿼리스트링으로 돌아오는 리다이렉트다(우리 axios 인스턴스를 거치지
  // 않음 — authApi.js 헤더 참조). 그 왕복을 클릭 한 번으로 재현할 방법이
  // 없어, 성공 케이스만 즉시 대시보드 이동으로 시연한다. 실패 배너는
  // `/login?error=E-AUTH-010`으로 직접 접근해 확인할 수 있다(위 socialCallbackError
  // 분기). 실 통합 시 이 자리는 `window.location.href = <프로바이더 인가 URL>`로
  // 바뀐다.
  const handleSocialSelect = () => {
    navigate('/', { replace: true })
  }

  const loginErrorCopy =
    loginMutation.error?.code === 'E-AUTH-001'
      ? '이메일 또는 비밀번호가 올바르지 않습니다'
      : loginMutation.isError && loginMutation.error?.code !== 'E-AUTH-008'
        ? '로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.'
        : null

  return (
    <AuthShell
      footer={
        <span>
          계정이 없으신가요?{' '}
          <Link to="/signup" className="font-medium text-brand-600 hover:underline">
            회원가입
          </Link>
        </span>
      }
    >
      {socialCallbackError && (
        <Banner
          tone="danger"
          sticky={false}
          dismissible
          onDismiss={() => {
            searchParams.delete('error')
            setSearchParams(searchParams, { replace: true })
          }}
          icon={<span aria-hidden="true">!</span>}
          message="소셜 로그인에 실패했습니다. 다시 시도해 주세요."
        />
      )}

      <form onSubmit={submit} className="flex flex-col gap-4">
        <h1 className="sr-only">로그인</h1>

        <label className="flex flex-col gap-1">
          <span className="text-caption font-medium text-text-muted">이메일</span>
          <input
            ref={emailRef}
            type="email"
            autoComplete="email"
            placeholder="example@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-describedby={loginErrorCopy ? errorId : undefined}
            aria-invalid={loginErrorCopy ? true : undefined}
            className={FIELD}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-caption font-medium text-text-muted">비밀번호</span>
          <input
            type="password"
            autoComplete="current-password"
            placeholder="비밀번호 입력"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby={loginErrorCopy ? errorId : undefined}
            aria-invalid={loginErrorCopy ? true : undefined}
            className={FIELD}
          />
        </label>

        {loginErrorCopy && (
          <span id={errorId} role="alert" className="text-caption text-danger-700">
            {loginErrorCopy}
          </span>
        )}

        <div className="flex justify-end">
          <Link to="/reset-password" className="text-caption text-text-muted hover:underline">
            비밀번호를 잊으셨나요?
          </Link>
        </div>

        <Button type="submit" variant="primary" size="lg" loading={loginMutation.isPending} disabled={!email || !password}>
          로그인
        </Button>
      </form>

      <div className="flex items-center gap-3 text-caption text-text-muted">
        <span className="h-px flex-1 bg-border" />
        또는
        <span className="h-px flex-1 bg-border" />
      </div>

      <SocialButtons onSelect={handleSocialSelect} disabled={loginMutation.isPending} />

      {/* QA/리뷰용 데모 계정 힌트 — 프로덕션 카피가 아니라 개발 편의 캡션. */}
      <p className="text-center text-caption text-text-disabled">{DEMO_HINT}</p>

      <OvlAccountReactivate
        open={Boolean(reactivateInfo)}
        info={reactivateInfo}
        submitting={reactivateMutation.isPending}
        onClose={() => setReactivateInfo(null)}
        onReactivate={() =>
          reactivateMutation.mutate(reactivateInfo?.email, {
            onSuccess: () => {
              setReactivateInfo(null)
              navigate('/', { replace: true })
            },
          })
        }
      />
    </AuthShell>
  )
}

export default LoginPage
