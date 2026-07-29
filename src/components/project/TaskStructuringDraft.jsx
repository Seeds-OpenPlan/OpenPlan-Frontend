import { useState } from 'react'
import { EmptyState } from '../common/EmptyState'
import { Button } from '../common/Button'
import { MinuteStepper } from '../plan/MinuteStepper'
import { clampPriority, priorityLabelKO } from '../../features/plan/planPlacement'
import { useCreateStructuringDraft, useApplyStructuringDraft } from '../../features/project/useProjectData'
import { toast } from '../../hooks/useToasts'

/*
  RB-PROJ-01 태스크 구조화 초안 (ui-spec §PROJ.9, AC-4). Owns its own small
  state machine — idle (EmptyState, 2 actions) → generating → ready (editable
  draft rows) — entirely local: nothing here is written to the server until
  "선택 항목 저장" (C-2 이중 보호, "초안입니다" caption makes that explicit).
*/
export function TaskStructuringDraft({ projectId, project, onCreateTaskDirect, disabled, disabledReason }) {
  const [draft, setDraft] = useState(null) // { draftId, tasks: [{taskDraftId, title, estimatedMinutes, priority, checked}] } | null
  const [insufficientInput, setInsufficientInput] = useState(false)

  const createDraft = useCreateStructuringDraft()
  const applyDraft = useApplyStructuringDraft()

  const generate = () => {
    setInsufficientInput(false)
    createDraft.mutate(
      { projectId, body: { goal: project.description, deadline: project.dueDate } },
      {
        onSuccess: (result) => {
          setDraft({
            draftId: result.draftId,
            // The draft's priorities come from the STRUCTURING engine, not from
            // a form, so they're the one place a value outside 1~3 could reach
            // the row's select — which would render it with nothing selected.
            tasks: (result.tasks ?? []).map((t) => ({
              ...t,
              priority: clampPriority(t.priority),
              checked: true,
            })),
          })
        },
        onError: (error) => {
          if (error?.status === 422) setInsufficientInput(true)
          else toast({ tone: 'error', message: '초안을 만들지 못했습니다. 다시 시도해 주세요' })
        },
      },
    )
  }

  if (!draft) {
    return (
      <div className="flex flex-col gap-3">
        <EmptyState
          title="아직 태스크가 없습니다"
          description="구조화 초안으로 시작하거나 직접 추가할 수 있습니다"
          actionLabel="구조화 초안 만들기"
          onAction={generate}
          secondaryActionLabel="태스크 직접 추가"
          onSecondaryAction={onCreateTaskDirect}
          disabled={disabled}
          disabledReason={disabledReason}
        />
        {createDraft.isPending && (
          <p role="status" className="text-center text-caption text-text-muted">
            프로젝트 정보를 바탕으로 태스크 초안을 만들고 있습니다…
          </p>
        )}
        {insufficientInput && (
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-caption text-danger-700">
              초안을 만들 정보가 부족합니다. 프로젝트 설명이나 마감일을 채우면 정확해집니다.
            </p>
          </div>
        )}
      </div>
    )
  }

  const checkedCount = draft.tasks.filter((t) => t.checked).length

  const updateTask = (taskDraftId, patch) =>
    setDraft((d) => ({ ...d, tasks: d.tasks.map((t) => (t.taskDraftId === taskDraftId ? { ...t, ...patch } : t)) }))

  const discard = () => {
    setDraft(null)
    toast({ tone: 'info', message: '초안을 버렸습니다' })
  }

  const save = () => {
    const selectedTaskIds = draft.tasks.filter((t) => t.checked).map((t) => t.taskDraftId)
    applyDraft.mutate(
      { projectId, draftId: draft.draftId, selectedTaskIds },
      { onSuccess: () => setDraft(null) },
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-3">
      <p className="text-caption text-text-muted">초안입니다 — 저장 전에는 반영되지 않습니다</p>
      <ul aria-label={`태스크 초안 ${draft.tasks.length}개`} className="flex flex-col gap-3">
        {draft.tasks.map((t) => (
          <li key={t.taskDraftId} className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={t.checked}
                onChange={(e) => updateTask(t.taskDraftId, { checked: e.target.checked })}
                aria-label={t.title}
              />
            </label>
            <input
              type="text"
              value={t.title}
              onChange={(e) => updateTask(t.taskDraftId, { title: e.target.value })}
              className="min-w-32 flex-1 rounded-control border border-border bg-surface px-2 py-1 text-label text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
            />
            <MinuteStepper
              value={t.estimatedMinutes}
              onChange={(v) => updateTask(t.taskDraftId, { estimatedMinutes: v })}
              label={`${t.title} 예상시간`}
            />
            <select
              value={t.priority}
              onChange={(e) => updateTask(t.taskDraftId, { priority: Number(e.target.value) })}
              className="rounded-control border border-border bg-surface px-2 py-1.5 text-label text-text"
            >
              {[1, 2, 3].map((p) => (
                <option key={p} value={p}>
                  {priorityLabelKO(p)}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button variant="secondary" size="md" onClick={discard}>
          버리기
        </Button>
        <Button
          variant="primary"
          size="md"
          loading={applyDraft.isPending}
          disabled={checkedCount === 0}
          disabledReason={checkedCount === 0 ? '저장할 항목을 선택해 주세요' : undefined}
          onClick={save}
        >
          선택 항목 저장 ({checkedCount})
        </Button>
      </div>
    </div>
  )
}

export default TaskStructuringDraft
