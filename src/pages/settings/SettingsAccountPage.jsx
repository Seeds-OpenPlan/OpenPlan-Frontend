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
import { deriveReactivationInfo } from '../../features/auth/reactivationInfo'
import { useLogout } from '../../features/auth/useAuth'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import {
  useAccount,
  useUpdateAccount,
  useDeactivateAccount,
  useReactivateAccount,
} from '../../features/settings/useSettings'
import { toast } from '../../hooks/useToasts'

const FIELD =
  'w-full rounded-control border border-border bg-surface px-3 py-2 text-label text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring'

function formatDateKO(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
}

function ConfirmDialog({ title, body, confirmLabel, confirmVariant = 'primary', onClose, onConfirm, submitting }) {
  const isDesktop = useIsDesktop()
  const titleId = useId()
  const confirmRef = useRef(null)

  const content = (
    <div className="flex flex-col gap-4">
      <h2 id={titleId} className="text-title font-semibold text-text">
        {title}
      </h2>
      <p className="text-body text-text-muted">{body}</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="md" onClick={onClose}>
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
      <Dialog open onClose={onClose} labelledById={titleId} initialFocusRef={confirmRef}>
        {content}
      </Dialog>
    )
  }
  return (
    <BottomSheet open onClose={onClose} labelledById={titleId} initialFocusRef={confirmRef}>
      {content}
    </BottomSheet>
  )
}

// 이름 변경 (오너 리뷰 3차, item 5). ProjectManageForm 등 이 코드베이스의 다른
// 폼과 같은 모양: 폼 자체 state는 로컬, 서버 왕복은 useUpdateAccount 하나.
function NameEditDialog({ currentName, onClose, onSubmit, submitting }) {
  const isDesktop = useIsDesktop()
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

  "비밀번호 변경"(로그인 상태에서 현재+새 비밀번호로 바꾸는 ACCT-02)은 여전히
  DISABLED — ST-F1-14가 만든 건 AUTH-06(이메일로 받은 링크로 재설정)이라 다른
  스토리다. 로그인이 안 될 때의 "비밀번호를 잊으셨나요?"는 이제
  `/reset-password`로 실제로 존재하니, 이 화면의 비활성 버튼은 그 대체 경로가
  아니라 ACCT-02 자체가 아직 없다는 뜻이다. disabledReason 문구는 오너 리뷰
  2026-09-05로 제거했다("별도 스토리에서 지원 예정"이 오해 소지가 있다는
  지적) — 버튼은 여전히 disabled, 이유 캡션만 없앤 것.

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
        <div className="flex flex-col gap-1">
          <span className="text-caption text-text-muted">가입일</span>
          <span className="text-label text-text">{formatDateKO(account.createdAt)}</span>
        </div>
      </section>

      <div>
        <Button variant="secondary" size="md" disabled>
          비밀번호 변경
        </Button>
      </div>

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
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="md" onClick={() => setConfirmAction('logout')}>
            로그아웃
          </Button>
          <Button variant="danger" size="md" onClick={() => setConfirmAction('deactivate')}>
            계정 비활성화
          </Button>
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
