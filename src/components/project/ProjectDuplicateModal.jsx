import { useEffect, useRef, useState } from 'react'
import { Dialog } from '../common/Dialog'
import { BottomSheet } from '../common/BottomSheet'
import { Button } from '../common/Button'
import { ErrorState } from '../common/ErrorState'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import { useProjectTasks, useProjectWbs } from '../../features/project/useProjectData'

/*
  OVL-PROJ-DUP · 프로젝트 복제 3단계 (ui-spec §PROJ.6, PROJ-10/11/12). A numbered
  stepper ("1 대상 확인 → 2 항목 확인 → 3 복제") is a deliberate exception to
  the no-numeric-markers convention elsewhere — the spec calls this out
  explicitly because these steps have a real, fixed sequence.

  Step 2's "복제되는/되지 않는 항목" list is mostly STATIC feature description
  (이름·설명 / WBS 구조 are always included, 배치 이력 / 수행 기록 never are) —
  only the task count varies per project. This is not a server preview
  because none exists (see projectApi.duplicateProject's divergence note);
  rendering a fixed, honest description of what the client-orchestrated copy
  actually does is the closest available substitute.

  TITLE (owner review 2026-07-23, B-1): an earlier version rendered BOTH a
  small "1 대상 확인" caption line ABOVE the heading AND "복제 — 대상 확인" AS
  the heading — "대상 확인" appeared twice. Fixed to a single line: "복제" is
  the only headline text; the step number+name is a smaller, muted trailing
  fragment of the SAME <h2>, not a separate line.

  On step change, focus moves to the (re-labelled) step heading so a screen
  reader announces the transition (§PROJ.6 접근성).
*/

const STEP_TITLES = ['대상 확인', '항목 확인', '복제']
const TITLE_ID = 'project-dup-title'

export function ProjectDuplicateModal({ project, onClose, onDuplicate, submitting = false, submitError }) {
  const isDesktop = useIsDesktop()
  const headingRef = useRef(null)
  const nameRef = useRef(null)

  const [step, setStep] = useState(1)
  const [newName, setNewName] = useState(`${project.name} 복사본`)

  // Loaded once (Step 2 needs the task count context; Step 3's actual copy
  // needs the full task/WBS data) — cheap to fetch eagerly since the WS page
  // caches under the same query keys anyway.
  const tasksQuery = useProjectTasks(project.projectId)
  const wbsQuery = useProjectWbs(project.projectId)

  useEffect(() => {
    headingRef.current?.focus()
  }, [step])

  const trimmedName = newName.trim()

  const goNext = () => setStep((s) => Math.min(3, s + 1))
  const goPrev = () => setStep((s) => Math.max(1, s - 1))

  const confirmDuplicate = () => {
    onDuplicate({
      project,
      sourceTasks: tasksQuery.data ?? [],
      sourceWbsNodes: wbsQuery.data ?? [],
      newName: trimmedName,
    })
  }

  const body = (
    <div className="flex flex-col gap-4">
      <h2
        id={TITLE_ID}
        ref={headingRef}
        tabIndex={-1}
        className="flex items-baseline gap-2 text-title font-semibold text-text outline-none"
      >
        <span>복제</span>
        <span className="text-label font-normal text-text-muted">
          {step}단계 · {STEP_TITLES[step - 1]}
        </span>
      </h2>

      {step === 1 && (
        <>
          <div className="rounded-card border border-border bg-surface-sunken px-3 py-2">
            <p className="text-label font-medium text-text">{project.name}</p>
            <p className="text-caption text-text-muted">
              태스크 {project.taskCount} · 마감 {project.dueDate ?? '없음'}
            </p>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-caption font-medium text-text-muted">새 이름 *</span>
            <input
              ref={nameRef}
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full rounded-control border border-border bg-surface px-3 py-2 text-label text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
            />
          </label>
        </>
      )}

      {step === 2 && (
        <div className="grid grid-cols-2 gap-4 text-label">
          <div>
            <p className="mb-2 font-medium text-text">복제되는 항목</p>
            <ul className="flex flex-col gap-1.5 text-text-muted">
              <li>✓ 이름·설명</li>
              <li>✓ 태스크 {project.taskCount}개</li>
              <li>✓ WBS 구조</li>
            </ul>
          </div>
          <div>
            <p className="mb-2 font-medium text-text">복제되지 않는 항목</p>
            <ul className="flex flex-col gap-1.5 text-text-muted">
              <li>✕ 주간 계획 배치 이력</li>
              <li>✕ 수행 기록</li>
            </ul>
          </div>
        </div>
      )}

      {step === 3 && (
        <>
          <p className="text-body text-text">'{trimmedName}' 프로젝트로 복제합니다.</p>
          {submitError && <ErrorState variant="inline" onAction={confirmDuplicate} />}
        </>
      )}

      <div className="mt-1 flex justify-end gap-2">
        {step === 1 && (
          <Button type="button" variant="secondary" size="md" onClick={onClose}>
            취소
          </Button>
        )}
        {step > 1 && (
          <Button type="button" variant="secondary" size="md" onClick={goPrev} disabled={submitting}>
            이전
          </Button>
        )}
        {step < 3 && (
          <Button type="button" variant="primary" size="md" onClick={goNext} disabled={!trimmedName}>
            다음
          </Button>
        )}
        {step === 3 && (
          <Button type="button" variant="primary" size="md" loading={submitting} onClick={confirmDuplicate}>
            복제
          </Button>
        )}
      </div>
    </div>
  )

  // Esc/backdrop close is allowed at every step (§PROJ.6 — the only input is
  // the new name, nothing destructive to lose).
  if (isDesktop) {
    return (
      <Dialog open onClose={onClose} labelledById={TITLE_ID} initialFocusRef={nameRef} size="lg">
        {body}
      </Dialog>
    )
  }
  return (
    <BottomSheet open onClose={onClose} labelledById={TITLE_ID} initialFocusRef={nameRef}>
      {body}
    </BottomSheet>
  )
}

export default ProjectDuplicateModal
