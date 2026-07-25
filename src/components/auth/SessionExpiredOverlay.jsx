import { useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog } from '../common/Dialog'
import { BottomSheet } from '../common/BottomSheet'
import { Button } from '../common/Button'
import { ErrorState } from '../common/ErrorState'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import { useSessionStore } from '../../features/auth/sessionStore'
import { useLogin } from '../../features/auth/useAuth'

const FIELD =
  'w-full rounded-control border border-border bg-surface px-3 py-2 text-label text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring'

/*
  OVL-SESSION (AUTH-08). Mounted ONCE in AppLayout, alongside Toaster/
  UnsavedGuard/OfflineBanner — see that file's own comment for why (it must
  sit ABOVE the routed page tree without ever replacing it: NFR-019 "배경
  언마운트 금지" means whatever draft the user had open — an un-submitted plan
  edit, a half-filled form — is still there, still mounted, the instant this
  overlay closes).

  `onClose` is intentionally omitted from both Dialog/BottomSheet below (same
  choice OVL-CONFLICT makes): a session-expired gate isn't something Esc/
  backdrop-click should let you shrug off — re-authenticating is the only way
  out, matching AUTH-08/NFR-004 "재로그인 → previousPath 복귀" (there is no
  "cancel and stay logged out" exit from a modal that exists BECAUSE you're
  no longer logged in).

  Only email/password re-login is offered here, not the 3 social buttons
  SCR-AUTH-LOGIN has: a real social round-trip leaves the page entirely (the
  browser navigates to the provider and back), which the overlay's own
  "background stays mounted" promise can't survive regardless of anything
  this component does — that trade-off belongs to OAuth, not a gap in this
  overlay. A user who signed up via social still has the "재설정 이메일" path
  as a fallback, same as any other app facing this constraint.

  Wiring note: nothing calls `sessionStore.expire()` yet this cycle (owner:
  "가드 건드리지 마") — see sessionStore.js's own header for the exact future
  integration point. This component is fully functional once something does.
*/
export function SessionExpiredOverlay() {
  const isDesktop = useIsDesktop()
  const titleId = useId()
  const emailRef = useRef(null)
  const expired = useSessionStore((s) => s.expired)
  const previousPath = useSessionStore((s) => s.previousPath)
  const resolve = useSessionStore((s) => s.resolve)
  const navigate = useNavigate()
  const loginMutation = useLogin()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  if (!expired) return null

  const submit = (e) => {
    e.preventDefault()
    loginMutation.mutate(
      { email, password },
      {
        onSuccess: () => {
          resolve()
          navigate(previousPath || '/', { replace: true })
        },
      },
    )
  }

  const failureCopy =
    loginMutation.error?.code === 'E-AUTH-401'
      ? '이메일 또는 비밀번호가 올바르지 않습니다'
      : loginMutation.isError
        ? '다시 로그인하지 못했습니다'
        : null

  const content = (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <h2 id={titleId} className="text-title font-semibold text-text">
          세션이 만료되었습니다
        </h2>
        <p className="mt-1 text-label text-text-muted">
          보안을 위해 로그인이 해제되었습니다. 다시 로그인하면 이어서 작업할 수 있습니다.
        </p>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">이메일</span>
        <input
          ref={emailRef}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={FIELD}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">비밀번호</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={FIELD}
        />
      </label>

      {failureCopy && <ErrorState variant="inline" title={failureCopy} />}

      <Button type="submit" variant="primary" size="lg" loading={loginMutation.isPending} disabled={!email || !password}>
        다시 로그인
      </Button>
    </form>
  )

  if (isDesktop) {
    return (
      <Dialog open labelledById={titleId} initialFocusRef={emailRef}>
        {content}
      </Dialog>
    )
  }
  return (
    <BottomSheet open labelledById={titleId} initialFocusRef={emailRef}>
      {content}
    </BottomSheet>
  )
}

export default SessionExpiredOverlay
