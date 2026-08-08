// e2e/notification-master-toggle.spec.js
//
// SCAFFOLD ONLY — 미실행(ST-F1-15 W6 QA). 대응 케이스: st-f1-15-test-cases.md
// T36~T38 (owner feedback #5/2차#A — 전체 알림 마스터 토글은 순수 게이트).
import { test, expect } from '@playwright/test'

test.describe('SCR-SET-NOTI — 전체 알림 마스터 토글', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings/notifications')
  })

  test('T36: 마스터 OFF → 개별 5종 disabled, 값 자체는 유지', async ({ page }) => {
    const dueSoon = page.getByRole('switch', { name: /마감 임박 태스크/ })
    const wasChecked = await dueSoon.isChecked()
    await page.getByRole('switch', { name: '전체 알림' }).click()
    await expect(dueSoon).toBeDisabled()
    // disabled 상태에서도 체크 상태(aria-checked)는 그대로여야 값이 보존된 것.
    expect(await dueSoon.isChecked()).toBe(wasChecked)
  })

  test('T37: 마스터 OFF → ON 시 개별 값이 그대로 복원된 것처럼 보임', async ({ page }) => {
    const master = page.getByRole('switch', { name: '전체 알림' })
    const dueSoon = page.getByRole('switch', { name: /마감 임박 태스크/ })
    const before = await dueSoon.isChecked()
    await master.click() // OFF
    await master.click() // ON
    await expect(dueSoon).toBeEnabled()
    expect(await dueSoon.isChecked()).toBe(before)
  })

  test('T38: 개별 항목을 미리 꺼둔 채 마스터 OFF→ON 반복해도 그 항목은 계속 꺼짐', async ({ page }) => {
    const master = page.getByRole('switch', { name: '전체 알림' })
    const dueSoon = page.getByRole('switch', { name: /마감 임박 태스크/ })
    if (await dueSoon.isChecked()) await dueSoon.click()
    await expect(dueSoon).not.toBeChecked()

    await master.click() // OFF
    await master.click() // ON
    await expect(dueSoon).not.toBeChecked()
  })
})
