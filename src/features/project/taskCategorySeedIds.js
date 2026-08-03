/*
  Shared DEV seed ids for the three placeholder category names both mock
  stores below need to agree on: taskCategoryFixtures.js (the preset CRUD
  store itself) and projectFixtures.js (whose seed TASKS reference one of
  these ids in their own `categoryId` field, so a freshly-loaded DEV screen
  shows a task already carrying a real, resolvable category instead of every
  seed task starting out as "없음").

  Deliberately a THIRD, dependency-free file rather than having either mock
  import the other directly: projectFixtures.js needs these ids at its own
  module-eval time (inside `seed()`), and taskCategoryFixtures.js needs them
  at ITS module-eval time too (to build its own preset Map) — two modules
  each importing a plain constant from a common leaf avoids the circular
  import a direct A-imports-B-imports-A would create if either file tried to
  read the other's live store instead.
*/
export const SEED_CATEGORY_IDS = {
  취업준비: 'cat-1',
  코딩테스트: 'cat-2',
  자기계발: 'cat-3',
}
