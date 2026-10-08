// e2e/notification-master-toggle.spec.js
//
// SCAFFOLD ONLY — 미실행(설정 e2e 하네스 전반이 아직 이 레포에서 playwright
// 실행 환경을 갖추지 못함, Andrew 세션 2026-10-08 보고 참고). ST-F1-15
// T36~T38(오너 피드백 #5/2차#A "순수 게이트")을 겨냥해 작성됐던 원본은
// 2026-10-08 계약 대조로 전제 자체가 무효화됐다 — 아래가 그 재작성이다.
//
// 설계 변경 이유: 실제 계약(NotificationSetting 스키마, openapi.yaml:2614)엔
// "전체 알림" 필드가 없다. 원본은 마스터를 서버 독립 필드로 저장해 개별 5종
// 저장값은 건드리지 않는 "순수 게이트"(끄면 화면만 잠그고 값은 보존)였는데,
// 그 전제(서버에 masterEnabled가 있다)가 거짓이었다. 서버가 모르는 값을
// 저장할 수 없으므로 마스터는 이제 "5종 일괄 PUT" 편의 기능이다 — 체크
// 상태는 5종이 전부 켜져 있는지에서 DERIVE하고, 토글하면 5종을 실제로
// 전부 켜거나 끈다(SettingsNotificationsPage.jsx 헤더 참고). 그 결과 원본
// T36("값은 보존된 채 화면만 잠김")·T38("미리 꺼둔 항목은 마스터를 다시
// 켜도 계속 꺼짐")은 새 설계에서 거짓이 된다 — 마스터 ON은 정말로 5종을
// 전부 true로 쓰기 때문이다. 이 손실은 버그가 아니라 "서버에 없는 필드로
// 개별값을 따로 기억할 수 없다"는 계약상 제약의 직접 결과다.
import { test, expect } from '@playwright/test'

test.describe('SCR-SET-NOTI — 전체 알림 마스터 토글 (계약 대조 이후)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings/notifications')
  })

  test('T36: 마스터 OFF → 개별 5종이 실제로 전부 꺼진다(값 보존 아님 — 일괄 PUT)', async ({ page }) => {
    const deadlineSoon = page.getByRole('switch', { name: /마감 임박/ })
    await page.getByRole('switch', { name: '전체 알림' }).click()
    // 더 이상 disabled로 잠그지 않는다 — 실제로 꺼진 값이라 잠글 "숨은
    // 저장값" 자체가 없다.
    await expect(deadlineSoon).toBeEnabled()
    await expect(deadlineSoon).not.toBeChecked()
  })

  test('T37: 마스터 OFF → ON 시 개별 5종이 전부 다시 켜진다(이전 개별 OFF도 덮어씀)', async ({ page }) => {
    const master = page.getByRole('switch', { name: '전체 알림' })
    const deadlineSoon = page.getByRole('switch', { name: /마감 임박/ })

    await master.click() // OFF — 5종 전부 false로 PUT
    await expect(deadlineSoon).not.toBeChecked()
    await master.click() // ON — 5종 전부 true로 PUT
    await expect(deadlineSoon).toBeChecked()
  })

  test('T38: 마스터는 5종이 전부 켜져 있을 때만 켜짐으로 보인다(파생값, 독립 필드 아님)', async ({ page }) => {
    const master = page.getByRole('switch', { name: '전체 알림' })
    const deadlineSoon = page.getByRole('switch', { name: /마감 임박/ })

    // 개별 항목 하나를 끄면 — 나머지 4종은 그대로 켜져 있어도 — 마스터는
    // "전체 켜짐"이 거짓이 되는 즉시 꺼짐으로 보여야 한다.
    if (await deadlineSoon.isChecked()) await deadlineSoon.click()
    await expect(deadlineSoon).not.toBeChecked()
    await expect(master).not.toBeChecked()
  })
})
