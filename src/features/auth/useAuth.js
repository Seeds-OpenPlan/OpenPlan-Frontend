/*
  TanStack Query wiring for ST-F1-14. Server state only (TanStack Query) —
  local form drafts (the email/password the user is currently typing) stay in
  each page's own useState, the same split every other feature in this
  codebase follows (design-handoff §3).

  None of these mutations navigate themselves — same convention
  useDeactivateAccount/useReactivateAccount already follow in useSettings.js.
  The calling PAGE decides where to go on success (e.g. LoginPage → `/`,
  SignupPage → `/verify-email`), because the destination depends on context
  these hooks don't have (previousPath, query params, which account state was
  hit).

  Errors are NOT toasted here (unlike most of this codebase's mutations) — an
  auth failure's message is rendered INLINE in the form (ui-spec §AUTH "계정
  존재 비노출" copy needs to sit right next to the field, not float away as a
  toast), so every hook below lets the rejection propagate to the caller's own
  try/catch or mutate(..., { onError }) untouched.
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  login,
  signup,
  verifyEmail,
  resendVerificationEmail,
  requestPasswordReset,
  confirmPasswordReset,
  logout,
  reactivate,
} from './authApi'
import { apiClient } from '../../api/client'
import { withDevFallback } from '../plan/planApi'

/**
 * Read-only access to the session — SAME queryKey/staleTime as router.js's
 * own `sessionGuardLoader` (`sessionQuery`), so in a real/Swagger-backed env
 * this reads the exact cache entry that loader already warmed, no second
 * request. Unlike that loader, this hook goes through `withDevFallback`: the
 * loader's own catch just swallows a DEV network error and lets navigation
 * proceed with NO session cached at all (there is nothing else on that path
 * that needs `userId`), but this hook's callers DO need a concrete value —
 * see below — so it resolves the dev-auth fixed user (authFixtures.js
 * "dev-user-0001") the same way every other mock-backed hook in this codebase
 * falls back when there is no real backend running.
 *
 * ST-F1-15 (HELP-01~04 AC-1, NFR-030) is this hook's first consumer: a 문의
 * 상세 page needs `data.userId` to compare against a ticket's own owner
 * before rendering it, since a stale/tampered notification `routePath` or a
 * hand-typed URL could otherwise leak another user's answer content.
 */
export function useSession() {
  return useQuery({
    queryKey: ['auth', 'session'],
    queryFn: () =>
      withDevFallback(
        () => apiClient.get('/auth/session'),
        () => Promise.resolve({ userId: 'dev-user-0001', status: 'ACTIVE', authed: true }),
      ),
    staleTime: 5 * 60 * 1000,
  })
}

export function useLogin() {
  return useMutation({ mutationFn: ({ email, password }) => login(email, password) })
}

export function useSignup() {
  return useMutation({ mutationFn: signup })
}

export function useVerifyEmail() {
  return useMutation({ mutationFn: verifyEmail })
}

export function useResendVerificationEmail() {
  return useMutation({ mutationFn: resendVerificationEmail })
}

export function useRequestPasswordReset() {
  return useMutation({ mutationFn: requestPasswordReset })
}

export function useConfirmPasswordReset() {
  return useMutation({ mutationFn: confirmPasswordReset })
}

/**
 * ACCT-03 로그아웃. `['auth','session']`은 router.js의 sessionGuardLoader가
 * 읽는 바로 그 키 — 지워야 이 화면의 "로그아웃"이라는 약속이 조금이라도 실제
 * 효과를 갖는다(SettingsAccountPage가 이미 하던 것과 동일한 캐시 무효화를
 * 여기 한 곳으로 모음). 서버 호출은 best-effort(실패해도 로컬 정리는 계속
 * 진행 — dev-auth 스텁 기간엔 되돌릴 실 세션이 없다).
 */
export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      queryClient.removeQueries({ queryKey: ['auth', 'session'] })
    },
  })
}

/**
 * SCR-AUTH-LOGIN 전용 재활성화(Thomas 리뷰 MAJOR) — 로그인 실패
 * (E-AUTH-DEACTIVATED) 응답의 `details.email`로 지목한, 아직 세션이 없는
 * 계정을 재활성화한다. 이름을 `useReactivateAccount`(아래 재-export, 이미
 * 로그인된 내 계정을 다루는 settings 쪽 훅)와 겹치지 않게 구분했다 — 두 훅을
 * 같은 화면에서 혼동해 부르는 실수를 타입/이름 레벨에서 막기 위함.
 */
export function useReactivateByEmail() {
  return useMutation({ mutationFn: reactivate })
}

// 계정 조회·비활성화·재활성화(ACCT-01/04/05, "로그인된 나" 컨텍스트)는
// settings/useSettings.js에 이미 있다 — 여기서 다시 선언하지 않고 그대로
// 재-export해 OVL-ACCT-DEACT/REACT가 SettingsAccountPage와 정확히 같은 훅을
// 공유하게 한다.
export { useAccount, useDeactivateAccount, useReactivateAccount, accountKey } from '../settings/useSettings'
