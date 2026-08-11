// e2e/settings-routing-redirects.spec.js
//
// SCAFFOLD ONLY — 미실행(ST-F1-15 W6 QA). 대응 케이스: st-f1-15-test-cases.md
// T32~T35 (owner feedback #D — 지원/공지 설정 재구조화 + 구 라우트 리다이렉트).
import { test, expect } from '@playwright/test'

test.describe('구 최상위 라우트 → 설정 하위 리다이렉트', () => {
  test('T32: /faq, /help, /help/new → /settings/support', async ({ page }) => {
    for (const path of ['/faq', '/help', '/help/new']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/settings\/support$/)
    }
  })

  test('T33: /notices → /settings/notices', async ({ page }) => {
    await page.goto('/notices')
    await expect(page).toHaveURL(/\/settings\/notices$/)
  })

  test('T34: 딥링크 상세 라우트는 리다이렉트되지 않음', async ({ page }) => {
    await page.goto('/help/ticket-1')
    await expect(page).toHaveURL(/\/help\/ticket-1$/)
    await page.goto('/notices/notice-1')
    await expect(page).toHaveURL(/\/notices\/notice-1$/)
  })

  test('T35: 설정 허브의 지원/공지 행이 실제 라우트로 이동(stub 토스트 아님)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/settings')
    await page.getByRole('link', { name: /지원.*문의·피드백 보내기/ }).click()
    await expect(page).toHaveURL(/\/settings\/support$/)
    await page.goto('/settings')
    await page.getByRole('link', { name: /공지.*업데이트·공지사항/ }).click()
    await expect(page).toHaveURL(/\/settings\/notices$/)
  })
})
