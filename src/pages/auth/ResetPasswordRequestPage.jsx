import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthShell } from '../../components/auth/AuthShell'
import { Button } from '../../components/common/Button'
import { ErrorState } from '../../components/common/ErrorState'
import { CheckCircleIcon } from '../../components/common/statusIcons'
import { useRequestPasswordReset } from '../../features/auth/useAuth'

const FIELD =
  'w-full rounded-control border border-border bg-surface px-3 py-2 text-label text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring'

/*
  SCR-AUTH-RESET-REQ (AUTH-05). The success view is shown for EVERY submitted
  email, whether or not an account exists for it — same "계정 존재 비노출"
  principle SCR-AUTH-LOGIN's failure copy follows (ui-spec §AUTH, AC2), just
  applied to the opposite direction (a neutral success instead of a neutral
  failure): revealing "그런 계정 없음" here would let anyone probe which
  emails are registered one at a time.
*/
export function ResetPasswordRequestPage() {
  const [email, setEmail] = useState('')
  const requestMutation = useRequestPasswordReset()

  const submit = (e) => {
    e.preventDefault()
    if (!email || requestMutation.isPending) return
    requestMutation.mutate(email)
  }

  if (requestMutation.isSuccess) {
    return (
      <AuthShell>
        <div className="flex flex-col items-center gap-3 text-center">
          <CheckCircleIcon className="text-success-600" size={40} />
          <p className="text-body font-medium text-text">재설정 메일을 보냈습니다</p>
          <p className="text-label text-text-muted">
            <span className="font-medium text-text">{email}</span>(으)로 발송된 링크는 계정이 있는 경우에만
            유효합니다
          </p>
        </div>
        <Link to="/login" className="text-center text-label font-medium text-brand-600 hover:underline">
          로그인으로 돌아가기
        </Link>
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
        <div>
          <h1 className="text-title font-semibold text-text">비밀번호 재설정</h1>
          <p className="mt-1 text-label text-text-muted">가입한 이메일을 입력하면 재설정 링크를 보내드려요</p>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-caption font-medium text-text-muted">이메일</span>
          <input
            type="email"
            autoComplete="email"
            placeholder="example@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={FIELD}
          />
        </label>

        {/* Thomas 리뷰 MAJOR: 이전엔 requestMutation.isError를 아예 안 봐서
            네트워크·5xx 등 진짜 실패가 아무 피드백 없이 조용히 사라졌다 —
            "계정 존재 비노출"은 성공 뷰가 항상 같다는 뜻이지, 요청 자체가
            실패했을 때도 무음이어야 한다는 뜻이 아니다. */}
        {requestMutation.isError && (
          <ErrorState variant="inline" title="요청을 처리하지 못했습니다" onAction={() => requestMutation.mutate(email)} />
        )}

        <Button type="submit" variant="primary" size="lg" loading={requestMutation.isPending} disabled={!email}>
          재설정 메일 발송
        </Button>
      </form>
    </AuthShell>
  )
}

export default ResetPasswordRequestPage
