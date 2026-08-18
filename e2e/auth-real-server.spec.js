// e2e/auth-real-server.spec.js
//
// W5 인증 실서버 왕복 검증 (2026-08-18). 이 저장소에서 **처음으로 실제 실행되는**
// e2e 스펙이다 — 나머지 스펙들은 @playwright/test 미설치 상태의 스캐폴드였다.
//
// 대상은 mock이 아니라 실서버다(vite.config.js 프록시 → 13.208.66.211).
// 그래서 앞의 두 테스트를 제외한 나머지는 **실제 계정**이 필요하다. 자격증명은
// 코드에 넣지 않고 환경변수로만 받는다:
//
//   E2E_EMAIL=... E2E_PASSWORD=... npx playwright test --config=e2e/playwright.config.js e2e/auth-real-server.spec.js
//
// 환경변수가 없으면 계정 의존 테스트는 skip 되고, 계정 없이 확인 가능한 두 건
// (미로그인 리다이렉트 · 소셜 이탈)만 돈다.
import { test, expect } from '@playwright/test'

const EMAIL = process.env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD
const hasAccount = Boolean(EMAIL && PASSWORD)

/** 로그인 폼을 채우고 대시보드 진입까지 기다린다. */
async function login(page) {
  await page.goto('/login')
  await page.getByLabel('이메일').fill(EMAIL)
  await page.getByLabel('비밀번호').fill(PASSWORD)
  await page.getByRole('button', { name: '로그인' }).click()
  // 로그인 성공 시 LoginPage가 '/'로 replace 이동한다.
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })
}

test.describe('W5 인증 — 계정 없이 확인 가능', () => {
  test('(1) 미로그인으로 보호 라우트 진입 → 로그인 화면으로 보낸다', async ({ page }) => {
    // 고치기 전: 401이 sessionGuardLoader의 403 분기에 걸리지 않아 rethrow →
    // RootErrorBoundary(일반 오류 화면)로 떨어졌다.
    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 })
    await expect(page.getByRole('button', { name: '로그인' })).toBeVisible()
  })

  test('(2) 소셜 버튼 → 실서버 인가 엔드포인트로 브라우저가 이탈한다', async ({ page }) => {
    // 고치기 전: navigate('/')로 서버를 거치지 않고 대시보드에 들어가는 mock이었다.
    // 지금은 문서 이동이라 페이지가 오리진 밖으로 나간다. 소셜 앱 주소가 아직
    // 등록되지 않아 서버가 곧바로 실패 리다이렉트(E-AUTH-010)를 준다 — 그 착지
    // 자체가 "서버를 실제로 거쳤다"는 증거다.
    await page.goto('/login')
    await page.getByRole('button', { name: 'Google로 계속하기' }).click()
    await page.waitForURL(/error=E-AUTH-010/, { timeout: 20_000 })
    // 착지 주소가 dev 서버(localhost)가 아니라 실서버라는 점도 함께 기록한다 —
    // 서버의 리다이렉트 Location이 절대 주소라 dev에서는 프론트로 못 돌아온다.
    console.log('[e2e] 소셜 착지 주소:', page.url())
  })
})

