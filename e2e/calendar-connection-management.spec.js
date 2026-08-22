// e2e/calendar-connection-management.spec.js
//
// SCAFFOLD ONLY — 미실행(W6, 2026-08-23). 대응: connectionId 기준 Toggle
// (PATCH status, 비파괴적) vs [연동 해제](DELETE, 파괴적) 분리 — settingsApi.js/
// CalendarConnectionSection.jsx 헤더 참조. 실행 방법은
// apple-calendar-connect.spec.js 헤더와 동일(WSL은 chromium 미지원).
import { test, expect } from '@playwright/test'

test.describe('SCR-SET-CALENDAR — 기존 연동 관리 (Google 데모 연결)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/settings/calendar')
  })

  test('T7: Google은 시드 데이터로 이미 연결돼 있고 계정 식별자가 보인다', async ({ page }) => {
    await expect(page.getByText('user@gmail.com')).toBeVisible()
    await expect(page.getByText('2개 캘린더 선택됨')).toBeVisible()
  })

  test('T8: Toggle을 끄면 확인창 없이 즉시 "제외됨" 캡션이 뜬다(PATCH status — 비파괴적)', async ({
    page,
  }) => {
    const toggle = page.getByRole('switch', { name: 'Google 캘린더 연동' })
    await toggle.click()
    // 확인 다이얼로그가 뜨지 않는다 — 파괴적 동작(연동 해제)과 분리됐다.
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByText('이 캘린더의 일정은 주간 계획에 반영되지 않습니다')).toBeVisible()
  })

  test('T9: Toggle을 다시 켜면 캘린더 선택/연동 해제 버튼이 되돌아온다', async ({ page }) => {
    const toggle = page.getByRole('switch', { name: 'Google 캘린더 연동' })
    await toggle.click() // OFF
    await toggle.click() // ON
    await expect(page.getByRole('button', { name: '가져올 캘린더 선택' })).toBeVisible()
    await expect(page.getByRole('button', { name: '연동 해제' })).toBeVisible()
  })

  test('T10: [연동 해제]는 확인창을 거치고, 확인해야만 행이 "미연결"로 돌아간다', async ({ page }) => {
    await page.getByRole('button', { name: '연동 해제' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('이후 반영되지 않습니다')

    // 취소하면 아무 것도 바뀌지 않는다.
    await dialog.getByRole('button', { name: '취소' }).click()
    await expect(page.getByText('user@gmail.com')).toBeVisible()

    // 다시 열어 이번엔 확정한다.
    await page.getByRole('button', { name: '연동 해제' }).click()
    await page.getByRole('dialog').getByRole('button', { name: '연동 해제' }).click()

    // connectionId가 사라져 provider 행이 "미연결" + [연동하기]로 되돌아간다.
    await expect(page.getByText('미연결').first()).toBeVisible()
    const googleRow = page.getByText('Google 캘린더').locator('..').locator('..')
    await expect(googleRow.getByRole('button', { name: '연동하기' })).toBeVisible()
  })

  test('T11: 캘린더 선택 다이얼로그는 열릴 때 GET .../{connectionId}/calendars를 새로 불러온다', async ({
    page,
  }) => {
    await page.getByRole('button', { name: '가져올 캘린더 선택' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('기본 캘린더')).toBeVisible()
    await expect(dialog.getByText('업무')).toBeVisible()
    await expect(dialog.getByText('스터디 그룹')).toBeVisible()

    // 0개 선택 저장을 허용한다(§SET.5 캡션 "선택한 캘린더가 없으면 일정을
    // 가져오지 않습니다").
    await dialog.getByRole('checkbox').first().uncheck()
    await dialog.getByRole('checkbox').nth(1).uncheck()
    await dialog.getByRole('button', { name: '저장' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByText('0개 캘린더 선택됨')).toBeVisible()
  })
})
