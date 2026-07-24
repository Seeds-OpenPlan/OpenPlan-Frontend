import { useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Dialog } from '../../components/common/Dialog'
import { BottomSheet } from '../../components/common/BottomSheet'
import { Button } from '../../components/common/Button'
import { Banner } from '../../components/common/Banner'
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton'
import { ErrorState } from '../../components/common/ErrorState'
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

  "비밀번호 변경" is shown (매치 Desktop.Settings.png's own row subtitle
  "프로필·비밀번호 변경") but stays DISABLED with a reason: that flow belongs to
  ST-F1-14 (인증 화면, 4주차 예정) which doesn't exist yet in this codebase —
  a fake password form here would be dishonest completion, not real completion.

  "캘린더 연동"은 더 이상 여기 없다 — 오너 리뷰 3차(item 4)로 독립 하위 화면
  (SettingsCalendarPage)으로 다시 분리됐다(라운드 2에서 여기 섹션으로 합쳤던
  것의 정정).

  로그아웃(item 5): ST-F1-14(실 인증) 이전이라 dev-auth 스텁이 항상 200을
  주는 세션이다 — 진짜 "로그아웃 상태"를 만들 방법이 없다(다음 페이지 진입 시
  sessionGuardLoader가 스텁을 통해 즉시 다시 통과시킨다). 그래서 이 버튼은
  정직하게 "지금 캐시된 세션 정보를 지우고 홈으로 보낸다"까지만 한다 — 그 이상
  가장하지 않는다(오너 지시 "mock/스텁 동작 — 세션 클리어 후 랜딩 이동"과 일치).

  비활성화/재활성화 themselves ARE implemented end-to-end against the mock
  (not just "진입"): ST-F1-14 owns the FULL OVL-ACCT-DEACT/REACT modals this
  AC's real estate will eventually replace, but nothing else in this codebase
  builds that flow yet, so this screen's own confirm dialog does the whole
  round-trip (완결 우선 — 오너 방침) rather than leaving a dead-end button.
*/
function SettingsAccountPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const accountQuery = useAccount()
  const updateAccount = useUpdateAccount()
  const deactivateAccount = useDeactivateAccount()
  const reactivateAccount = useReactivateAccount()
  const [confirmAction, setConfirmAction] = useState(null) // 'deactivate' | 'reactivate' | 'logout' | null
  const [nameEditOpen, setNameEditOpen] = useState(false)

  if (accountQuery.isLoading) return <LoadingSkeleton preset="card" />
  if (accountQuery.isError) return <ErrorState variant="section" onAction={() => accountQuery.refetch()} />

  const account = accountQuery.data

  const handleLogout = () => {
    // ['auth','session']은 router.js의 sessionGuardLoader가 쓰는 바로 그 키 —
    // 지워야 "로그아웃"이라는 이 화면의 약속이 조금이라도 실제 효과를 갖는다.
    queryClient.removeQueries({ queryKey: ['auth', 'session'] })
    setConfirmAction(null)
    toast({ tone: 'info', message: '로그아웃했습니다' })
    navigate('/', { replace: true })
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
        <Button
          variant="secondary"
          size="md"
          disabled
          disabledReason="인증 화면 구현 후 제공됩니다"
        >
          비밀번호 변경
        </Button>
      </div>

      <div className="h-px bg-border" />

      {account.status === 'DEACTIVATED' ? (
        <div className="flex flex-col gap-3">
          <Banner
            tone="warning"
            sticky={false}
            icon={<span aria-hidden="true">!</span>}
            message={`계정이 비활성화되어 있습니다 · ${account.reactivationDeadlineDays}일 이내 재활성화하지 않으면 삭제될 수 있습니다`}
          />
          <div>
            <Button variant="primary" size="md" onClick={() => setConfirmAction('reactivate')}>
              계정 재활성화
            </Button>
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
          onClose={() => setConfirmAction(null)}
          onConfirm={handleLogout}
        />
      )}
      {confirmAction === 'deactivate' && (
        <ConfirmDialog
          title="계정을 비활성화할까요?"
          body={`비활성화하면 계획에 접근할 수 없습니다. ${account.reactivationDeadlineDays}일 이내 다시 로그인하면 복구할 수 있습니다.`}
          confirmLabel="비활성화"
          confirmVariant="danger"
          submitting={deactivateAccount.isPending}
          onClose={() => setConfirmAction(null)}
          onConfirm={() => deactivateAccount.mutate(undefined, { onSuccess: () => setConfirmAction(null) })}
        />
      )}
      {confirmAction === 'reactivate' && (
        <ConfirmDialog
          title="계정을 재활성화할까요?"
          body="다시 활성화하면 곧바로 대시보드를 이용할 수 있습니다."
          confirmLabel="재활성화"
          submitting={reactivateAccount.isPending}
          onClose={() => setConfirmAction(null)}
          onConfirm={() => reactivateAccount.mutate(undefined, { onSuccess: () => setConfirmAction(null) })}
        />
      )}
    </div>
  )
}

export default SettingsAccountPage
