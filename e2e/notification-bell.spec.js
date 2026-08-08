// e2e/notification-bell.spec.js
//
// SCAFFOLD ONLY — 미실행(ST-F1-15 W6 QA, 오너 브라우저 승인 전). 대응 케이스:
// st-f1-15-test-cases.md T1~T10 (PNL-NOTI). dev-auth 고정 사용자 기준
// notificationsFixtures.js 시드(noti-1~3 미확인, noti-4~5 읽음 → 초기 배지 3).
import { test, expect } from '@playwright/test'

test.describe('PNL-NOTI — 알림 센터', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('T1: 초기 미확인 배지 = 3', async ({ page }) => {
    const bell = page.getByRole('button', { name: /알림 \(미확인 3건\)/ })
    await expect(bell).toBeVisible()
  })

  test('T3: 데스크톱 — 벨 클릭 시 비모달 드롭다운, 바깥 클릭으로 닫힘', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.getByRole('button', { name: /알림/ }).click()
    const panel = page.getByRole('region', { name: '알림' })
    await expect(panel).toBeVisible()
    await page.mouse.click(10, 10)
    await expect(panel).toBeHidden()
  })

  test('T3(Esc): 데스크톱 — Esc로 드롭다운 닫힘', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.getByRole('button', { name: /알림/ }).click()
    await expect(page.getByRole('region', { name: '알림' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('region', { name: '알림' })).toBeHidden()
  })

  test('T4: 모바일 — 벨 클릭 시 BottomSheet(모달)로 열림', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.getByRole('button', { name: /알림/ }).click()
    // BottomSheet는 role="dialog" 계약을 따른다고 가정 (공용 컴포넌트 계약,
    // 실행 시 실제 role/접근성 트리로 재확인 필요).
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('T5/T6: 미확인 항목 클릭 → 읽음 처리 + 배지 즉시 -1, 재클릭은 idempotent', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.getByRole('button', { name: /알림 \(미확인 3건\)/ }).click()
    const panel = page.getByRole('region', { name: '알림' })
    const firstUnread = panel.getByRole('button').filter({ hasText: '이번 주 계획이 과부하 상태입니다' })
    await firstUnread.click()
    // routePath: /weekly 로 이동했을 것 — 별도 탭/네비게이션이라 뒤로 와서 배지 확인
    await page.goBack()
    await expect(page.getByRole('button', { name: /알림 \(미확인 2건\)/ })).toBeVisible()
  })

  test('T7: NOTI-04 — 알림 항목 routePath 클릭 시 해당 화면으로 이동', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.getByRole('button', { name: /알림/ }).click()
    await page.getByRole('button', { name: /문의하신 내용에 답변이 등록되었습니다/ }).click()
    await expect(page).toHaveURL(/\/help\/ticket-1$/)
  })

  test('T8: 패널 톱니 클릭 → 패널 닫히고 알림 설정으로 이동', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.getByRole('button', { name: /알림/ }).click()
    await page.getByRole('button', { name: '알림 설정으로 이동' }).click()
    await expect(page).toHaveURL(/\/settings\/notifications$/)
    await expect(page.getByRole('region', { name: '알림' })).toBeHidden()
  })

  test('T9: 알림 목록 에러 시 재시도 버튼 노출 (네트워크 실패 모킹 필요)', async () => {
    // TODO(실행 시): page.route로 GET /notifications 500 강제 후 ErrorState 확인.
    test.fixme(true, '네트워크 모킹 하네스 미구현 — 실행 승인 후 route intercept 추가')
  })

  test('T10: /weekly에서 벨 오픈 시 캘린더 sticky 헤더 위로 패널이 그려짐(z-index 회귀)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/weekly')
    await page.getByRole('button', { name: /알림/ }).click()
    const panel = page.getByRole('region', { name: '알림' })
    await expect(panel).toBeVisible()
    // 스크린샷 비교로 겹침 여부를 육안 확인 — 실행 시 baseline 스냅샷 필요.
    await expect(panel).toHaveScreenshot('weekly-notification-panel-z-index.png')
  })
})
