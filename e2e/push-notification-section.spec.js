// e2e/push-notification-section.spec.js — ADR-0015 FE 구현 검증.
//
// 세 서버 호출(알림 설정·푸시 설정·VAPID 공개키)을 전부 page.route로 가로채
// 응답을 직접 만들어 준다 — 로컬 dev 서버는 베이스 URL 없이 이 경로들을 바로
// 두드리는데(VITE_API_BASE_URL 미설정), 매칭되지 않는 GET은 Vite의 기본 SPA
// 폴백이 index.html(200, text/html)을 돌려줘 withDevFallback의 "404/네트워크
// 오류일 때만 mock으로 폴백" 조건에 걸리지 않는다(실측, 2026-10-08) — 그래서
// 실제 서버가 없는 이 테스트는 mock 라우트로 완전히 결정적인 응답을 보장한다.
import { test, expect } from '@playwright/test'

const PUBLIC_KEY =
  'BDd3_hVL9fZi9Ybo2UUzA284WG5FZR30_95YLw7I9t4KdDAfWFbNvdFH4-9VSmHjBRfc1BVeK73MD7qUGK73Cos'

async function mockPushEndpoints(page) {
  // sessionGuardLoader(router.js)가 이 둘을 먼저 통과해야 한다 — 안 모킹하면
  // 실서버 401/온보딩 미완료로 읽혀 /settings/notifications 진입 자체가
  // /onboarding으로 리다이렉트된다(plan-grid-fit-height.spec.js의 같은 모킹
  // 이유 참조. 그 스펙은 VITE_API_BASE_URL=/api/v1 환경에서 작성돼
  // `/api/v1/**`를 가로채지만, 이 워크트리는 그 env가 없어 baseURL이 빈
  // 문자열이다 — 그래서 여기서는 접두사 없는 경로를 그대로 가로챈다).
  await page.route('**/auth/session', (route) =>
    route.fulfill({ json: { data: { authenticated: true } } }),
  )
  await page.route('**/users/me/onboarding-progress', (route) =>
    route.fulfill({
      json: { data: { onboardingCompleted: true, currentStep: 'DONE', tutorialCompleted: true } },
    }),
  )
  // 기존 5종 인앱 토글 화면도 같은 페이지에 있어 같이 띄워야 렌더가 끝난다.
  await page.route('**/users/me/notification-settings', (route) =>
    route.fulfill({
      json: {
        data: {
          masterEnabled: true,
          dueSoonTasks: true,
          planRisk: true,
          inquiryReply: true,
          announcement: false,
          weeklyReminder: true,
        },
      },
    }),
  )
  await page.route('**/users/me/push-settings', (route) =>
    route.fulfill({
      json: { data: { taskEnabled: false, fixedScheduleEnabled: false, scheduleEnabled: false } },
    }),
  )
  await page.route('**/push/vapid-public-key', (route) =>
    route.fulfill({ json: { data: { publicKey: PUBLIC_KEY } } }),
  )
}

test.describe('SettingsNotificationsPage — 푸시 알림 섹션 (ADR-0015)', () => {
  test('일반 URL(웹)에서는 푸시 섹션이 전혀 그려지지 않는다', async ({ page }) => {
    await mockPushEndpoints(page)
    await page.goto('/settings/notifications')

    await expect(page.getByRole('heading', { name: '알림', level: 2 })).toBeVisible()
    // 섹션 전체(제목·설명)도, 개별 토글도 모두 없어야 한다 — "숨김(disabled)"이
    // 아니라 "아예 안 그림"이 ADR의 사용자 결정이다.
    await expect(page.getByRole('heading', { name: '푸시 알림' })).toHaveCount(0)
    // 접근성 이름은 label+description이 한 span(aria-labelledby)으로 합쳐져
    // "태스크 저장(확정)한 주간 계획의 태스크"처럼 길다(Toggle.jsx 구조) — 그래서
    // 접두 앵커(^)로 매칭한다. "태스크"만 쓰면 "마감 임박 태스크"(기존 5종
    // 토글)에도 부분 매칭돼 버린다.
    await expect(page.getByRole('switch', { name: /^태스크\s/ })).toHaveCount(0)
    await expect(page.getByRole('switch', { name: /^고정 일정\s/ })).toHaveCount(0)
    await expect(page.getByRole('switch', { name: /^일정\s/ })).toHaveCount(0)
  })

  test('?platform=android(안드로이드 앱)에서는 푸시 섹션과 3개 토글이 보인다', async ({ page }) => {
    await mockPushEndpoints(page)
    await page.goto('/settings/notifications?platform=android')

    await expect(page.getByRole('heading', { name: '푸시 알림' })).toBeVisible()
    await expect(page.getByText('시작 10분 전에 기기로 알려드립니다')).toBeVisible()

    const task = page.getByRole('switch', { name: /^태스크\s/ })
    const fixedSchedule = page.getByRole('switch', { name: /^고정 일정\s/ })
    const schedule = page.getByRole('switch', { name: /^일정\s/ })
    await expect(task).toBeVisible()
    await expect(fixedSchedule).toBeVisible()
    await expect(schedule).toBeVisible()

    // 기본값 전부 꺼짐(ADR 결정 ⑥) — mock GET이 돌려준 세 false가 그대로 반영됐는지.
    expect(await task.getAttribute('aria-checked')).toBe('false')
    expect(await fixedSchedule.getAttribute('aria-checked')).toBe('false')
    expect(await schedule.getAttribute('aria-checked')).toBe('false')
  })
})
