// e2e/faq.spec.js
//
// SCAFFOLD ONLY — 미실행(ST-F1-15 W6 QA). 대응 케이스: st-f1-15-test-cases.md
// T24~T27 (HELP-06, AC-3, TUT-09 SC-12 연계).
import { test, expect } from '@playwright/test'

test.describe('SCR-FAQ — 자주 묻는 질문', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings/support')
    // 기본 탭 = FAQ (owner feedback #7) — 별도 탭 클릭 불필요.
  })

  test('T24: 검색어 입력 → 부분일치 결과(대소문자 무관)', async ({ page }) => {
    await page.getByPlaceholder('궁금한 내용을 검색해 보세요').fill('가용')
    await expect(page.getByText('가용 시간과 24시간 모드의 차이는 무엇인가요?')).toBeVisible({ timeout: 1000 })
  })

  test('T25: 검색 0건 → EmptyState + 문의 작성 액션 → 모달 오픈', async ({ page }) => {
    await page.getByPlaceholder('궁금한 내용을 검색해 보세요').fill('존재하지않는키워드zzz')
    await expect(page.getByText('검색 결과가 없습니다')).toBeVisible()
    await page.getByRole('button', { name: '문의 작성' }).click()
    await expect(page.getByRole('heading', { name: '문의 작성' })).toBeVisible()
  })

  test('T26: 검색어 없을 때 카테고리별 섹션 렌더', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '주간 계획' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '태스크·프로젝트' })).toBeVisible()
  })

  test('T27: 튜토리얼 재실행 배너 → 확인 다이얼로그 → 확인 시 대시보드로 이동', async ({ page }) => {
    await page.getByRole('button', { name: '튜토리얼 다시 실행' }).click()
    await expect(page.getByRole('heading', { name: '튜토리얼을 다시 시작할까요?' })).toBeVisible()
    await page.getByRole('button', { name: '다시 시작' }).click()
    await expect(page).toHaveURL('/')
  })
})
