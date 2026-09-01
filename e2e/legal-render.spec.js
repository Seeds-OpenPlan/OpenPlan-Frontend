import { test, expect } from '@playwright/test'

// 세션 없이 두 URL 을 직접 연다 — 구글 심사와 가입 화면 링크가 하는 것과 같은 진입.
test('개인정보처리방침이 비로그인 상태로 렌더된다', async ({ page }) => {
  await page.goto('/legal/privacy')
  await expect(page.getByRole('heading', { name: '개인정보처리방침', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: /제4조/ })).toBeVisible()
  await expect(page.getByText('이전되지 않는 항목', { exact: false })).toBeVisible()

  // 국외 이전 고지는 «이전받는 자» 만으로는 요건을 못 채운다 — 국가가 함께 있어야 한다.
  // 인프라가 국내로 옮겨가면 이 단언이 먼저 깨져서 방침을 같이 고치게 만든다.
  await expect(page.getByText('이전되는 국가: 일본', { exact: false })).toBeVisible()
  await expect(page.getByText('이전되는 국가: 미국', { exact: false })).toBeVisible()

  // 구글 심사관이 여는 화면에 확정 필요 표시가 남아 있으면 그대로 반려 사유다.
  // legalOperator.js 에 미확정 값이 다시 생기면 여기서 먼저 걸린다.
  await expect(page.getByText('[운영자 확정 필요]', { exact: false })).toHaveCount(0)
})

test('이용약관이 비로그인 상태로 렌더된다', async ({ page }) => {
  await page.goto('/legal/terms')
  await expect(page.getByRole('heading', { name: '이용약관', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: /제6조/ })).toBeVisible()
})

test('가입 화면의 동의 문구가 두 문서로 실제로 링크된다', async ({ page }) => {
  await page.goto('/signup')
  const terms = page.getByRole('link', { name: '이용약관' })
  const privacy = page.getByRole('link', { name: '개인정보 처리방침' })
  await expect(terms).toHaveAttribute('href', '/legal/terms')
  await expect(privacy).toHaveAttribute('href', '/legal/privacy')

  // D-111 방지: 링크를 눌러도 동의 체크박스가 토글되지 않아야 한다.
  const box = page.getByRole('checkbox')
  await expect(box).not.toBeChecked()
  await terms.click({ modifiers: ['Control'] }) // 새 탭 — 현재 페이지 상태만 본다
  await expect(box).not.toBeChecked()
})

test('랜딩 화면 푸터에 두 링크가 보인다', async ({ page }) => {
  await page.goto('/landing')
  await expect(page.getByRole('link', { name: '이용약관' })).toBeVisible()
  await expect(page.getByRole('link', { name: '개인정보처리방침' })).toBeVisible()
})
