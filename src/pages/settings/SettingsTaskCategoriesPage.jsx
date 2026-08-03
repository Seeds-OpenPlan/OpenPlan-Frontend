import { useState } from 'react'
import { TaskCategoryForm } from '../../components/settings/TaskCategoryForm'
import { DeleteTaskCategoryDialog } from '../../components/settings/DeleteTaskCategoryDialog'
import { PlusIcon } from '../../components/settings/settingsIcons'
import { Button } from '../../components/common/Button'
import { EmptyState } from '../../components/common/EmptyState'
import { ErrorState } from '../../components/common/ErrorState'
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton'
import {
  useTaskCategories,
  useCreateTaskCategory,
  useDeleteTaskCategory,
} from '../../features/project/useProjectData'

/*
  SettingsTaskCategoriesPage — 태스크 카테고리 관리 (W3, SC-01). List + create +
  delete(확인 후) — the only three operations the real /task-categories
  resource supports (no rename endpoint exists — see taskCategoryApi.js's own
  header). Same "exactly one overlay, page-local state" shape every other
  settings/project screen in this codebase already follows
  (SettingsFixedSchedulesPage/ProjectExpandedPanel).

  PLACEMENT (오너 요청 판단): added to the 설정 허브(SettingsNavList)'s "계획
  기준" section, right after 고정일정 관리 — 카테고리는 고정일정과 마찬가지로
  "태스크/계획을 조직하는 사용자 프리셋"이라 그 구역이 자연스럽다고 판단했다.
  기존 6행의 오너 지정 순서(SettingsNavList 자신의 헤더 주석)를 재배열하지는
  않는다 — 그 순서는 그대로 두고 이 신규 행을 구역 끝에 덧붙인다(기본값 행이
  ST-F1-12 AC-3 대응으로 참조 PNG에 없던 행을 똑같이 "구역에 덧붙이는" 방식으로
  추가됐던 선례와 같음).
*/
function SettingsTaskCategoriesPage() {
  const query = useTaskCategories()
  const createCategory = useCreateTaskCategory()
  const deleteCategory = useDeleteTaskCategory()

  const [formOpen, setFormOpen] = useState(false)
  // The actual AppError (not just a boolean) — TaskCategoryForm branches its
  // inline copy on `.code` (E-CAT-001/E-COM-009), so a plain "did it fail?"
  // flag (the shape every other submitError in this codebase uses, e.g.
  // ProjectExpandedPanel.taskFormError) isn't enough here. Held in THIS page
  // rather than read off `createCategory.error` directly so it can be
  // explicitly cleared the moment the form opens/closes — a mutation hook's
  // own `.error` otherwise keeps showing a PRIOR attempt's failure the next
  // time the form is reopened, until another mutate() call overwrites it.
  const [createError, setCreateError] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null) // category | null
  const [deleteError, setDeleteError] = useState(false)

  if (query.isLoading) return <LoadingSkeleton preset="listRow" count={3} />
  if (query.isError) return <ErrorState variant="section" onAction={() => query.refetch()} />

  const categories = query.data ?? []

  const openCreateForm = () => {
    setCreateError(null)
    setFormOpen(true)
  }
  const closeCreateForm = () => {
    setFormOpen(false)
    setCreateError(null)
  }
  const submitCreate = (name) => {
    setCreateError(null)
    createCategory.mutate(name, {
      onSuccess: closeCreateForm,
      onError: setCreateError,
    })
  }

  const handleDelete = () => {
    setDeleteError(false)
    deleteCategory.mutate(deleteTarget.taskCategoryId, {
      onSuccess: () => setDeleteTarget(null),
      onError: () => setDeleteError(true),
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 id="settings-detail-title" className="text-title font-semibold text-text">
        태스크 카테고리
      </h2>

      <Button variant="secondary" size="md" onClick={openCreateForm}>
        <span className="inline-flex items-center gap-2">
          <PlusIcon aria-hidden="true" /> 카테고리 추가
        </span>
      </Button>

      {categories.length === 0 ? (
        <EmptyState
          title="등록된 카테고리가 없습니다"
          description="태스크를 분류할 카테고리를 추가하면 태스크 추가/편집 화면에서 바로 고를 수 있습니다"
          actionLabel="카테고리 추가"
          onAction={openCreateForm}
        />
      ) : (
        <ul className="overflow-hidden rounded-card border border-border">
          {categories.map((c) => (
            <li
              key={c.taskCategoryId}
              className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0"
            >
              <span className="truncate text-label font-medium text-text">{c.name}</span>
              <button
                type="button"
                onClick={() => setDeleteTarget(c)}
                className="min-h-11 shrink-0 rounded-control px-2 text-label font-medium text-danger-600 transition-colors hover:bg-danger-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}

      {formOpen && (
        <TaskCategoryForm
          onClose={closeCreateForm}
          onSubmit={submitCreate}
          submitting={createCategory.isPending}
          submitError={createError}
        />
      )}

      <DeleteTaskCategoryDialog
        category={deleteTarget}
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        submitting={deleteCategory.isPending}
        submitError={deleteError}
      />
    </div>
  )
}

export default SettingsTaskCategoriesPage
