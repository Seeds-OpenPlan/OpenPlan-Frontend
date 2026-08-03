/*
  DEV-ONLY in-memory mock for the task-category presets (W3 — real server
  contract confirmed against TaskCategoryController, see taskCategoryApi.js's
  own header). This REPLACES projectFixtures.js's old `CATEGORY_LIST` (a
  static string array — the only thing GET /categories, itself a placeholder
  that 404'd, ever had to return before this week). That string list is gone;
  every category is now a real `{taskCategoryId, name, sortOrder, createdAt}`
  record, same shape the real endpoint returns, so this mock and the real
  server can never quietly disagree on what a "category" object looks like.

  Seed ids come from taskCategorySeedIds.js (not minted locally) so
  projectFixtures.js's own seed TASKS can reference the SAME ids in their
  `categoryId` field — see that shared file's own header for why a third,
  dependency-free file avoids a circular import between the two stores.
*/
import { SEED_CATEGORY_IDS } from './taskCategorySeedIds'

const MOCK_LATENCY_MS = 60
const delay = (ms = MOCK_LATENCY_MS) => new Promise((resolve) => setTimeout(resolve, ms))

let uid = 100
const nextId = () => `cat-${(uid += 1)}`

// name -> taskCategoryId -> record. Every seed row starts at sortOrder 0 —
// mirrors the real server's own "생성 시 sort_order=0" note (no reorder
// endpoint exists for either side to diverge on yet). createdAt is staggered
// so a "가장 최근 추가" sort (if a future screen ever wants one) has real
// distinct timestamps to sort by, not three identical instants.
const categories = new Map(
  Object.entries(SEED_CATEGORY_IDS).map(([name, taskCategoryId], i) => [
    taskCategoryId,
    {
      taskCategoryId,
      name,
      sortOrder: 0,
      createdAt: new Date(Date.now() - (Object.keys(SEED_CATEGORY_IDS).length - i) * 86400000).toISOString(),
    },
  ]),
)

function findByName(name) {
  return Array.from(categories.values()).find((c) => c.name === name)
}

export const mockBackend = {
  // GET /task-categories — 서버 정렬 규약(sortOrder ASC → name ASC, 페이지네이션
  // 없음)을 목업도 그대로 흉내 — 실서버 전환 후 목록 순서가 달라 보이지 않게.
  async getTaskCategories() {
    await delay()
    return {
      categories: Array.from(categories.values()).sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ko'),
      ),
    }
  },

  // POST /task-categories (SC-01). name 1~50자(trim 후) 위반 → 422 E-COM-009,
  // 사용자 내 이름 중복 → 409 E-CAT-001 — 둘 다 실서버와 같은 code/status로
  // 던진다(이 mock의 실패도 axios 인터셉터를 거치지 않고 withDevFallback을
  // 통해 그대로 호출자에게 전달되므로 — projectFixtures.mockBackend.updateTask
  // 의 E-COM-006 시뮬레이션과 같은 관례).
  async createTaskCategory(name) {
    await delay()
    const trimmed = (name ?? '').trim()
    if (trimmed.length < 1 || trimmed.length > 50) {
      const err = new Error('mock: category name must be 1-50 chars after trim')
      err.status = 422
      err.code = 'E-COM-009'
      throw err
    }
    if (findByName(trimmed)) {
      const err = new Error('mock: duplicate category name')
      err.status = 409
      err.code = 'E-CAT-001'
      throw err
    }
    const taskCategoryId = nextId()
    const category = { taskCategoryId, name: trimmed, sortOrder: 0, createdAt: new Date().toISOString() }
    categories.set(taskCategoryId, category)
    return category
  },

  // DELETE /task-categories/{id} (SC-01). Hard delete, 부재 → 404.
  //
  // [한계 — 문서화된 갭] 실서버는 FK(ON DELETE SET NULL)로 이 카테고리를 쓰던
  // 모든 태스크의 categoryId를 즉시 '없음'으로 되돌린다. 이 mock은 그 cascade를
  // projectFixtures.js의 별도 태스크 스토어에 직접 반영하지 않는다(두 스토어를
  // 서로 못 보게 유지하는 이유는 taskCategorySeedIds.js 자신의 헤더 참고 — 여기
  // 파일이 그 스토어를 되돌아 import하면 정확히 그 순환을 만든다). 실질적 영향은
  // 작다: 삭제된 categoryId를 여전히 들고 있는 태스크가 있어도, 그 값은 다음
  // getTaskCategories 응답 목록엔 더 이상 나타나지 않으므로 표시명 조합
  // (categoryId → name)이 자연히 "찾을 수 없음" → 없음과 동일하게 렌더된다
  // (useProjectData의 taskCategoryName 헬퍼 참고) — 유일한 차이는 그 태스크를
  // 다시 열어 편집 폼을 띄웠을 때 select가 실서버처럼 깨끗한 null이 아니라
  // 이미 사라진 옛 id를 값으로 들고 있어 빈 선택으로 보인다는 점뿐, 저장을
  // 다시 누르면 어차피 유효한 값(없음 포함)으로 덮어써진다.
  async deleteTaskCategory(taskCategoryId) {
    await delay()
    if (!categories.has(taskCategoryId)) {
      const err = new Error('mock: category not found')
      err.status = 404
      throw err
    }
    categories.delete(taskCategoryId)
    return null
  },
}

export default mockBackend
