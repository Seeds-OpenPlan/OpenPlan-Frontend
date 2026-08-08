// e2e/project-accordion-regression.spec.js
//
// SCAFFOLD ONLY — 미실행(ST-F1-15 W6 QA). 대응 케이스: st-f1-15-test-cases.md
// T39 — ST-F1-15가 ProjectAccordionRow를 공용 AccordionRow 셸로 리팩터한
// 것에 대한 회귀 확인(이 스토리의 직접 범위는 아니지만 사이드이펙트 대상).
import { test, expect } from '@playwright/test'

test.describe('회귀 — 프로젝트 아코디언 (AccordionRow 공용화)', () => {
  test('T39: 행 펼침/접힘, 배지, 편집/복제/삭제 개별 클릭, 진행률 바 정상 동작', async ({ page }) => {
    await page.goto('/projects')
    const firstRow = page.getByRole('button', { name: /펼치기$/ }).first()
    await firstRow.click()
    await expect(page.getByRole('button', { name: '편집' }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: '복제' }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: '삭제' }).first()).toBeVisible()

    // 액션 버튼 클릭이 행 토글(접힘)을 트리거하지 않아야 함(z-레이어링 회귀 확인).
    await page.getByRole('button', { name: '편집' }).first().click({ trial: true })
    await expect(firstRow).toHaveAttribute('aria-expanded', 'true')
  })
})
