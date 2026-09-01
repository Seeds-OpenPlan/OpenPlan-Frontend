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
  /*
    `PW_NO_WEBSERVER=1`이면 이 블록을 건너뛴다.

    왜 필요한가 — 이 저장소에서 Playwright는 **Windows에서** 돌려야 한다(WSL은
    chromium 기동에 필요한 시스템 라이브러리가 없고 install-deps가 sudo를
    요구한다, 위 주석 참고). 그런데 그 Windows 실행 환경에서는 `npm`이 PATH에
    없어 이 `command`가 그대로 실패한다("'npm'은(는) 내부 또는 외부 명령...").
    지금까지 안 드러난 이유는 `reuseExistingServer: true`가 5173에 이미 떠 있던
    다른 서버를 주워 썼기 때문이고, 그 서버가 없으면 스위트 전체가 시작조차
    못 한다.

    dev 서버를 WSL에서 따로 띄우고 스펙이 절대 URL을 쓰는 경우(예:
    plan-grid-fit-height.spec.js는 워크트리 전용 포트를 겨냥한다)에는 이 블록이
    할 일이 없으므로 끄고 돈다. 기본 동작은 그대로 두어 기존 스펙들에는 영향이
    없다.
  */
  webServer: process.env.PW_NO_WEBSERVER
    ? undefined
    : {
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
