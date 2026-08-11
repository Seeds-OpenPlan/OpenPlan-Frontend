// e2e/help-ticket.spec.js
//
// SCAFFOLD ONLY — 미실행(ST-F1-15 W6 QA). 대응 케이스: st-f1-15-test-cases.md
// T11~T20 (SCR-HELP 목록/상세/작성, HELP-01~05). dev-auth 고정 사용자
// dev-user-0001 기준 helpFixtures.js 시드(ticket-1~3 본인 소유).
import { test, expect } from '@playwright/test'

test.describe('SCR-HELP — 내 문의', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings/support')
    await page.getByRole('tab', { name: '내 문의' }).click()
  })

  test('T11: 본인 소유 문의 3건만 노출 (타인 소유 ticket-99 제외)', async ({ page }) => {
    await expect(page.getByText('주차 이동 시 가용 시간이 초기화돼요')).toBeVisible()
    await expect(page.getByText('자동 배치 결과를 되돌릴 수 있나요')).toBeVisible()
    await expect(page.getByText('캘린더 연동 시 중복 일정이 생겨요')).toBeVisible()
    await expect(page.getByText('다른 사용자의 문의 (접근 불가 데모)')).toHaveCount(0)
  })

  test('T12: 답변 배지 2-way (답변 완료 / 대기 중)', async ({ page }) => {
    const answeredRow = page.getByRole('button', { name: /주차 이동 시 가용 시간이 초기화돼요.*답변 완료/ })
    await expect(answeredRow).toBeVisible()
    const pendingRow = page.getByRole('button', { name: /자동 배치 결과를 되돌릴 수 있나요.*대기 중/ })
    await expect(pendingRow).toBeVisible()
  })

  test('T13/T14: 행 클릭 시 인라인 확장, 다른 행 클릭 시 이전 행 자동 접힘', async ({ page }) => {
    const row1 = page.getByRole('button', { name: /주차 이동 시 가용 시간이 초기화돼요/ })
    const row2 = page.getByRole('button', { name: /자동 배치 결과를 되돌릴 수 있나요/ })
    await row1.click()
    await expect(page.getByText('확인 결과 캐시 갱신 시점 문제로 확인되어')).toBeVisible()
    await row2.click()
    await expect(page.getByText('확인 결과 캐시 갱신 시점 문제로 확인되어')).toBeHidden()
  })

  test('T21/T22: 딥링크 — 본인 소유 티켓 직접 진입은 정상 렌더', async ({ page }) => {
    await page.goto('/help/ticket-1')
    await expect(page.getByRole('heading', { name: '주차 이동 시 가용 시간이 초기화돼요' })).toBeVisible()
    await page.getByRole('button', { name: '← 내 문의' }).click()
    await expect(page).toHaveURL(/\/settings\/support$/)
  })

  test('T21: 딥링크 — 타인 소유 티켓 직접 진입 시 SCR-403으로 리다이렉트', async ({ page }) => {
    await page.goto('/help/ticket-99')
    await expect(page).toHaveURL(/\/403$/)
    await expect(page.getByText('본인이 작성한 문의만 볼 수 있습니다')).toBeVisible()
    // 답변 내용이 어느 프레임에서도 노출되지 않아야 함(정보 유출 회귀 방지).
    await expect(page.getByText('이 답변은 다른 사용자에게만 보여야 합니다')).toHaveCount(0)
  })
})

test.describe('SCR-HELP-NEW — 문의 작성 모달', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings/support')
    await page.getByRole('button', { name: '새 문의 작성' }).click()
  })

  test('T15: 제목/내용이 비어 있으면 제출 버튼 비활성', async ({ page }) => {
    await expect(page.getByRole('button', { name: '접수하기' })).toBeDisabled()
  })

  test('T16: 카테고리 select 기본값 = 계정, 4종 옵션', async ({ page }) => {
    const select = page.getByLabel('카테고리')
    await expect(select).toHaveValue('ACCOUNT')
    await expect(select.locator('option')).toHaveCount(4)
  })

  test('T17: 회신 이메일 프리필 + 비운 채 제출 허용', async ({ page }) => {
    const emailField = page.getByLabel(/회신 이메일/)
    await expect(emailField).toHaveValue('user@openplan.dev')
    await emailField.fill('')
    await page.getByLabel('제목 *').fill('테스트 문의 제목')
    await page.getByLabel('내용 *').fill('테스트 문의 내용입니다')
    await expect(page.getByRole('button', { name: '접수하기' })).toBeEnabled()
  })

  test('T18: 첨부파일 6개 선택 시 토스트 에러', async () => {
    // TODO(실행 시): setInputFiles로 6개 임시 파일 업로드 후 토스트 텍스트 확인.
    test.fixme(true, '임시 파일 픽스처 미구현 — 실행 승인 후 addInitScript/setInputFiles 추가')
  })

  test('T19: 제목/내용 입력 후 제출 → 토스트 + 모달 닫힘 + 내 문의 탭 전환 + 목록 갱신', async ({ page }) => {
    await page.getByLabel('제목 *').fill('테스트 문의 제목')
    await page.getByLabel('내용 *').fill('테스트 문의 내용입니다')
    await page.getByRole('button', { name: '접수하기' }).click()
    await expect(page.getByText('문의가 접수되었습니다')).toBeVisible()
    await expect(page.getByRole('tab', { name: '내 문의', selected: true })).toBeVisible()
    await expect(page.getByText('테스트 문의 제목')).toBeVisible()
  })

  test('T20(결함 후보): 모달 오픈 직후 아무 입력 없이도 인라인 에러 텍스트가 이미 보임', async ({ page }) => {
    // 기대: 사용자가 아직 아무 것도 하지 않았으므로 에러가 보이지 않아야 하나,
    // 정적 검토 결과 코드가 즉시 노출한다(§8 결함 후보). 아래 assertion은 "현재
    // 구현의 실제 동작"을 기록하는 회귀 스냅샷 성격 — 수정되면 이 테스트도
    // 같이 뒤집혀야 한다(의도적으로 실패를 "기대"하지 않고, 수정 시 갱신할 것).
    await expect(page.getByRole('alert')).toHaveText('제목과 내용을 입력해 주세요')
  })
})
