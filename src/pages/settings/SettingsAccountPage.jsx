import { useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog } from '../../components/common/Dialog'
import { BottomSheet } from '../../components/common/BottomSheet'
import { Button } from '../../components/common/Button'
import { Banner } from '../../components/common/Banner'
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton'
import { ErrorState } from '../../components/common/ErrorState'
import { OvlAccountDeactivate } from '../../components/auth/OvlAccountDeactivate'
import { OvlAccountReactivate } from '../../components/auth/OvlAccountReactivate'
import { PasswordChangeDialog } from '../../components/settings/PasswordChangeDialog'
import { deriveReactivationInfo } from '../../features/auth/reactivationInfo'
import { useLogout } from '../../features/auth/useAuth'
import { suppressPendingSelfBack } from '../../utils/overlayHistory'
import { useLockedIsDesktop } from '../../hooks/useMediaQuery'
import {
  useAccount,
  useUpdateAccount,
  useDeactivateAccount,
  useReactivateAccount,
} from '../../features/settings/useSettings'
import { toast } from '../../hooks/useToasts'

const FIELD =
  'w-full rounded-control border border-border bg-surface px-3 py-2 text-label text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring'

function ConfirmDialog({ title, body, confirmLabel, confirmVariant = 'primary', onClose, onConfirm, submitting }) {
  // D1: 부모가 열릴 때만 새로 마운트(fresh per open) — 마운트 시점에 고정.
  const isDesktop = useLockedIsDesktop()
  const titleId = useId()
  const confirmRef = useRef(null)

  // submitting 중엔 닫을 수 없다(Thomas 리뷰 S2, PasswordChangeDialog의 B1/B2와
  // 같은 이유) — handleLogout처럼 "확인" 클릭 뒤에도 다이얼로그를 onSettled까지
  // 열어 두는 호출부라면, 그 사이 취소로 닫을 수 있게 두면 사용자가 "취소했다"고
  // 믿은 뒤에 이미 날아간 요청이 뒤늦게 성공해 동의 없이 다음 동작(로그아웃
  // 이동 등)이 실행된다. onClose 자체를 undefined로 끊는 이유(래퍼로 삼키지
  // 않는 이유)는 PasswordChangeDialog.jsx 헤더의 "닫기를 막는 방식도..." 단락
  // 참고 — useOverlayBackButton.js가 onClose의 유무 자체로 "닫을 수 없는
  // 오버레이"를 판정하기 때문에, 내부에서 no-op하는 함수를 넘기면 하드웨어
  // 뒤로 가기가 보호 엔트리를 되돌려 놓지 못한다.
  const closeDialog = submitting ? undefined : onClose

  const content = (
    <div className="flex flex-col gap-4">
      <h2 id={titleId} className="text-title font-semibold text-text">
        {title}
      </h2>
      <p className="text-body text-text-muted">{body}</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="md" onClick={closeDialog} disabled={submitting}>
          취소
        </Button>
        <Button ref={confirmRef} variant={confirmVariant} size="md" loading={submitting} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  )

  if (isDesktop) {
    return (
      <Dialog open onClose={closeDialog} labelledById={titleId} initialFocusRef={confirmRef}>
        {content}
      </Dialog>
    )
  }
  return (
    <BottomSheet open onClose={closeDialog} labelledById={titleId} initialFocusRef={confirmRef}>
      {content}
    </BottomSheet>
  )
}

