// e2e/playwright.config.js
//
// W5(2026-08-18) 오너 승인으로 `@playwright/test` 가 devDependency 로 들어왔고,
// `auth-real-server.spec.js` 가 이 저장소에서 처음으로 실제 실행됐다(6/6 통과).
// 나머지 스펙들은 아직 스캐폴드 상태다 — 실행해 본 적 없다.
//
//   npm run test:e2e
//
// ⚠️ WSL 에서는 브라우저가 안 뜬다: chromium 이 libnspr4 등 시스템 라이브러리를
// 요구하는데 `npx playwright install-deps` 가 sudo 를 필요로 하고 이 환경은
// 무암호 sudo 가 아니다. W5 검증은 **브라우저만 Windows 에서** 띄우고 dev 서버는
// WSL 것을 그대로 쓰는 방식으로 돌렸다(WSL mirrored networking 으로
// Windows→localhost:5173 이 닿는다). WSL 에서 돌리려면 먼저:
//   sudo npx playwright install-deps chromium
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
