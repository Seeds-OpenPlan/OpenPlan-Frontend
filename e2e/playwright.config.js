// e2e/playwright.config.js
//
// SCAFFOLD ONLY — 이번 QA 사이클(ST-F1-15, W6)에서 실행하지 않았다.
// `@playwright/test`는 아직 devDependency로 설치되지 않았고(`npx playwright
// install` 오너 승인 전), 이 config는 승인 후 바로 돌릴 수 있도록 미리
// 작성해 둔 것이다. 승인 시 필요한 절차:
//   1) npm i -D @playwright/test (오너 승인 필요)
//   2) npx playwright install --with-deps chromium (오너 승인 필요)
//   3) npx playwright test --config=e2e/playwright.config.js
//
// 뷰포트 분기 기준은 src/hooks/useMediaQuery.js의 useIsDesktop()과 동일하게
// 맞춘다(min-width: 768px) — desktop 프로젝트는 768px 이상, mobile 프로젝트는
// 375px(iPhone SE급)로 명확히 그 아래를 잡아 분기 경계에서 흔들리지 않게 한다.
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } },
    },
  ],
})