// 이름 변경 (오너 리뷰 3차, item 5). ProjectManageForm 등 이 코드베이스의 다른
// 폼과 같은 모양: 폼 자체 state는 로컬, 서버 왕복은 useUpdateAccount 하나.
function NameEditDialog({ currentName, onClose, onSubmit, submitting }) {
  // D1: 부모가 열릴 때만 새로 마운트(fresh per open) — 마운트 시점에 고정.
  const isDesktop = useLockedIsDesktop()
  const titleId = useId()
  const inputRef = useRef(null)
  const [name, setName] = useState(currentName)
  const trimmed = name.trim()

  const submit = (e) => {
    e.preventDefault()
    if (!trimmed || submitting) return
    onSubmit(trimmed)
  }

  const content = (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h2 id={titleId} className="text-title font-semibold text-text">
        이름 변경
      </h2>
      <label className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">이름</span>
        <input ref={inputRef} type="text" value={name} onChange={(e) => setName(e.target.value)} className={FIELD} />
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="md" onClick={onClose}>
          취소
        </Button>
        <Button type="submit" variant="primary" size="md" loading={submitting} disabled={!trimmed}>
          저장
        </Button>
      </div>
    </form>
  )

  if (isDesktop) {
    return (
      <Dialog open onClose={onClose} labelledById={titleId} initialFocusRef={inputRef}>
        {content}
      </Dialog>
    )
  }
  return (
    <BottomSheet open onClose={onClose} labelledById={titleId} initialFocusRef={inputRef}>
      {content}
    </BottomSheet>
  )
}

