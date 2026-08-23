/*
  OP functions for the task-category presets (W3 — 실서버 대조,
  TaskCategoryController). Supersedes projectApi.js's old `getCategories`
  ([가정—신규] placeholder that called a route the server never actually had —
  see that function's own removed comment / git history): `/task-categories`
  is a REAL, implemented CRUD resource as of this week.

  ONLY create/list/delete exist server-side (the controller's own doc:
  "목록 GET·삭제 DELETE는 후속 슬라이스에서 추가" is stale wording left over
  from an earlier slice — the CURRENT controller ships all three, but still
  no PUT/PATCH). There is deliberately NO `updateTaskCategory` export here —
  rename is not a supported operation, so no caller can even accidentally
  wire one.

  DEV fallback follows planApi.js's own richer rule (network failure OR a 404
  carrying E-COM-004, Spring's "no handler for this route" response) rather
  than projectApi.js's network-only local copy — worth keeping even though
  this endpoint is real in the CURRENT backend, because a dev's local BE
  checkout predating this week's category slice would still 404 with
  E-COM-004 exactly the way every other not-yet-implemented route does (same
  reasoning planApi.js's own header gives). Kept as its own local copy
  (not imported from planApi/projectApi) — this module has no reason to
  depend on either of those feature folders for one tiny wrapper.
*/
import { apiClient } from '../../api/client'
import { unwrapList } from '../../api/unwrap'

/*
  taskCategoryFixtures.js를 최상단 정적 import로 들이지 않는다 — authApi.js의
  loadAuthMock()과 같은 이유(그 파일 헤더 참조): 정적 import는 번들러가 실행
  경로와 무관하게 항상 포함시켜, DEV 전용 mock 데이터가 프로덕션 청크에도
  그대로 실린다. `import.meta.env.DEV` 분기 안에서만 동적 import를 호출하면
  Vite가 빌드 시 그 값을 리터럴 false로 치환해 분기 전체가 도달 불가능해지고
  번들러가 통째로 제거한다.
*/
async function loadTaskCategoryMock() {
  if (!import.meta.env.DEV) return null
  const { mockBackend } = await import('./taskCategoryFixtures')
  return mockBackend
}

async function withDevFallback(realCall, mockCall) {
  try {
    return await realCall()
  } catch (error) {
    const isUnimplementedEndpoint = error?.status === 404 && error?.code === 'E-COM-004'
    if (import.meta.env.DEV && (error?.isNetwork || isUnimplementedEndpoint)) return mockCall()
    throw error
  }
}

/**
 * OP-TASKCAT-LIST → GET /task-categories. No pagination on this endpoint at
 * all (the server always returns the full set, sorted sortOrder ASC → name
 * ASC) — unlike getProjects/getProjectTasks this deliberately does NOT go
 * through `fetchAllPages` (api/paging.js), since that helper exists only for
 * endpoints that actually page.
 */
export function getTaskCategories() {
  return withDevFallback(
    () => apiClient.get('/task-categories'),
    async () => (await loadTaskCategoryMock()).getTaskCategories(),
  ).then((r) => unwrapList(r, 'categories'))
}

/**
 * OP-TASKCAT-CREATE → POST /task-categories. `name`은 서버가 trim 후 1~50자로
 * 검증한다(위반 → 422 E-COM-009); 같은 사용자 안에서 이름이 겹치면 409
 * E-CAT-001. 둘 다 message 파싱 없이 error.code로만 분기해야 한다(R1) — 호출
 * 화면(SettingsTaskCategoriesPage) 자신이 그 두 code를 직접 구분해 보여준다.
 */
export function createTaskCategory(name) {
  return withDevFallback(
    () => apiClient.post('/task-categories', { name }),
    async () => (await loadTaskCategoryMock()).createTaskCategory(name),
  )
}

/**
 * OP-TASKCAT-DELETE → DELETE /task-categories/{id}. Hard delete — 응답 봉투가
 * 없다(204). 이 카테고리를 쓰던 태스크는 삭제되지 않고 categoryId가 서버 FK
 * (ON DELETE SET NULL)로 자동 '없음'이 된다 — 삭제 확인 UI가 이 사실을 반드시
 * 안내해야 한다(호출자 쪽 책임, DeleteTaskCategoryDialog 참고). 부재·타인 소유
 * 삭제는 404.
 */
export function deleteTaskCategory(taskCategoryId) {
  return withDevFallback(
    () => apiClient.delete(`/task-categories/${taskCategoryId}`),
    async () => (await loadTaskCategoryMock()).deleteTaskCategory(taskCategoryId),
  )
}