test.describe('W5 인증 — 실계정 필요', () => {
  test.skip(!hasAccount, 'E2E_EMAIL / E2E_PASSWORD 환경변수가 없으면 건너뛴다')

  test('(3) 로그인 → 대시보드 진입, 세션 쿠키 발급', async ({ page }) => {
    await login(page)
    const cookies = await page.context().cookies()
    // 쿠키 이름을 리포트에 남긴다 — 문서는 op_at/op_rt로 적고 있으나 실서버
    // 실제 이름을 확인해 둔다(아래 만료 테스트가 이 이름에 의존한다).
    console.log('[e2e] 세션 쿠키:', cookies.map((c) => c.name).join(', ') || '(없음)')
    expect(cookies.length).toBeGreaterThan(0)
  })

  test('(4) 로그아웃 → 로그인 화면. 만료 오버레이가 뜨면 안 된다', async ({ page }) => {
    // 실사용 결함(오너 확인): 로그아웃했는데 "세션이 만료되었습니다"가 떴다.
    await login(page)
    await page.goto('/settings/account')
    await page.getByRole('button', { name: '로그아웃' }).click()
    // 확인 모달의 확인 버튼(같은 라벨) — 모달 안쪽을 명시적으로 집는다.
    await page.getByRole('dialog').getByRole('button', { name: '로그아웃' }).click()

    await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 })
    await expect(page.getByText('세션이 만료되었습니다')).toHaveCount(0)
  })

  test('(5) access 쿠키만 만료 → 조용히 갱신되어 화면이 계속 동작한다', async ({ page }) => {
    await login(page)
    const context = page.context()
    const cookies = await context.cookies()
    const refreshOnly = cookies.filter((c) => !/(^|_)at$|access/i.test(c.name))
    expect(refreshOnly.length).toBeGreaterThan(0) // refresh 쿠키가 남아야 의미가 있다

    await context.clearCookies()
    await context.addCookies(refreshOnly)

    // 아무 동작이나 — 보호 라우트 재진입이 세션을 다시 묻는다.
    await page.goto('/settings/account')
    // 갱신이 성공했으면 로그인 화면으로도, 만료 오버레이로도 가지 않는다.
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })
    await expect(page.getByText('세션이 만료되었습니다')).toHaveCount(0)
  })

  test('(6) 세션 소실 → 만료 오버레이 → 재로그인 → 직전 화면 복귀', async ({ page }) => {
    await login(page)
    await page.goto('/settings/account')
    await expect(page.getByRole('heading', { name: '계정 관리' })).toBeVisible({ timeout: 15_000 })

    // 쿠키를 지운 뒤, **라우팅 없이 화면 안에서** 서버 요청을 일으켜야 한다.
    // reload를 쓰면 sessionGuardLoader가 먼저 돌아 로그인 화면으로 가버려
    // 오버레이 경로를 아예 지나치지 않는다(초안이 그랬다). 이름 변경 저장은
    // PATCH 한 번을 내는 가장 단순하고 파괴적이지 않은 사용자 동작이다.
    await page.context().clearCookies()
    await page.getByRole('button', { name: '이름 변경' }).click()
    await page.getByRole('dialog').getByRole('button', { name: '저장' }).click()

    // 갱신 실패 → OVL-SESSION. 배경(계정 관리 화면)은 언마운트되지 않아야 한다(NFR-019).
    const overlay = page.getByText('세션이 만료되었습니다')
    await expect(overlay).toBeVisible({ timeout: 20_000 })
    await expect(page).toHaveURL(/\/settings\/account/)

    // 재로그인 → 직전 화면 복귀(NFR-004).
    await page.getByLabel('이메일').fill(EMAIL)
    await page.getByLabel('비밀번호').fill(PASSWORD)
    await page.getByRole('button', { name: '다시 로그인' }).click()
    await expect(overlay).toHaveCount(0, { timeout: 20_000 })
    await expect(page).toHaveURL(/\/settings\/account/)
  })
})

test.describe('W5 인증 — 계정 없이 확인 가능 (계약)', () => {
  test('(7) 비밀번호 재설정 확정이 계약대로 newPassword 를 보낸다', async ({ page }) => {
    // 실사용 결함(오너, 2026-08-18): 새 비밀번호 저장 시 "비밀번호를 저장하지
    // 못했습니다"만 떴다. 프론트가 body 를 {password} 로 보내는데 openapi
    // `completePasswordReset` 의 required 는 [newPassword] 라, 서버가 400
    // E-COM-001 을 냈고 그 코드는 화면의 E-AUTH-006 분기에 걸리지 않아
    // 원인을 알 수 없는 일반 실패로만 보였다.
    //
    // 유효한 토큰은 메일함이 있어야 얻을 수 있으므로 더미 토큰을 쓴다. 서버는
    // 본문 검증을 먼저 하므로, 필드명이 맞으면 400(형식 오류)이 아니라
    // 410(만료·사용된 링크)이 온다 — 그 차이가 이 테스트의 판정 기준이다.
    let sentBody = null
    let status = null
    page.on('request', (req) => {
      if (req.url().includes('/auth/password-resets/') && req.method() === 'PATCH') {
        sentBody = req.postData()
      }
    })
    page.on('response', (res) => {
      if (res.url().includes('/auth/password-resets/') && res.request().method() === 'PATCH') {
        status = res.status()
      }
    })

    await page.goto('/reset-password/confirm?token=dummy-token-for-contract-check')
    const pw = 'Newpass123!'
    await page.getByLabel('새 비밀번호', { exact: true }).fill(pw)
    await page.getByLabel('새 비밀번호 확인').fill(pw)
    await page.getByRole('button', { name: '비밀번호 저장' }).click()

    await expect
      .poll(() => status, { timeout: 20_000, message: 'PATCH 응답을 받지 못했다' })
      .not.toBeNull()

    expect(sentBody, '요청 본문').toContain('newPassword')
    expect(sentBody, '옛 필드명이 남아 있으면 안 된다').not.toMatch(/"password"/)
    // 400(형식 오류)이면 필드명이 여전히 틀린 것이다.
    expect(status, '더미 토큰이므로 410이어야 한다 — 400이면 계약 불일치').toBe(410)
    // 그리고 화면은 그 410을 만료 안내로 번역해야 한다(일반 실패 문구가 아니라).
    await expect(page.getByText('링크가 만료되었거나 이미 사용되었습니다')).toBeVisible()
  })
})