/*
  SettingsAccountPage — 계정 (ACCT-01/02, §ST-F1-12 AC "계정 정보 + 비활성화/
  재활성화 진입") + 오너 리뷰 3차(item 5) 로그아웃·이름 변경. [가정-확장]
  account 리소스 (settingsApi.js 헤더).

  "비밀번호 변경"(로그인 상태에서 현재+새 비밀번호로 바꾸는 ACCT-02)은 이제
  실제로 동작한다 — PATCH /users/me/password(계약 openapi.yaml ~362행,
  PasswordChangeService.java). AUTH-06(이메일로 받은 링크로 재설정,
  `/reset-password`)과는 다른 경로다 — 이쪽은 로그인된 상태에서 본인이
  현재 비밀번호로 재확인한다. 버튼은 로그아웃·계정 비활성화와 같은 줄(오너
  지시 2026-10-13 — "위험도 오름차순" 순서, 아래 그 줄의 코멘트 참조)에
  있다. 소셜 가입 계정(loginType===SOCIAL)은 비밀번호 자체가 없어 그 줄에
  버튼을 넣지 않고 줄 아래 캡션으로 안내한다 — 서버가 "현재 비밀번호
  불일치"와 "비밀번호 없음"을 같은 코드(E-USER-001)로 합쳐 응답하므로
  (PasswordChangeService.java javadoc — 계정 존재 비노출), 화면이 먼저
  걸러 주지 않으면 소셜 계정 사용자는 매번 "비밀번호가 틀렸다"는 오해를
  사는 오류만 받는다.

  폼·오류 분기는 components/settings/PasswordChangeDialog.jsx가 갖고 있다
  (AppleConnectDialog와 같은 모양 — 다이얼로그가 자기 mutation을 직접 들고
  인라인 오류를 스스로 그린다). 이 페이지는 성공 뒤의 다음 동작만 책임진다
  — 아래 handlePasswordChangeSuccess 참조.

  "캘린더 연동"은 더 이상 여기 없다 — 오너 리뷰 3차(item 4)로 독립 하위 화면
  (SettingsCalendarPage)으로 다시 분리됐다(라운드 2에서 여기 섹션으로 합쳤던
  것의 정정).

  로그아웃(item 5): W5(2026-08-18)부터 진짜 로그아웃이다 — 실서버가
  DELETE /auth/session 에 204와 함께 op_at·op_rt 를 만료시키는 Set-Cookie 를
  내려준다(실측). 정리는 features/auth/useAuth.js 의 `useLogout()` 이 한다
  (Thomas 리뷰 MAJOR: 이 화면이 queryClient 를 직접 부르며 훅을 우회하던 것을
  고친 것). 이동 목적지는 홈이 아니라 로그인 화면이다 — 아래 handleLogout 참조.

  비활성화/재활성화(ACCT-04/05): 이 화면 전용 ConfirmDialog였던 것을 ST-F1-14가
  만든 공용 OvlAccountDeactivate/OvlAccountReactivate로 교체했다(오너 지시
  "모달·로직 재사용/정리") — SCR-AUTH-LOGIN의 비활성 계정 분기가 쓰는 것과
  정확히 같은 컴포넌트라, 데이터 범위 문구·유예기간 카운트다운·삭제 안내
  서브상태가 두 진입점 모두에서 항상 같은 내용을 보여준다.
*/
function SettingsAccountPage() {
  const navigate = useNavigate()
  const accountQuery = useAccount()
  const updateAccount = useUpdateAccount()
  const deactivateAccount = useDeactivateAccount()
  const reactivateAccount = useReactivateAccount()
  const logoutMutation = useLogout()
  const [confirmAction, setConfirmAction] = useState(null) // 'deactivate' | 'reactivate' | 'logout' | null
  const [nameEditOpen, setNameEditOpen] = useState(false)
  const [passwordChangeOpen, setPasswordChangeOpen] = useState(false)

  if (accountQuery.isLoading) return <LoadingSkeleton preset="card" />
  if (accountQuery.isError) return <ErrorState variant="section" onAction={() => accountQuery.refetch()} />

  const account = accountQuery.data
  // 유예기간 경과 여부(ACCT-06)를 이 화면의 상단 배너·버튼과 모달이 똑같이
  // 반영하도록 한 번만 계산 — OvlAccountReactivate에는 이미 계산된 값을
  // 그대로 넘긴다(그 컴포넌트 자체는 fetching도, day-math도 하지 않는다).
  const reactivationInfo =
    account.status === 'DEACTIVATED'
      ? deriveReactivationInfo({
          deactivatedAt: account.deactivatedAt,
          reactivationDeadlineDays: account.reactivationDeadlineDays,
        })
      : null

  const handleLogout = () => {
    // useLogout()이 DELETE /auth/session + 쿼리 캐시 정리를 함께 한다 — 서버
    // 호출 성공/실패와 무관하게 onSettled에서 정리하므로 여기서도 then/catch
    // 분기 없이 그대로 이어간다.
    //
    // 목적지가 '/'가 아니라 '/login'인 이유(W5 실측으로 드러난 결함):
    // '/'로 보내면 로그아웃했는데도 대시보드에 그대로 남는다. React Router는
    // 이미 매칭돼 있던 부모 라우트의 로더를 재실행하지 않기 때문이다 —
    // /settings/account 와 '/' 는 같은 AppLayout 트리라, 그 사이 이동은
    // sessionGuardLoader 를 아예 돌리지 않는다(sessionGuardShouldRevalidate 가
    // 넘겨받는 defaultShouldRevalidate 자체가 false다). 그래서 "세션이 없으니
    // 로그인 화면으로" 판정을 내려 줄 사람이 없고, 화면의 모든 요청만 401로
    // 깨진 채 대시보드가 남았다. 로그아웃의 목적지는 원래 로그인 화면이므로,
    // 가드에 기대지 말고 직접 보낸다.
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        setConfirmAction(null)
        toast({ tone: 'info', message: '로그아웃했습니다' })
        // ConfirmDialog를 닫는 것(바로 위 setConfirmAction(null))과 다른 pathname으로
        // 이동하는 것이 같은 틱에 겹친다 — overlayHistory.js의 self-back() 지연 재확인이
        // 이 이동을 미처 못 보고 먼저 끼어들면 로그인 화면으로의 이동이 되돌려진다(owner
        // 리뷰 S2). navigate() 바로 앞에서 알려 그 재확인이 포기하게 한다.
        suppressPendingSelfBack()
        navigate('/login', { replace: true })
      },
    })
  }

  // ACCT-02 성공 뒤의 다음 동작. PasswordChangeDialog의 PATCH 200 자체는
  // "지금 쥔 access 토큰을 끊지 않는다"(settingsApi.changePassword 헤더 참조)
  // — 서버가 즉시 폐기하는 것은 refresh 세션뿐이라, 아무것도 안 하면 사용자는
  // 최대 30분 동안 "로그인된 것처럼" 화면에 남아 있다가, 다음 토큰 갱신
  // 시점에야 영문 모를 타이밍으로 OVL-SESSION("세션이 만료되었습니다")을
  // 보게 된다 — 방금 스스로 한 일과 연결되지 않는 문구다. 그래서 여기서
  // 먼저 기존 로그아웃 경로(위 handleLogout과 같은 useLogout())로 나가,
  // "비밀번호를 바꿨으니 다시 로그인하라"는 의도가 분명한 안내를 보여준다
  // — 서버의 지연된 세션 정리를 기다리지 않고 화면이 선제적으로 정리한다.
  //
  // 다이얼로그를 여기서 바로 닫지 않는다(#81 리뷰 "늦은 suppress"와 같은 모양의
  // 사고를 여기서도 피하기 위해 — overlayHistory.js 헤더의 "닫기와 이동의 경합"
  // 참고). PasswordChangeDialog는 비밀번호 PATCH가 성공한 뒤에도 오버레이
  // 스택에 그대로 남아 있고(아래 JSX의 `finalizing={logoutMutation.isPending}`이
  // 그동안 Esc/배경 클릭/취소를 막는다), logoutMutation이 실제로 끝난 바로 그
  // onSettled 안에서만 닫기·suppress·이동을 한 틱에 함께 한다 — handleLogout과
  // 정확히 같은 모양. 만약 여기서 먼저 다이얼로그를 닫아 버리면, 오버레이
  // 스택이 0이 되는 시점과 실제 navigate() 시점 사이에 로그아웃 네트워크
  // 왕복(수십 ms보다 훨씬 긴) 전체가 끼어들어, 더블 rAF 재확인 창 안에 이미
  // self-back()이 불려 버린 뒤에야 navigate()가 도착한다.
  const handlePasswordChangeSuccess = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        setPasswordChangeOpen(false)
        toast({ tone: 'success', message: '비밀번호를 변경했습니다. 새 비밀번호로 다시 로그인해 주세요' })
        // ConfirmDialog를 닫는 것과 다른 pathname으로 이동하는 것이 같은 틱에
        // 겹친다 — handleLogout과 동일한 이유(owner 리뷰 S2)로 navigate() 바로
        // 앞에서 알려야 한다.
        suppressPendingSelfBack()
        navigate('/login', { replace: true })
      },
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 id="settings-detail-title" className="text-title font-semibold text-text">
        계정 관리
      </h2>

      <section className="flex flex-col gap-3 rounded-card border border-border p-4">
        <div className="flex items-end justify-between gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-caption text-text-muted">이름</span>
            <span className="text-label text-text">{account.name}</span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setNameEditOpen(true)}>
            이름 변경
          </Button>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-caption text-text-muted">이메일</span>
          <span className="text-label text-text">{account.email}</span>
        </div>
      </section>

      <div className="h-px bg-border" />

      {reactivationInfo ? (
        <div className="flex flex-col gap-3">
          <Banner
            tone={reactivationInfo.deletionEligible ? 'danger' : 'warning'}
            sticky={false}
            icon={<span aria-hidden="true">!</span>}
            message={
              reactivationInfo.deletionEligible
                ? `유예기간(${reactivationInfo.reactivationDeadlineDays}일)이 지나 계정 데이터가 삭제되었습니다`
                : `계정이 비활성화되어 있습니다 · ${reactivationInfo.daysRemaining}일 이내 재활성화하지 않으면 삭제됩니다`
            }
          />
          <div>
            {reactivationInfo.deletionEligible ? (
              <Button variant="primary" size="md" onClick={() => navigate('/signup')}>
                회원가입하기
              </Button>
            ) : (
              <Button variant="primary" size="md" onClick={() => setConfirmAction('reactivate')}>
                계정 재활성화
              </Button>
            )}
          </div>
        </div>
      ) : (
        // 오너 지시(2026-10-13): "비밀번호 변경"을 이 그룹 안으로 옮긴다 —
        // 전엔 독립된 `<div>`에 혼자 있어 로그아웃·계정 비활성화와 다른
        // 줄처럼 보였다. 순서는 위험도 오름차순(비밀번호 변경 → 로그아웃 →
        // 계정 비활성화) — 파괴적인 동작(danger 스타일 유지)을 항상 맨
        // 끝에 둔다. flex-wrap으로 좁은 화면에서는 줄바꿈되고(기존 관례,
        // 변경 전에도 이 줄이 쓰던 것), 세 버튼이 넘치지 않는다.
        //
        // 이 그룹은 reactivationInfo가 없을 때(계정이 ACTIVE)만 렌더된다 —
        // DEACTIVATED 분기(위 reactivationInfo 쪽)는 로그아웃·계정
        // 비활성화 버튼도 원래 여기 없었으므로, 비밀번호 변경도 그 분기에선
        // 보이지 않는 것이 일관적이다(복구 대기 중인 계정에서 비밀번호를
        // 바꿀 이유가 없다).
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {account.loginType !== 'SOCIAL' && (
              <Button variant="secondary" size="md" onClick={() => setPasswordChangeOpen(true)}>
                비밀번호 변경
              </Button>
            )}
            <Button variant="secondary" size="md" onClick={() => setConfirmAction('logout')}>
              로그아웃
            </Button>
            <Button variant="danger" size="md" onClick={() => setConfirmAction('deactivate')}>
              계정 비활성화
            </Button>
          </div>
          {account.loginType === 'SOCIAL' && (
            // 소셜 가입 계정엔 비밀번호 자체가 없다 — 위 페이지 헤더 참조.
            // 버튼을 빼는 대신 그룹 아래에 캡션으로만 안내해, 세 버튼짜리
            // 줄에서 버튼 하나가 문구로 치환돼 줄 높이가 들쑥날쑥해지지
            // 않게 한다.
            <p className="text-caption text-text-muted">소셜 로그인 계정은 비밀번호가 없습니다</p>
          )}
        </div>
      )}

      {nameEditOpen && (
        <NameEditDialog
          currentName={account.name}
          submitting={updateAccount.isPending}
          onClose={() => setNameEditOpen(false)}
          onSubmit={(name) =>
            updateAccount.mutate(
              { name },
              {
                onSuccess: () => {
                  setNameEditOpen(false)
                  toast({ tone: 'success', message: '이름을 변경했습니다' })
                },
              },
            )
          }
        />
      )}

      {passwordChangeOpen && (
        <PasswordChangeDialog
          onClose={() => setPasswordChangeOpen(false)}
          onSuccess={handlePasswordChangeSuccess}
          // 비밀번호 PATCH가 끝난 뒤에도 logoutMutation이 정착할 때까지는
          // 닫을 수 없게 한다 — 위 handlePasswordChangeSuccess 주석 참고.
          finalizing={logoutMutation.isPending}
        />
      )}

      {confirmAction === 'logout' && (
        <ConfirmDialog
          title="로그아웃할까요?"
          body="현재 세션 정보를 지우고 홈으로 이동합니다."
          confirmLabel="로그아웃"
          submitting={logoutMutation.isPending}
          onClose={() => setConfirmAction(null)}
          onConfirm={handleLogout}
        />
      )}
      <OvlAccountDeactivate
        open={confirmAction === 'deactivate'}
        reactivationDeadlineDays={account.reactivationDeadlineDays}
        submitting={deactivateAccount.isPending}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => deactivateAccount.mutate(undefined, { onSuccess: () => setConfirmAction(null) })}
      />
      <OvlAccountReactivate
        open={confirmAction === 'reactivate'}
        info={reactivationInfo}
        submitting={reactivateAccount.isPending}
        onClose={() => setConfirmAction(null)}
        onReactivate={() => reactivateAccount.mutate(undefined, { onSuccess: () => setConfirmAction(null) })}
      />
    </div>
  )
}

export default SettingsAccountPage
