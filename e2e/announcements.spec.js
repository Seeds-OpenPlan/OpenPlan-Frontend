// e2e/announcements.spec.js
//
// SCAFFOLD ONLY — 미실행(ST-F1-15 W6 QA). 대응 케이스: st-f1-15-test-cases.md
// T28~T31 (SCR-OPS, OPS-01/02).
import { test, expect } from '@playwright/test'

test.describe('SCR-OPS — 공지', () => {
  test('T28: 최신순 정렬 목록', async ({ page }) => {
    await page.goto('/settings/notices')
    const rows = page.getByRole('button', { name: /펼치기$/ })
    await expect(rows.first()).toContainText('7월 정기 점검 안내')
  })

  test('T29: 행 클릭 시 인라인 확장(showHeader=false, 페이지 이동 없음)', async ({ page }) => {
    await page.goto('/settings/notices')
    await page.getByRole('button', { name: /7월 정기 점검 안내/ }).click()
    await expect(page.getByText('서비스 점검이 진행됩니다')).toBeVisible()
    await expect(page).toHaveURL(/\/settings\/notices$/)
  })

  test('T30: 딥링크 직접 진입 — 소유권 검증 없이 바로 렌더', async ({ page }) => {
    await page.goto('/notices/notice-1')
    await expect(page.getByRole('heading', { name: '7월 정기 점검 안내' })).toBeVisible()
  })

  test('T31: 존재하지 않는 noticeId → ErrorState', async ({ page }) => {
    await page.goto('/notices/nope')
    await expect(page.getByText('공지를 불러오지 못했습니다')).toBeVisible()
  })
})
