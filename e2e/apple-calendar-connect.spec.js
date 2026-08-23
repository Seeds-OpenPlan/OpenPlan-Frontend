// e2e/apple-calendar-connect.spec.js
//
// SCAFFOLD ONLY — 미실행(W6, 2026-08-23). 대응: settingsApi.js/AppleConnectDialog.jsx
// 헤더가 명시하는 422(폼 재표시) / 502(재시도 버튼) / 409(이미 연결됨) 3분기,
// connectionId 전환. 이 사이클 실행 환경(WSL)에서는 playwright chromium이
// libnspr4 등 시스템 라이브러리 부재로 못 뜬다(playwright.config.js 헤더) —
// 오너가 Windows에서 브라우저를 띄우고 WSL dev 서버(host 5173)를 그대로 쓰는
// 방식으로 실행해야 한다.
import { test, expect } from '@playwright/test'

test.describe('SCR-SET-CALENDAR — Apple 캘린더 신규 연동', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/settings/calendar')
  })

  test('T1: 미연결 상태의 Apple 행은 [연동하기] 버튼만 갖는다', async ({ page }) => {
    const appleRow = page.getByText('Apple 캘린더').locator('..').locator('..')
    await expect(appleRow.getByText('미연결')).toBeVisible()
    await expect(appleRow.getByRole('button', { name: '연동하기' })).toBeVisible()
  })

  test('T2: 폼 안에 앱 암호 발급 경로 안내가 항상 보인다', async ({ page }) => {
    await page.getByRole('button', { name: '연동하기' }).click()
    await expect(page.getByText('appleid.apple.com')).toBeVisible()
    await expect(page.getByText('앱 암호 → 새로 만들기')).toBeVisible()
  })

  test('T3: 422 — 형식이 잘못된 입력은 폼을 그대로 다시 보여주고 재시도 버튼을 주지 않는다', async ({
    page,
  }) => {
    await page.getByRole('button', { name: '연동하기' }).click()
    await page.getByLabel('Apple ID').fill('not-an-email')
    await page.getByLabel('앱 암호').fill('그냥비밀번호')
    await page.getByRole('button', { name: '연동하기' }).nth(1).click()

    await expect(page.getByRole('alert')).toContainText('Apple ID 또는 앱 암호를 확인해 주세요')
    // 422는 "다시 시도" 버튼이 아니라 통상적인 제출 버튼 그대로 — 사용자가
    // 직접 고쳐서 다시 눌러야 한다.
    await expect(page.getByRole('button', { name: '다시 시도' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '연동하기' }).nth(1)).toBeVisible()

    // 제출 즉시 비워졌어야 하는 앱 암호 필드 — 오타를 고치려면 다시 입력해야 한다.
    await expect(page.getByLabel('앱 암호')).toHaveValue('')
  })

  test('T4: 422 → 값을 고쳐 재제출하면 성공한다', async ({ page }) => {
    await page.getByRole('button', { name: '연동하기' }).click()
    await page.getByLabel('Apple ID').fill('bad')
    await page.getByLabel('앱 암호').fill('bad')
    await page.getByRole('button', { name: '연동하기' }).nth(1).click()
    await expect(page.getByRole('alert')).toBeVisible()

    await page.getByLabel('Apple ID').fill('valid-demo@icloud.com')
    await page.getByLabel('앱 암호').fill('abcd-efgh-ijkl-mnop')
    await page.getByRole('button', { name: '연동하기' }).nth(1).click()

    // 성공 시 다이얼로그가 닫히고 목록에 새 행이 반영된다.
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByText('valid-demo@icloud.com')).toBeVisible()
  })

  test('T5: 502 — 첫 제출은 실패하고 "다시 시도" 버튼이 같은 값으로 재제출해 성공한다', async ({
    page,
  }) => {
    // FLAKY_APPLE_ID(settingsFixtures.js) — 이 값의 첫 제출만 502로 실패하도록
    // mock에 예약된 DEV QA 트리거.
    await page.getByRole('button', { name: '연동하기' }).click()
    await page.getByLabel('Apple ID').fill('flaky-gateway@icloud.com')
    await page.getByLabel('앱 암호').fill('abcd-efgh-ijkl-mnop')
    await page.getByRole('button', { name: '연동하기' }).nth(1).click()

    await expect(page.getByRole('alert')).toContainText('일시적인 오류')
    const retryButton = page.getByRole('button', { name: '다시 시도' })
    await expect(retryButton).toBeVisible()

    // 앱 암호 입력은 이미 비어 있어야 한다 — 재시도는 화면에 값을 되살리지
    // 않고 mutation.variables만으로 재요청한다(AppleConnectDialog 헤더).
    await expect(page.getByLabel('앱 암호')).toHaveValue('')

    await retryButton.click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  // 409(E-EXT-004)는 mockBackend.createConnection이 "같은 provider가 이미
  // CONNECTED"일 때 던진다(settingsFixtures.js) — 그런데 CalendarConnectionSection
  // 은 이미 연결된 provider의 [연동하기] 버튼 자체를 렌더하지 않는다(설계
  // 의도: provider당 활성 연결 최대 1개). 그래서 단일 탭 UI 조작만으로는 이
  // 경로를 재현할 수 없다 — 실제로 벌어질 수 있는 경우는 두 탭에서 동시에
  // 같은 provider를 연결하는 레이스뿐이다. 이 스펙은 그 한계를 문서화만
  // 해 둔다(멀티 컨텍스트 레이스 재현은 이번 사이클 범위 밖).
  test.skip('T6: 409(이미 연결됨)는 provider당 [연동하기] 버튼이 하나뿐이라 단일 탭 UI로 재현 불가 — 멀티탭 레이스 전용, 범위 밖', () => {})
})
