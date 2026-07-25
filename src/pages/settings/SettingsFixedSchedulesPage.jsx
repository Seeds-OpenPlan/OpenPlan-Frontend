import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FixedScheduleForm } from '../../components/settings/FixedScheduleForm'
import { PlusIcon, CalendarIcon } from '../../components/settings/settingsIcons'
import { Badge } from '../../components/common/Badge'
import { Button } from '../../components/common/Button'
import { EmptyState } from '../../components/common/EmptyState'
import { ErrorState } from '../../components/common/ErrorState'
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton'
import { WEEKDAY_KEYS, WEEKDAY_LABELS_KO, formatMinutesLabel } from '../../features/plan/planTime'
import {
  useAllFixedSchedules,
  useCreateFixedSchedule,
  useUpdateFixedSchedule,
  useDeleteFixedSchedule,
} from '../../features/settings/useSettings'
import { toast } from '../../hooks/useToasts'

/*
  SettingsFixedSchedulesPage — 고정일정 관리 (FIX-04~09, §ST-F1-12 AC-2). List +
  CRUD; the live conflict-preview UI itself lives in FixedScheduleForm (see
  that file's own header) — this page only wires the mutations and owns which
  overlay (create / edit+delete / none) is open, same "exactly one overlay,
  page-local state" shape ProjectsPage/WeeklyPage already use.

  `onDraftOpenChange` (optional, additive — every real /settings/fixed-schedules
  caller omits it, so this is a no-op there) fires whenever the create/edit
  overlay opens or closes. ST-F1-13's onboarding wizard embeds this exact page
  as its 고정 일정 step and needs to know when an unsubmitted create/edit form
  is open so its own "다음" can block on it (AC2 "입력 소실 방지" — this page's
  create/edit mutations commit immediately per submit, so there is no ongoing
  "dirty" draft the global useAppStore flag would catch the way the
  availability step's does; the OPEN overlay itself is the only unsaved state).
*/
function SettingsFixedSchedulesPage({ onDraftOpenChange }) {
  const navigate = useNavigate()
  const query = useAllFixedSchedules()
  const createFixedSchedule = useCreateFixedSchedule()
  const updateFixedSchedule = useUpdateFixedSchedule()
  const deleteFixedSchedule = useDeleteFixedSchedule()

  const [formTarget, setFormTargetState] = useState(null) // { mode:'create' } | { mode:'edit', item } | null
  const [conflict, setConflict] = useState(null) // { latest } | null — this form's own E-COM-006

  const setFormTarget = (next) => {
    setFormTargetState(next)
    onDraftOpenChange?.(next !== null)
  }

  if (query.isLoading) return <LoadingSkeleton preset="listRow" count={3} />
  if (query.isError) return <ErrorState variant="section" onAction={() => query.refetch()} />

  const schedules = query.data ?? []

  const closeForm = () => {
    setFormTarget(null)
    setConflict(null)
  }

  // FIX-08 "항목 → 주간 계획 이동". [한계] 주간 화면은 아직 특정 주로 딥링크하는
  // 쿼리 파라미터가 없다(오늘 주로만 진입) — WeeklyPage.jsx는 이 스토리의 소유
  // 파일이 아니라 여기서 추가하지 않았다. 리드에게 후속 필요 여부 확인 필요.
  const goToWeeklyPlan = () => navigate('/weekly')

  const submitCreate = (body) => {
    createFixedSchedule.mutate(body, { onSuccess: closeForm })
  }

  const submitEdit = (body) => {
    if (!formTarget || formTarget.mode !== 'edit') return
    updateFixedSchedule.mutate(
      { fixedScheduleId: formTarget.item.fixedScheduleId, patch: { ...body, version: formTarget.item.version } },
      {
        onSuccess: closeForm,
        onError: (error) => {
          if (error?.code === 'E-COM-006') setConflict({ latest: error.details?.latest })
        },
      },
    )
  }

  const handleDelete = () => {
    if (!formTarget || formTarget.mode !== 'edit') return
    deleteFixedSchedule.mutate(formTarget.item.fixedScheduleId, { onSuccess: closeForm })
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 id="settings-detail-title" className="text-title font-semibold text-text">
        고정일정 관리
      </h2>

      <div className="flex flex-col gap-2">
        <Button
          variant="secondary"
          size="md"
          onClick={() => toast({ tone: 'info', message: '다음 업데이트에서 제공됩니다' })}
        >
          <span className="inline-flex items-center gap-2">
            <CalendarIcon aria-hidden="true" /> 캘린더에서 가져오기
          </span>
        </Button>
        <Button variant="secondary" size="md" onClick={() => setFormTarget({ mode: 'create' })}>
          <span className="inline-flex items-center gap-2">
            <PlusIcon aria-hidden="true" /> 고정일정 직접 추가
          </span>
        </Button>
      </div>

      {schedules.length === 0 ? (
        <EmptyState
          title="등록된 고정 일정이 없습니다"
          description="수업·미팅처럼 매주 반복되는 일정을 등록하면 주간 계획에서 자동으로 자리를 비워 둡니다"
          actionLabel="고정일정 직접 추가"
          onAction={() => setFormTarget({ mode: 'create' })}
        />
      ) : (
        <ul className="overflow-hidden rounded-card border border-border">
          {schedules.map((item) => {
            const dayIdx = WEEKDAY_KEYS.indexOf(item.weekday)
            return (
              <li key={item.fixedScheduleId} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  onClick={() => setFormTarget({ mode: 'edit', item })}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus-ring"
                >
                  <span className="flex flex-col">
                    <span className="text-label font-medium text-text">{item.title}</span>
                    <span className="text-caption text-text-muted">
                      매주 {WEEKDAY_LABELS_KO[dayIdx]} · {formatMinutesLabel(item.startMinutes)} -{' '}
                      {formatMinutesLabel(item.endMinutes)}
                    </span>
                  </span>
                  <Badge
                    tone={item.hasConflict ? 'warning' : 'success'}
                    label={item.hasConflict ? '충돌 가능' : '충돌 없음'}
                  />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {formTarget?.mode === 'create' && (
        <FixedScheduleForm
          mode="create"
          initial={{}}
          onClose={closeForm}
          onSubmit={submitCreate}
          submitting={createFixedSchedule.isPending}
          onNavigateToWeek={goToWeeklyPlan}
        />
      )}
      {formTarget?.mode === 'edit' && (
        <FixedScheduleForm
          mode="edit"
          initial={formTarget.item}
          onClose={closeForm}
          onSubmit={submitEdit}
          onDelete={handleDelete}
          submitting={updateFixedSchedule.isPending}
          deleting={deleteFixedSchedule.isPending}
          conflict={conflict}
          onConflictAccept={() => {
            toast({ tone: 'info', message: '최신 내용을 반영했습니다' })
            closeForm()
            query.refetch()
          }}
          onConflictRetry={() => setConflict(null)}
          onNavigateToWeek={goToWeeklyPlan}
        />
      )}
    </div>
  )
}

export default SettingsFixedSchedulesPage
