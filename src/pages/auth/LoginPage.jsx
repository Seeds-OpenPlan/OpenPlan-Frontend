import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthShell } from '../../components/auth/AuthShell'
import { SocialButtons } from '../../components/auth/SocialButtons'
import { OvlAccountReactivate } from '../../components/auth/OvlAccountReactivate'
import { Button } from '../../components/common/Button'
import { Banner } from '../../components/common/Banner'
import { useLogin, useReactivateByEmail } from '../../features/auth/useAuth'
import { oauthStartUrl } from '../../features/auth/authApi'

const FIELD =
  'w-full rounded-control border border-border bg-surface px-3 py-2 text-label text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring'

// 데모 계정 힌트 제거(W5, 2026-08-18). `user@openplan.dev` 등 4종은
// authFixtures.js의 **mock 전용** 계정이라 실서버에는 존재하지 않는다.
// 프록시가 실서버를 보게 된 지금 저 안내를 보고 시도하면 E-AUTH-001로만
// 떨어져, "로그인이 안 된다"는 잘못된 결론을 만든다. 실서버에서 계정을
// 얻는 경로는 회원가입(POST /users) → 인증 메일뿐이다.

/*
  SCR-AUTH-LOGIN (AUTH-01 · AC2 실패 카피/비활성 분기 · AC4 소셜 콜백 오류).

  로그인 성공 시 '/'(대시보드)로 이동한다. W5(2026-08-18)부터 이 이동은 실제로
  "인증했기 때문에" 통과한다 — dev-auth 스텁을 보던 프록시가 실서버로 바뀌었고
  (vite.config.js), sessionGuardLoader가 401을 이 화면으로 되돌려 보낸다.
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

  /*
    AUTH-02 AC4 — 소셜 인가 시작(W5 실연결). 브라우저를 통째로 서버로 보낸다:
    `GET /auth/oauth/{provider}`가 302로 제공자 인가 페이지를 가리키고, 사용자가
    동의하면 콜백(`/auth/oauth/{provider}/callback`)이 httpOnly 쿠키를 심은 뒤
    다시 302로 우리 화면에 돌려보낸다. 실패 시에는 `/login?error=E-AUTH-010`으로
    돌아오는데, 그 쿼리는 위 socialCallbackError 배너가 이미 받고 있다.

    navigate()가 아니라 window.location.href인 이유: 이건 라우터 안의 화면 전환이
    아니라 오리진 밖으로 나가는 문서 이동이다. SPA 라우팅으로는 서버의 302를
    브라우저가 따라갈 기회 자체가 없고, axios로 불러도 XHR이 302를 대신 따라가
    제공자 HTML만 받아올 뿐 브라우저는 그대로 남는다(authApi.oauthStartUrl 헤더).

    이전에는 이 자리가 곧장 `navigate('/')`였다 — 클릭 한 번으로 왕복을 재현할
    수 없어 성공 케이스만 흉내 낸 mock이었고, 서버를 거치지 않고 대시보드로
    들어가 버렸다.
  */
  const handleSocialSelect = (provider) => {
    window.location.href = oauthStartUrl(provider)
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
