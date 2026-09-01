// e2e/plan-grid-fit-height.spec.js
//
// W6 QA — 주간 계획 격자 "맞춤" 세로 축척 (구현: 08-impl-notes/frontend.md §8,
// src/features/plan/planGeometry.js의 fitHourPx / useHourScale.js의 'fit' 상태).
//
// 대상은 이 워크트리 전용 dev 서버 http://localhost:5199 (WSL vite, --strictPort)다.
// playwright.config.js의 baseURL(5173)에 기대지 않고 이 파일 안에서 절대 URL을 쓴다 —
// 5173에는 원본 체크아웃의 다른 서버가 떠 있어, baseURL을 썼다면 옛 코드를 테스트하고
// 통과했다고 보고할 뻔했다(리드가 실측으로 확인해 알려준 함정).
//
// 왜 실서버가 아니라 page.route() 전체 모킹인가 — 실서버(vite 프록시 → 13.208.66.211)는
// /auth/session에 401을 주고 sessionGuardLoader가 즉시 /login으로 보낸다. 이 저장소의
// E2E_EMAIL/E2E_PASSWORD(auth-real-server.spec.js가 쓰는 것과 같은 메커니즘)는 이번
// 세션에서도 확보하지 못했고, 그 계정에 이 주에 가용시간·블록이 있는지도(frontend.md §8.6이
// 이미 "미확인"으로 남긴 항목) 여전히 모른다. 이 스펙이 재는 것(레이아웃 불변식)은 서버
// 데이터의 정합성과 무관하고 오히려 결정적 입력이 있어야 재현 가능한 측정이 되므로,
// 계정에 우연히 있는 데이터에 기대는 것보다 전체 모킹이 QA 원칙(재현 가능한 증거)에 맞다.
// 모킹 응답 형태(엔벨로프 {data:...}, availability의 patterns/startTime 등)는
// planApi.js/fixedScheduleApi.js/onboardingApi.js/client.js를 코드로 대조해 확인한
// 실제 계약이다 — 각 route 분기 옆에 근거를 남긴다.
import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:5199'

const WEEKDAY_AVAILABILITY = ['MON', 'TUE', 'WED', 'THU', 'FRI']
  .map((weekday) => ({ weekday, startTime: '09:00:00', endTime: '18:00:00', isActive: true }))
  .concat(
    ['SAT', 'SUN'].map((weekday) => ({
      weekday,
      startTime: '09:00:00',
      endTime: '18:00:00',
      isActive: false,
    })),
  )

function addDaysISO(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * 이 화면이 마운트 시점에 필요로 하는 모든 GET을 모킹한다(auth·onboarding·availability·
 * weekly-plans·fixed-schedules·tasks·notifications). PATCH /plan-blocks/{id}는 호출된
 * 본문을 그대로 흘려 받도록 onPatch 콜백을 제공할 수 있다(TC-05용).
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ blocks?: object[], availability?: object[], onPatch?: (body: any) => void }} [opts]
 */
async function mockPlanBackend(
  page,
  { blocks = [], availability = WEEKDAY_AVAILABILITY, onPatch, issues = null } = {},
) {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace(/^\/api\/v1/, '')
    const method = route.request().method()

    // client.js 응답 인터셉터: response.data.data ?? response.data 를 벗겨 낸다 —
    // 그래서 아래 모든 응답 바디는 { data: <payload> } 봉투를 갖는다.
    if (path === '/auth/session') {
      return route.fulfill({ status: 200, json: { data: { authenticated: true } } })
    }
    if (path === '/users/me/onboarding-progress') {
      // onboardingApi.js normalizeProgress: onboardingCompleted/tutorialCompleted를
      // 명시적으로 안 주면 온보딩·튜토리얼 오버레이가 격자 위를 덮는다(실측으로 확인).
      return route.fulfill({
        status: 200,
        json: { data: { onboardingCompleted: true, currentStep: 'DONE', tutorialCompleted: true } },
      })
    }
    if (path === '/users/me/availabilities') {
      // planApi.js normalizeAvailability: {patterns:[...]} 봉투, HH:mm:ss 시각 문자열.
      return route.fulfill({ status: 200, json: { data: { patterns: availability, weeklyTotalMinutes: 2700 } } })
    }
    if (path === '/weekly-plans' && method === 'GET') {
      const weekStartDate = url.searchParams.get('weekStartDate')
      // planApi.js getWeek/normalizeWeek: `plan`이 null이 아니어야 get-or-create(POST)
      // 분기를 안 타므로, 매 요청(현재 주 + 앞뒤 프리페치 주 3건)에 항상 채워서 응답한다.
      return route.fulfill({
        status: 200,
        json: {
          data: {
            plan: {
              weeklyPlanId: 1,
              weekStartDate,
              weekEndDate: addDaysISO(weekStartDate, 6),
              status: 'DRAFT',
              version: 1,
              totalPlannedMinutes: 0,
            },
            blocks: blocks.map((b) => ({ ...b, startAt: b.startAt(weekStartDate), endAt: b.endAt(weekStartDate) })),
            unassignedCount: 0,
            validationSummary: { blockCount: 0, warningCount: 0 },
          },
        },
      })
    }
    if (path.startsWith('/plan-blocks/') && method === 'PATCH') {
      const body = route.request().postDataJSON()
      onPatch?.(body)
      return route.fulfill({ status: 200, json: { data: { planBlockId: 101 } } })
    }
    if (path.endsWith('/validations') && method === 'POST') {
      // ValidationReport (openapi). issues를 안 주면 "문제 없음"으로 응답한다.
      return route.fulfill({
        status: 200,
        json: {
          data: {
            dryRun: true,
            savable: !(issues ?? []).some((i) => i.severity === 'BLOCK'),
            issues: issues ?? [],
            evaluatedAt: new Date().toISOString(),
          },
        },
      })
    }
    if (path === '/fixed-schedules') return route.fulfill({ status: 200, json: { data: [] } })
    if (path === '/tasks') return route.fulfill({ status: 200, json: { data: [] } })
    // 그 외(알림 배지 등, 이 화면의 핵심과 무관) — 빈 목록으로 조용히 응답해 화면이
    // 실서버 401로 얼룩지지 않게 한다.
    return route.fulfill({ status: 200, json: { data: [] } })
  })
}

/** CalendarGrid.jsx:434 — 카드 안의 유일한 세로 스크롤 컨테이너. */
function scroller(page) {
  return page.locator('div.overflow-hidden.rounded-card div.overflow-y-auto')
}

test.describe('주간 계획 격자 — 맞춤 세로 축척 (W6)', () => {
  test('TC-01: 핵심 불변식 — 집중 모드, 가용시간만 있을 때 3개 뷰포트 모두 스크롤 없음', async ({ page }) => {
    await mockPlanBackend(page) // 가용 09-18(9h), 블록 없음 — 창을 넓히는 것이 없는 깨끗한 케이스.
    await page.goto(`${BASE}/weekly`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('button', { name: /세로 축척/ })).toBeVisible()

    for (const height of [700, 900, 1200]) {
      await page.setViewportSize({ width: 1280, height })
      await page.waitForTimeout(300) // WeeklyPage.jsx:236의 resize 리스너가 재측정할 시간.
      const dims = await scroller(page).evaluate((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }))
      expect(dims.scrollHeight, `viewport ${height}px: scrollHeight<=clientHeight`).toBeLessThanOrEqual(
        dims.clientHeight,
      )
    }
  })

  /*
    TC-01은 뷰포트를 세 번 바꾸며 재는데, `setViewportSize`는 매번 resize 이벤트를
    쏘고 WeeklyPage의 측정 이펙트가 그때마다 다시 잰다. 즉 그 루프는 **항상 갓 잰
    값**으로 통과하며 최초 측정 경로를 통째로 우회한다 — 정작 사용자의 기본 경로는
    "열고 창을 안 건드림"이다.

    이 블록은 뷰포트를 goto **이전에** 한 번만 정하고 그 뒤로 resize를 일으키지
    않는다. 그래서 여기서 재는 것은 오직 최초 측정 + 폰트 스왑 재측정의 결과다.

    폰트가 왜 걸리는가: Pretendard는 CDN에서 비동기로 오고 font-display:swap이라
    (index.html), 첫 측정 뒤 폴백→Pretendard 교체로 격자 위쪽 글자 줄높이가 바뀌면
    달력 시작 위치가 몇 px 밀린다. WeeklyPage가 document.fonts.ready 후 한 번 더
    재는 이유이고, 이 케이스가 그 경로를 실제로 지나는 유일한 케이스다.
    그래서 단언 전에 fonts.ready를 기다린다 — 기다리지 않으면 스왑 전 상태를 재고
    지나가 버려 이 케이스의 의미가 사라진다.

    ⚠ 커버리지 한계(음성 대조로 실측 확인, 2026-08-31): WeeklyPage의
    document.fonts.ready 재측정을 **일부러 제거하고** 이 두 케이스를 돌려도 그대로
    통과했다. 즉 이 케이스는 "최초 로드 상태에서 불변식이 성립한다"는 회귀 가드로는
    유효하지만, **폰트 스왑 경로를 실제로 덮지는 못한다.** 헤드리스 환경에서 CDN
    폰트가 제때 오지 않거나(이 실행에서 케이스 소요가 7.8s → 17.0s로 늘었다)
    줄높이를 바꿀 만큼 스왑이 일어나지 않기 때문으로 보인다. 그 재측정은 여전히
    옳은 방어이지만 **자동 검증되지 않는 상태**이므로, 통과했다고 그 경로까지
    검증됐다고 읽지 말 것. 덮으려면 폰트 요청을 의도적으로 지연시키는 route와
    실제로 스왑이 일어났는지(document.fonts.check) 확인이 함께 필요하다.
  */
  for (const height of [700, 1000]) {
    test(`TC-01c: 최초 로드 그대로(리사이즈 없음) 스크롤 없음 — 뷰포트 ${height}px`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ viewport: { width: 1280, height } })
      const page = await context.newPage()
      try {
        await mockPlanBackend(page)
        await page.goto(`${BASE}/weekly`, { waitUntil: 'networkidle' })
        await expect(page.getByRole('button', { name: /세로 축척/ })).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        // 폰트 스왑이 유발한 재측정이 커밋될 한 프레임.
        await page.waitForTimeout(200)

        const dims = await scroller(page).evaluate((el) => ({
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
        }))
        expect(
          dims.scrollHeight,
          `최초 로드 ${height}px: scrollHeight(${dims.scrollHeight})<=clientHeight(${dims.clientHeight})`,
        ).toBeLessThanOrEqual(dims.clientHeight)
      } finally {
        await context.close()
      }
    })
  }

  test('TC-01b: 가용 밖 블록이 있으면 축척을 줄이는 대신 스크롤로 넘긴다', async ({ page }) => {
    /*
      visibleRange는 가용(09-18)과 실제로 그려지는 블록의 합집합으로 창을 넓힌다
      (가용 밖 블록이 잘리지 않게). 22-23시 블록 하나로 창은 09-23(14h)까지 벌어진다.

      2026-09-01 정정: 예전에는 그 넓어진 창이 **축척 기준**이기도 해서 격자 전체가
      작아졌고, 이 케이스는 축척이 바닥(FIT_HOUR_PX_MIN)에 걸려 남는 "최소한의
      스크롤"을 쟀다. 그런데 그 동작은 블록 하나를 옮길 때마다 화면이 출렁이게
      만든다(오너 보고). 이제 축척 기준은 가용 시간만이므로 크기는 그대로이고,
      넘치는 만큼은 스크롤이 받는다 — 그래서 여기서 기대하는 것은 "바닥 근처의
      작은 스크롤"이 아니라 **스크롤이 생긴다는 것 자체**다. 축척이 그대로라는
      것은 TC-21이 따로 못박는다.
    */
    await mockPlanBackend(page, {
      blocks: [
        {
          planBlockId: 101,
          blockType: 'TASK',
          title: '가용 밖 늦은 블록',
          status: 'PLANNED',
          startAt: (weekStartDate) => `${weekStartDate}T22:00:00`,
          endAt: (weekStartDate) => `${weekStartDate}T23:00:00`,
        },
      ],
    })
    await page.goto(`${BASE}/weekly`, { waitUntil: 'networkidle' })
    await page.setViewportSize({ width: 1280, height: 700 })
    await page.waitForTimeout(300)
    const dims = await scroller(page).evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }))
    // TC-01과 반대 방향의 단언 — 여기서는 스크롤이 생기는 것이 맞는 동작이다.
    expect(
      dims.scrollHeight,
      `가용 밖 블록이 있으면 넘쳐야 한다(scrollHeight ${dims.scrollHeight} vs clientHeight ${dims.clientHeight})`,
    ).toBeGreaterThan(dims.clientHeight)
  })

  test('TC-02: 여유 제거 — 첫 눈금이 가용 시작 정시(09)이고 위로 안 잘림', async ({ page }) => {
    await mockPlanBackend(page)
    await page.goto(`${BASE}/weekly`, { waitUntil: 'networkidle' })
    const sc = scroller(page)
    const firstTick = sc.locator('span.absolute.right-1').first()
    await expect(firstTick).toHaveText('09') // 예전(30분 패딩→정시 반올림) 동작이면 '08'.
    const scrollerBox = await sc.boundingBox()
    const tickBox = await firstTick.boundingBox()
    expect(tickBox.y).toBeGreaterThanOrEqual(scrollerBox.y)
  })

  /*
    [W6 델타 QA, 2026-09-01] "가로는 오버플로 없음"은 원래 데스크톱 전제였다 —
    이 케이스가 project 기본 뷰포트(bare `page`)를 썼는데, 지금까지 이 스펙
    전체가 desktop-chromium 프로젝트로만 돌아 그 전제가 한 번도 깨진 적이
    없었다. mobile-chromium 프로젝트(375×812)로 처음 돌려 보니 여기서
    **실패**했다 — `scrollWidth(640) > clientWidth`. 7일 열이 24h 전체를
    담으려면 640px 안팎이 필요한데 375px 폭에는 원리상 못 들어간다.
    `div.overflow-x-auto` 클래스 자체가 "이럴 땐 가로로 스크롤해라"는 뜻이라,
    이건 결함이 아니라 애초에 데스크톱 전용으로 쓰인 단언이 좁은 화면 일반에는
    안 맞았던 것뿐이다 — 그래서 뷰포트를 명시적으로 고정해 원래 의도(데스크톱
    가로 무오버플로)만 잠근다. 모바일의 가로 스크롤 자체가 괜찮은 UX인지는
    별개 질문이고, 아래 TC-03b가 그 값만 실측해 회귀 가드로 남긴다(정상/비정상
    판정은 리드 몫으로 남겨 둔다).
  */
  test('TC-03: 24시간 모드 — 세로 스크롤은 정상, 가로는 오버플로 없음 (데스크톱)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await mockPlanBackend(page)
    await page.goto(`${BASE}/weekly`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: '24h', exact: true }).click()
    await page.waitForTimeout(300)

    const outer = page.locator('div.overflow-x-auto')
    const hdims = await outer.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }))
    expect(hdims.scrollWidth).toBeLessThanOrEqual(hdims.clientWidth)

    // 세로는 24h 전체(가용 09-18 대비 24h)를 담을 수 없으니 스크롤이 생기는 게 정상 —
    // 반대 방향 단언(요구 ②: "부분 스크롤이라도 쓸 만하게").
    const vdims = await scroller(page).evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }))
    expect(vdims.scrollHeight).toBeGreaterThan(vdims.clientHeight)
  })

  test('TC-03b [모바일, 실측만]: 24시간 모드에서 375px 폭은 가로 스크롤이 남는다(원인 기록, 판정 보류)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
    const page = await context.newPage()
    try {
      await mockPlanBackend(page)
      await page.goto(`${BASE}/weekly`, { waitUntil: 'networkidle' })
      await page.getByRole('button', { name: '24h', exact: true }).click()
      await page.waitForTimeout(300)
      const outer = page.locator('div.overflow-x-auto')
      const hdims = await outer.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }))
      // 판정 없음 — 이 값 자체를 남겨 리드가 "모바일 24h는 가로 스크롤로 둘지,
      // 열 폭을 줄일지"를 결정할 근거로 쓰게 한다. overflow-x-auto가 있으므로
      // 스크롤 자체는 최소한 깨지지 않고 동작한다(가로 스크롤바가 실제로 뜬다)는
      // 것만 확인한다.
      expect(hdims.scrollWidth, `375px 폭: scrollWidth(${hdims.scrollWidth}) vs clientWidth(${hdims.clientWidth})`).toBeGreaterThan(
        hdims.clientWidth,
      )
    } finally {
      await context.close()
    }
  })

  /*
    2026-08-31 (3차 요구: "맞춤이라는 단어를 빼", "100 = 맞춤 사이즈면 안 돼?")
    — 가운데 버튼은 이제 낱말 없이 **%만** 보여 주고, 그 %는 한 화면에 들어차는
    축척을 100%로 놓고 잰 값이다. 그래서 "누르면 100%로"와 "화면 크기로 복귀"가
    같은 동작이 됐다(예전에 필요했던 숨은 갈래가 사라졌다).

    [W6 델타 QA 재조정, 2026-09-01] — 이 테스트를 처음 돌렸을 때 `aria-pressed`
    단언이 초기 로드부터 실패했다. 원인은 결함이 아니라 **QA 도중에 실시간으로
    들어온 코드 변경**이었다 — `HourScaleControl.jsx` 헤더의 새 절("100%와
    '화면 추종'은 같은 말이 아니다", 2026-09-01 리뷰 지적)이 `aria-pressed`를
    통째로 없앴다: 수동 단계에 머문 채 창 크기가 우연히 지금 단계와 같은 기준을
    만들면 표시는 100%인데 모드는 여전히 수동이라, "100%=눌림"이라는
    `aria-pressed`가 그 상태에서 스스로 거짓말을 하기 때문이다(파일 헤더 참고).
    이제 상태는 **버튼의 aria-label 문구**(모드 `isFit`을 그대로 따름)로만
    전해진다 — `title`도 같은 정보를 담아 함께 확인한다.
  */
  test('TC-04: 축척 버튼 — 기본이 100%, −로 100%를 벗어나고, 누르면 100%로 복귀', async ({
    page,
  }) => {
    await mockPlanBackend(page)
    await page.goto(`${BASE}/weekly`, { waitUntil: 'networkidle' })

    const scaleBtn = page.getByRole('button', { name: /세로 축척/ })

    // 기본은 화면에 들어차는 축척이고, 그 기준이 100%다. "맞춤"이라는 낱말은
    // 화면에 없어야 한다(오너 요구). isFit=true는 aria-label에 "눌러서"가
    // 없는 것으로 드러난다(HourScaleControl.jsx의 두 분기 문구 참고).
    await expect(scaleBtn).toHaveAttribute('aria-label', /한 화면에 들어차는 크기$/)
    await expect(scaleBtn).toHaveAttribute('title', /한 화면에 들어차는 크기$/)
    await expect(scaleBtn).toHaveText('100%')
    await expect(scaleBtn).not.toContainText('맞춤')

    /*
      100%(집중, 스크롤 없음)에서는 **−가 잠긴다** — 더 줄여도 블록만 작아지고
      아래 빈 공간이 늘 뿐이라(상자 높이가 고정) 얻는 게 없다. 그래서 100%를
      벗어나려면 +를 쓴다.
    */
    await expect(page.getByRole('button', { name: /시간 간격 좁게/ })).toBeDisabled()
    await page.getByRole('button', { name: /시간 간격 넓게/ }).click()
    await expect(scaleBtn).toHaveAttribute('aria-label', /눌러서 100%/)
    await expect(scaleBtn).toHaveAttribute('title', '100%로 되돌리기')
    await expect(scaleBtn).not.toHaveText('100%')

    // %를 누르면 100%(= 한 화면에 들어차는 크기)로 되돌아온다.
    await scaleBtn.click()
    await expect(scaleBtn).toHaveAttribute('aria-label', /한 화면에 들어차는 크기$/)
    await expect(scaleBtn).toHaveText('100%')

    /*
      +/− 로도 100%에 다시 설 수 있어야 한다(2026-08-31 요구). 맞춤 축척이
      단계 사다리의 한 칸으로 끼어 있으므로, 한 칸 움직였다가 되돌아오면 정확히
      100%다. 예전에는 사다리가 고정 5칸뿐이라 이 왕복이 100%를 지나치고 다른
      값에 서서, 100%로 돌아갈 길이 가운데 버튼밖에 없었다.

      +로 먼저 올라가는 이유: 100%(집중)에서는 스크롤이 없어 −가 잠겨 있다
      (TC-19). 확대해서 넘치게 만든 뒤라야 −가 살아난다.
    */
    await page.getByRole('button', { name: /시간 간격 넓게/ }).click()
    await expect(scaleBtn).not.toHaveText('100%')
    await page.getByRole('button', { name: /시간 간격 좁게/ }).click()
    await expect(scaleBtn).toHaveText('100%')
    await expect(scaleBtn).toHaveAttribute('aria-label', /한 화면에 들어차는 크기$/)
  })

  test('TC-06: 배치된 블록 클릭 시 그쪽으로 스크롤 (24h 모드, 화면 밖 블록)', async ({ page }) => {
    await mockPlanBackend(page, {
      blocks: [
        {
          planBlockId: 101,
          blockType: 'TASK',
          title: 'E2E 클릭 스크롤 테스트',
          status: 'PLANNED',
          startAt: (weekStartDate) => `${weekStartDate}T22:00:00`,
          endAt: (weekStartDate) => `${weekStartDate}T23:00:00`,
        },
      ],
    })
    await page.goto(`${BASE}/weekly`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: '24h', exact: true }).click()
    await page.waitForTimeout(300)

    const sc = scroller(page)
    await sc.evaluate((el) => {
      el.scrollTop = 0
    })
    await page.waitForTimeout(200)

    const block = page.getByRole('button', { name: /E2E 클릭 스크롤 테스트/ })
    const beforeBox = await block.boundingBox()
    const scBoxBefore = await sc.boundingBox()
    // 전제 확인: 클릭 전엔 블록이 스크롤 영역 아래로 벗어나 있어야 이 케이스가 의미 있다.
    expect(beforeBox.y).toBeGreaterThan(scBoxBefore.y + scBoxBefore.height)

    await block.click()
    await page.waitForTimeout(700) // PlanBlock.jsx:322, behavior:'smooth' 정착 대기.

    const afterBox = await block.boundingBox()
    const scBoxAfter = await sc.boundingBox()
    expect(afterBox.y).toBeGreaterThanOrEqual(scBoxAfter.y)
    expect(afterBox.y + afterBox.height).toBeLessThanOrEqual(scBoxAfter.y + scBoxAfter.height)
  })

  /*
    TC-05 재시도(리드의 Thomas 리뷰 대응 수정 반영, 2026-08-31 2차). 이전 세션의
    실패는 코드 결함이 아니라 좌표 타겟팅 문제였다 — `page.mouse`로 블록 하단의
    8px 리사이즈 핸들(`PlanBlock.jsx`의 `h-2 bottom-0` span) 중앙(`box.height-4`)을
    잡으면 `document.elementFromPoint`와 네이티브 pointerdown 이벤트 로그 둘 다
    정확히 그 핸들(의 grip 자식)을 가리켰다 — MOVE로 새는 게 아니라 헤드리스에서도
    정상적으로 RESIZE가 시작됨을 실측으로 확인했다.

    makeResizeStart 헬퍼: 블록 하단 핸들을 grab→여러 스텝 이동→release 하는 절차를
    두 시나리오가 공유한다.

    최초 pointerdown은 `page.mouse`(실제 OS 좌표 이동)가 아니라 핸들 엘리먼트에
    JS로 직접 `dispatchEvent('pointerdown', ...)` 한다 — 실측으로 확인한 이유:
    이 블록처럼 짧은(SHORT_BLOCK_PX 미만) 블록은 `PlanBlock`의 hover 상세 카드가
    마우스가 블록 영역에 닿는 순간 열려 8px 손잡이 위를 카드가 덮을 수 있다
    (`document.elementFromPoint`가 핸들 대신 카드 컨테이너를 가리키는 것을 확인).
    `usePlanDrag`/이 함수의 리사이즈 모두 `window.addEventListener('pointermove'/
    'pointerup', ...)`로 좌표만 읽지 어떤 엘리먼트가 위에 있는지는 안 보므로
    (setPointerCapture 미사용, PlanBlock.jsx의 같은 성질 참고), 최초 pointerdown만
    핸들에 직접 dispatch해 hover 카드 유무와 무관하게 정확히 겨냥하고, 이후
    move/up은 `page.mouse`(윈도우 리스너가 어차피 다 받는다)로 이어간다.
  */
  async function dragBottomHandle(page, block, deltaY) {
    const handle = block.locator('span[aria-hidden="true"]').last() // 아래쪽(end) 리사이즈 핸들.
    const hbox = await handle.boundingBox()
    const x = Math.round(hbox.x + hbox.width / 2)
    const y = Math.round(hbox.y + hbox.height / 2)
    await handle.dispatchEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: 'mouse',
    })
    for (const step of [10, 30, 60, 100, 150, deltaY]) {
      if (step > deltaY) break
      await page.mouse.move(x, y + step, { steps: 3 })
      await page.waitForTimeout(60)
    }
  }

  test('TC-05: 15분 미만으로 경계에 붙은 블록 — 리사이즈 손잡이가 반응하며 최소 길이(15분)를 지켜 커밋된다', async ({
    page,
  }) => {
    // §8.4 결함① 재발(Thomas Major, 2026-08-31 2차 수정) — CalendarGrid.makeResizeStart의
    // 클램프 순서 버그: 예전엔 범위 클램프가 최소 길이보다 바깥에 있어, 블록 자신의
    // startMin+15가 이미 range.endMinutes를 넘는 경우(이 블록처럼 경계에 15분보다
    // 가깝게 붙은 경우) 계산 결과가 항상 원래 값으로 눌려 손잡이가 "죽어" 있었다
    // (에러도 토스트도 없이 커밋도 안 됨). 수정 후엔 최소 길이가 이겨 블록이 범위를
    // 살짝 넘겨서라도 15분을 확보한다 — 17:57~18:00(3분, 가용 종료 정시에 걸침)를
    // 아래로 끌면 18:12(17:57+15분)까지 자란다는 것이 그 증거다.
    let patched = null
    await mockPlanBackend(page, {
      blocks: [
        {
          planBlockId: 101,
          blockType: 'TASK',
          title: '경계에 붙은 짧은 블록',
          status: 'PLANNED',
          startAt: (weekStartDate) => `${weekStartDate}T17:57:00`,
          endAt: (weekStartDate) => `${weekStartDate}T18:00:00`,
        },
      ],
      onPatch: (body) => {
        patched = body
      },
    })
    await page.goto(`${BASE}/weekly`, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)

    const block = page.getByRole('button', { name: /경계에 붙은 짧은 블록/ })
    const beforeBox = await block.boundingBox()
    expect(beforeBox.height, '3분 블록은 15분 최소 높이로 부풀어 렌더된다').toBeGreaterThan(0)

    await dragBottomHandle(page, block, 220) // 그리드 바닥 한참 아래까지 끌어도 결과는 동일(§8.4 주석 그대로).
    const midBox = await block.boundingBox()
    expect(midBox.height, '리사이즈 프리뷰가 반응해야 한다 — 이전 결함은 여기서 높이가 그대로였다').toBeGreaterThan(
      beforeBox.height - 1,
    )

    await page.mouse.up()
    await page.waitForTimeout(200)

    expect(patched, 'PATCH /plan-blocks/101 이 커밋돼야 한다(예전엔 값이 안 바뀌어 아예 안 나갔다)').not.toBeNull()
    const committedEnd = new Date(patched.endAt ?? patched.end_at)
    const committedStart = new Date(patched.startAt ?? patched.start_at)
    const minutes = Math.round((committedEnd - committedStart) / 60000)
    expect(minutes, '최소 길이(15분)가 정확히 지켜져야 한다').toBe(15)
  })

  test('TC-05b: 경계에서 먼(15분 이상 여유 있는) 일반 블록은 여전히 range 밖으로 안 나간다', async ({ page }) => {
    // 회귀 확인 — 이번 우선순위 변경이 "평소 케이스"(대다수 블록)까지 깨지 않았는지.
    // 17:00-18:00(60분) 블록은 range.endMinutes(18:00)와 15분보다 훨씬 여유가 있으므로
    // Math.min(range.endMinutes, m) 쪽이 항상 먼저 이겨야 한다 — 손잡이를 아무리
    // 끌어도 endMin은 18:00에서 안 움직이고, 값이 안 바뀌었으니 PATCH도 안 나가야 한다.
    let patchCount = 0
    await mockPlanBackend(page, {
      blocks: [
        {
          planBlockId: 101,
          blockType: 'TASK',
          title: '경계에서 먼 일반 블록',
          status: 'PLANNED',
          startAt: (weekStartDate) => `${weekStartDate}T17:00:00`,
          endAt: (weekStartDate) => `${weekStartDate}T18:00:00`,
        },
      ],
      onPatch: () => {
        patchCount += 1
      },
    })
    await page.goto(`${BASE}/weekly`, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)

    const block = page.getByRole('button', { name: /경계에서 먼 일반 블록/ })
    const beforeBox = await block.boundingBox()

    await dragBottomHandle(page, block, 220)
    const midBox = await block.boundingBox()
    expect(midBox.height, 'range.endMinutes에 클램프되어 높이가 그대로여야 한다').toBeCloseTo(beforeBox.height, 0)

    await page.mouse.up()
    await page.waitForTimeout(200)
    expect(patchCount, '값이 안 바뀌었으니 PATCH가 나가면 안 된다').toBe(0)
  })

  /*
    TC-10 [회귀 가드, 2026-08-31 발견·수정] — 경계에 15분 미만으로 붙은 블록이
    CSS 패딩/보더 바닥 때문에 grid 자체를 넘쳐 핵심 불변식(scrollHeight<=clientHeight)을
    깨던 결함(Major)의 재발 방지 케이스.

    발견 경위: 리드가 TC-05(17:57-18:00 블록)의 렌더 높이를 의심해 "blockRect의 캡
    계산상 ~4px일 텐데 8px 손잡이를 어떻게 잡았느냐"고 물었다. 실측(getComputedStyle)
    으로 확인한 결과 둘 다 맞았다 — `blockRect`가 계산한 inline `height`는 실제로
    3.15px(=3분×pxPerMin, 경계 캡이 15분 인플레이션을 완전히 무력화한 값)이었지만,
    이 블록의 Tailwind 클래스(`p-1.5`=상하 패딩 6px씩 + `border`=1px씩, box-sizing:
    border-box)가 만드는 최소 렌더 높이(6+6+1+1=14px)가 그보다 커서 브라우저가
    실제로는 14px로 렌더했다 — `computedHeight` 14px, `offsetHeight` 14px로 재확인.

    TC-05의 손잡이는 실제로 잡힌다(14px 안에 8px 손잡이가 들어간다 — 그 자체는
    맞는 동작이고 TC-05는 그대로 유효했다). 문제는 다른 데 있었다: `blockRect`의
    캡은 "이 블록의 top+height가 정확히 range의 바닥(그리드 컨테이너의 실제 바닥)과
    맞아떨어지게" 만들려는 계산인데, 패딩/보더가 그 계산을 무시하고 박스를 더 키워
    버려 블록의 실제 바닥 가장자리가 그리드 컨테이너 바닥보다 아래로 삐져나갔다.

    수정 전 실측: 이 블록 하나만 있는 상태에서(뷰포트 1280×900, 가용 09-18) 스크롤
    컨테이너의 `scrollHeight(640) - clientHeight(629) = 11px` — 이 기능 전체가
    없애려던 바로 그 "몇 px 때문에 스크롤바가 생기는" 증상이, 여유 제거(§8.3)나
    맞춤 축척(§8.4)이 아니라 **블록 자신의 CSS 패딩/보더**로부터 재발했었다.

    재현 조건(수정 전): 블록의 실제 길이가 15분 미만이고(`ScheduleForm`이 5분 단위로
    이런 일정을 만들 수 있다 — `blockRect`의 자기 주석이 이미 지목한 바로 그 경로),
    그 블록의 시작 시각이 `range.endMinutes`로부터 약 13.3분(=14px÷pxPerMin, 이
    축척 기준) 이내여야 재현됐다 — 캡이 14px 미만으로 찌그러뜨리는 지점.

    수정: 픽셀을 더 정확히 계산하는 쪽으로는 이 문제를 닫을 수 없다 — 인라인 height로는
    CSS 최소 렌더 크기(패딩+보더)를 표현할 방법이 없기 때문이다. 그래서 지오메트리가
    아니라 구조로 막았다 — `CalendarGrid`의 격자 본문(`relative flex-1`)에
    `overflow-hidden`을 추가해 "무엇이 넘치든 스크롤 영역 자체를 못 늘린다"로 바꿨다.
    이 클립이 안전한 근거: `visibleRange`가 이 주에 그려지는 모든 구간을 감싸도록
    창을 넓히므로 범위 밖에 놓이는 "정상" 요소가 원래 없다 — hover 상세 카드·액션
    메뉴는 포털이라 이 클립에 갇히지 않는다(`PlanBlock.jsx`).

    이 테스트는 이제 **회귀 가드**다 — `test.fail()`을 걷어냈다(수정 확인 시
    `Expected to fail, but passed`로 뒤집힌 것을 실측했다). 다시 실패하면 이 클립이
    깨졌거나 우회됐다는 뜻이다.
  */
  test('TC-10: 경계에 15분 미만으로 붙은 블록이 있어도 grid를 안 넘친다 (Major 결함 회귀 가드)', async ({
    page,
  }) => {
      await mockPlanBackend(page, {
        blocks: [
          {
            planBlockId: 101,
            blockType: 'TASK',
            title: '경계 초단시간 블록',
            status: 'PLANNED',
            startAt: (weekStartDate) => `${weekStartDate}T17:57:00`,
            endAt: (weekStartDate) => `${weekStartDate}T18:00:00`,
          },
        ],
      })
      await page.goto(`${BASE}/weekly`, { waitUntil: 'networkidle' })
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(300)

      const dims = await scroller(page).evaluate((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }))
      expect(
        dims.scrollHeight,
        `경계 블록(17:57-18:00) 존재 시에도 컨테이너가 안 넘쳐야 한다: scrollHeight(${dims.scrollHeight}) vs clientHeight(${dims.clientHeight})`,
      ).toBeLessThanOrEqual(dims.clientHeight)
    },
  )

  test('TC-09: 시간 간격 변경이 aria-live 리전으로 스크린리더에 알려진다', async ({ page }) => {
    // HourScaleControl.jsx의 sr-only aria-live="polite" 리전(Thomas Minor 대응,
    // 2026-08-31 2차 수정) — "시간 간격 {percent}%{, 화면에 맞춤}" 텍스트가
    // 맞춤/수동 전환·+/− 클릭마다 갱신되는지 확인한다.
    await mockPlanBackend(page)
    await page.goto(`${BASE}/weekly`, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)

    const liveRegion = page.locator('span.sr-only[aria-live="polite"]', { hasText: '시간 간격' })
    // sr-only는 clip으로 시각적으로만 숨긴다 — DOM엔 실재하고 Playwright 기준으로도
    // "visible"(크기 0이 아님, display:none 아님)이다. 여기선 존재·attach 여부만 확인한다.
    await expect(liveRegion).toBeAttached()
    await expect(liveRegion).toContainText('100%') // 기본은 화면에 들어차는 축척 = 100%.

    const beforeText = await liveRegion.textContent()
    // 100%에서는 −가 잠겨 있으므로(스크롤 없음) +로 축척을 바꾼다.
    await page.getByRole('button', { name: /시간 간격 넓게/ }).click()
    await page.waitForTimeout(150)
    const afterText = await liveRegion.textContent()

    expect(afterText).not.toBe(beforeText) // 값이 실제로 갱신됨(리전이 죽어 있지 않음).
    expect(afterText).not.toContain('100%') // 수동 단계로 빠졌으니 더는 100%가 아니다.
  })

  /*
    TC-11 [오너 보고, 2026-08-31] — "맞춤 누르면 스크롤 왜 생기지".

    지금까지의 모든 케이스는 **달력 컨테이너 안쪽** 스크롤(scrollHeight vs
    clientHeight)만 쟀다. 그런데 사용자가 보는 스크롤바는 그것만이 아니다 —
    달력이 뷰포트 바닥까지 꽉 차면 그 아래 남은 페이지 여백이 문서를 밀어내
    **페이지(문서) 스크롤바**가 생긴다. 컨테이너는 안 넘치는데 창은 스크롤되는,
    지금까지 아무도 안 본 사각지대다.

    산수: `gridMaxHeight = innerHeight - gridTop - GRID_BOTTOM_GAP`인데, 격자
    아래에는 섹션의 `p-4`(아래 16px)와 `<main>`의 `md:pb-10`(40px)가 더 있다.
    GAP이 그보다 작으면 그 차이만큼 문서가 뷰포트를 넘는다.

    이 케이스는 **맞춤 상태**(기본값)에서 문서 자체가 세로로 안 넘치는지 잰다.
    2px 여유는 서브픽셀 반올림 몫이다.
  */
  test('TC-11: 맞춤 상태에서 페이지(문서) 세로 스크롤이 생기지 않는다', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await context.newPage()
    try {
      await mockPlanBackend(page)
      await page.goto(`${BASE}/weekly`, { waitUntil: 'networkidle' })
      await expect(page.getByRole('button', { name: /세로 축척/ })).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(200)

      const doc = await page.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
      }))
      expect(
        doc.scrollHeight,
        `문서가 뷰포트를 넘으면 페이지 스크롤바가 생긴다: scrollHeight(${doc.scrollHeight}) vs innerHeight(${doc.innerHeight})`,
      ).toBeLessThanOrEqual(doc.innerHeight + 2)
    } finally {
      await context.close()
    }
  })

  /*
    TC-11b/c [W6 델타 QA, 2026-09-01] — TC-11은 1280×900 한 뷰포트에서만 쟀다.
    이 짝은 그 결과가 얼마나 일반적인지, 그리고 `Math.max(240, …)` 바닥에
    걸리는 쪽에서는 무엇이 맞는 동작인지를 실측으로 정한다.

    실측(사전 탐침, 뷰포트 폭 1280 고정, 문서 scrollHeight vs innerHeight):
      900px → 900/900(스크롤 없음)   700px → 700/700   650px → 650/650
      600px → 600/600(컨테이너 내부에서만 18px 오버플로 시작)
      550px → 550/550(내부 오버플로 68px, 문서는 아직 안 넘음)
      520px 이하 → gridMaxHeight가 240px 바닥에 닿아 **고정**되고, 그 아래로는
        창을 아무리 줄여도(400~520px 전부 동일) 컨테이너 내부 콘텐츠가
        314px로 그대로다 — 문서 scrollHeight도 539로 고정. 즉 바닥에 닿는
        순간부터는 innerHeight만 줄어들고 문서 높이는 안 줄어드므로 문서
        스크롤이 나타난다. 코드 자신의 주석("그런 창에서는 스크롤이 생기는
        게 맞다")과 일치하는, **의도된** 동작임을 이 실측으로 확인했다.

      바닥이 걸리는 정확한 경계는 이 스펙의 다른 실측(dayHeaderPx, 조상
      패딩 합)에 따라 흔들릴 수 있으므로 여기서 하드코딩하지 않는다 — 대신
      "일반적으로 안전한 범위"(650)와 "확실히 바닥 아래"(500) 두 지점만
      고정해 재현 가능하게 잠근다.
  */
  test('TC-11b: 중간 정도로 짧은 창(650px)에서도 페이지 스크롤이 안 생긴다', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 650 } })
    const page = await context.newPage()
    try {
      await mockPlanBackend(page)
      await page.goto(`${BASE}/weekly`, { waitUntil: 'networkidle' })
      await expect(page.getByRole('button', { name: /세로 축척/ })).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(200)
      const doc = await page.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
      }))
      expect(
        doc.scrollHeight,
        `650px: scrollHeight(${doc.scrollHeight}) vs innerHeight(${doc.innerHeight})`,
      ).toBeLessThanOrEqual(doc.innerHeight + 2)
    } finally {
      await context.close()
    }
  })

  test('TC-11c: FIT_HOUR_PX_MIN/240px 바닥에 닿을 만큼 짧은 창(500px)에서는 페이지 스크롤이 남는 것이 설계대로다', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 500 } })
    const page = await context.newPage()
    try {
      await mockPlanBackend(page)
      await page.goto(`${BASE}/weekly`, { waitUntil: 'networkidle' })
      await expect(page.getByRole('button', { name: /세로 축척/ })).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(200)
      const doc = await page.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
      }))
      // TC-11/TC-11b와 반대 방향 단언 — 바닥에 닿으면 스크롤이 생기는 게 맞다.
      // 다만 값이 무한정 자라진 않는지(문서가 폭주하지 않는지)를 상한으로 확인한다.
      expect(doc.scrollHeight, '바닥에서는 문서가 뷰포트를 넘는 것이 정상').toBeGreaterThan(doc.innerHeight)
      expect(
        doc.scrollHeight - doc.innerHeight,
        '남는 스크롤이 폭주하지 않고 240px 바닥 근처(수십~백여 px)에 머문다',
      ).toBeLessThan(150)

      const dims = await scroller(page).evaluate((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }))
      // 격자 상자 자체는 240px 바닥에 닿아 있어야 한다(WeeklyPage의 Math.max(240,…)).
      expect(dims.clientHeight, '격자 상자가 240px 바닥에 닿아 있다').toBeLessThanOrEqual(242)
    } finally {
      await context.close()
    }
  })

  /*
    TC-04b [W6 델타 QA, 2026-09-01] — TC-04는 −→+ 한 번씩만 밟는다. 사다리
    양 끝(가장 좁게/가장 넓게)까지 걸어갔다 돌아와도 100%에 정확히 서는지,
    비활성화가 정확한 지점에서 걸리는지를 왕복 전체로 확인한다.

    실측(사전 탐침, 기본 1280×800 뷰포트, fitHourPx≈48px/h): 사다리는
    HOUR_PX_STEPS(30·40·50·65·80) ∪ {48} = 30·40·48·50·65·80 여섯 칸이었다.
    100%→83%→63%(비활성화, =30) 로 두 번만에 바닥, 다시 83%→100%(맞춤 재진입)→
    104%→135%→167%(비활성화, =80)로 꼭대기. 매 %가 `round(px/48*100)`과 정확히
    일치했다 — 사다리 계산 자체는 결함 없음(발견 아님, 회귀 가드로 편입).

    isFit 확인은 `aria-pressed`가 아니라 aria-label 문구로 한다(TC-04 헤더의
    2026-09-01 재조정 사유와 동일 — QA 도중 실시간으로 들어온 코드 변경).
    +/− 사다리 걷기로 정확히 맞춤 칸(rung)에 서는 경우는 `useHourScale.goTo`가
    `px === fitHourPx`를 직접 비교해 모드를 'fit'으로 세우므로(우연한 텍스트
    일치가 아니라 실제로 그 칸을 밟은 것), 이 왕복에서 pctText가 '100%'일
    때는 언제나 isFit=true여야 한다 — 그 반대(표시는 100%인데 모드는 수동)는
    TC-04b가 겨냥하는 경로가 아니라, 창 리사이즈로만 만들어지는 별개의
    경우(파일 헤더 "100%와 화면 추종은 같은 말이 아니다" 참고, TC-12가 그
    갈래를 다룬다).
  */
  test('TC-04b: 사다리 양 끝까지 왕복해도 100%에 정확히 다시 서고, 양쪽 비활성화가 정확한 지점에서 걸린다', async ({
    page,
  }) => {
    await mockPlanBackend(page)
    await page.goto(`${BASE}/weekly`, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)

    const scaleBtn = page.getByRole('button', { name: /세로 축척/ })
    const minus = page.getByRole('button', { name: /시간 간격 좁게/ })
    const plus = page.getByRole('button', { name: /시간 간격 넓게/ })

    await expect(scaleBtn).toHaveText('100%')
    await expect(scaleBtn).toHaveAttribute('aria-label', /한 화면에 들어차는 크기$/)

    /*
      사다리 왕복은 **24시간 모드에서** 잰다. 집중 100%에서는 스크롤이 없어 −가
      잠기므로(그게 의도다 — TC-19) 아래쪽 끝이라는 것이 존재하지 않는다.
      24시간 모드는 같은 축척에서도 하루가 다 안 들어가 계속 넘치므로, 양쪽 끝이
      모두 살아 있어 사다리 자체를 검증할 수 있다.
    */
    await page.getByRole('button', { name: '24h', exact: true }).click()
    await page.waitForTimeout(250)
    await expect(scaleBtn).toHaveText('100%')

    // 바닥까지 걷는다 — 매 걸음 % 가 단조 감소해야 하고, 20걸음 안에 반드시
    // 비활성화(무한 루프 방지 상한)에 닿아야 한다.
    let prevPct = 100
    let reachedMin = false
    for (let i = 0; i < 20; i += 1) {
      if (await minus.isDisabled()) {
        reachedMin = true
        break
      }
      await minus.click()
      await page.waitForTimeout(60)
      const pct = Number((await scaleBtn.textContent()).replace('%', ''))
      expect(pct, `− 누를 때마다 %가 단조 감소해야 한다(${prevPct} → ${pct})`).toBeLessThan(prevPct)
      prevPct = pct
    }
    expect(reachedMin, '20걸음 안에 좁은 쪽 끝에서 비활성화돼야 한다').toBe(true)
    await expect(scaleBtn).not.toHaveText('100%')
    await expect(plus).not.toBeDisabled() // 반대쪽은 여전히 눌려야 한다.

    // 꼭대기까지 걷는다 — % 가 단조 증가해야 하고, 중간에 정확히 100%를
    // 한 번은 지나야 한다(맞춤 값이 사다리의 한 칸이므로).
    let sawFitAgain = false
    let reachedMax = false
    for (let i = 0; i < 20; i += 1) {
      if (await plus.isDisabled()) {
        reachedMax = true
        break
      }
      await plus.click()
      await page.waitForTimeout(60)
      const pctText = await scaleBtn.textContent()
      const pct = Number(pctText.replace('%', ''))
      expect(pct, `+ 누를 때마다 %가 단조 증가해야 한다(${prevPct} → ${pct})`).toBeGreaterThan(prevPct)
      prevPct = pct
      if (pctText === '100%') {
        sawFitAgain = true
        await expect(scaleBtn).toHaveAttribute('aria-label', /한 화면에 들어차는 크기$/)
      }
    }
    expect(reachedMax, '20걸음 안에 넓은 쪽 끝에서 비활성화돼야 한다').toBe(true)
    expect(sawFitAgain, '왕복 중 정확히 100%(모드도 isFit)를 다시 지나야 한다').toBe(true)
    await expect(minus).not.toBeDisabled() // 반대쪽은 여전히 눌려야 한다.

    // 넓은 끝에서 창을 안 넘긴다는 것도 같이 확인 — TC-01b와 반대 방향(맞춤이
    // 아니라 수동 최대이므로 스크롤이 남는 것 자체는 정상, 여기서는 크래시나
    // 무한정 값이 없는지만 본다).
    const dims = await scroller(page).evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }))
    expect(Number.isFinite(dims.scrollHeight) && dims.scrollHeight > 0, '값이 유한하고 정상 범위').toBe(true)
  })

  /*
    TC-12 [W6 델타 QA, 2026-09-01] — 수동 단계에 머문 채 창 높이를 바꾸면
    기준(fitHourPx)이 바뀌어 %만 갱신되고 실제 축척(hourPx)은 그대로여야
    한다(HourScaleControl 헤더 주석: "그때는 보이는 결과가 그대로라 무해").

    실측(사전 탐침): 900px에서 최대 수동 단계(80px/h, 136%)로 고정한 뒤
    500px로 줄이면 %만 286%로 바뀌고 컨테이너는 782/240(내부 스크롤, 바닥
    240px)로 안전하게 수렴했다. 다시 900px로 되돌리면 %가 136%로, 컨테이너가
    782/596으로 **완전히 복구**됐다 — 잔여 손상 없음을 확인했다.
  */
  test('TC-12: 수동 단계에서 창을 줄였다 늘려도 %만 따라가고 축척은 그대로, 원복 후 잔여 손상 없음', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await mockPlanBackend(page)
    await page.goto(`${BASE}/weekly`, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)

    const scaleBtn = page.getByRole('button', { name: /세로 축척/ })
    const plus = page.getByRole('button', { name: /시간 간격 넓게/ })
    for (let i = 0; i < 6; i += 1) {
      if (await plus.isDisabled()) break
      await plus.click()
      await page.waitForTimeout(60)
    }
    await expect(plus).toBeDisabled() // 이제 수동 최대 단계(80px/h)에 있다.
    const pctBefore = await scaleBtn.textContent()
    const dimsBefore = await scroller(page).evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }))

    await page.setViewportSize({ width: 1280, height: 500 })
    await page.waitForTimeout(300)
    const pctAfterShrink = await scaleBtn.textContent()
    expect(pctAfterShrink, '기준이 줄었으니 %는 커져야 한다').not.toBe(pctBefore)
    const dimsShrunk = await scroller(page).evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }))
    // 축척(hourPx) 자체는 안 바뀌므로 콘텐츠 실제 높이(scrollHeight)는 그대로여야 한다.
    expect(dimsShrunk.scrollHeight, '수동 단계는 창 크기로 콘텐츠 높이를 안 바꾼다').toBe(dimsBefore.scrollHeight)

    await page.setViewportSize({ width: 1280, height: 900 })
    await page.waitForTimeout(300)
    const pctAfterRegrow = await scaleBtn.textContent()
    expect(pctAfterRegrow, '원래 창으로 돌아오면 %도 원래 값으로 돌아와야 한다').toBe(pctBefore)
    const dimsRegrown = await scroller(page).evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }))
    expect(dimsRegrown, '원래 창으로 돌아오면 컨테이너 치수도 완전히 복구돼야 한다(잔여 손상 없음)').toEqual(
      dimsBefore,
    )
  })

  /*
    TC-13 [W6 델타 QA, 2026-09-01, BLOCKER 후보 — 모바일 최초 실측] — 리드
    보고: "지금까지 모바일은 한 번도 실측 안 했다." 처음 재 본 결과, 요약 줄
    가운데 정렬 시간 텍스트("n시간 / 45시간")와 오른쪽에 절대 위치로 앉는
    세로 축척 컨트롤(`div[role=group][aria-label="시간 간격"]`, 너비 128px:
    32+32+56px 버튼 셋 + gap)이 겹친다.

    실측(SummaryBar.jsx: 가운데 텍스트는 `relative flex justify-center` 안의
    일반 흐름 요소, 컨트롤은 `absolute right-0` — 가운데 정렬이 오른쪽 절대
    요소의 폭을 고려하지 않는다):
      너비 320px → 겹침 55.6px   360px → 75.6px   375px → 79.7px(텍스트
      전체 폭과 같음 = 텍스트가 통째로 컨트롤 뒤/아래 깔림)   390~414px →
      79.7px(그대로)   480px → 72.1px   600px → 12.1px   768px(데스크톱
      경계) → 0px(안 겹침).
    스크린샷(375×812, 375×667)에서도 "0%" 버튼 글자와 "45시간" 글자가
    한 자리에 겹쳐 보이는 것을 육안으로도 확인했다.

    이 구조(중앙 정렬 vs 절대 우측 배치가 서로의 폭을 모른다)는 이번 4개
    커밋이 만든 게 아니라 SummaryBar.jsx 자체의 레이아웃이지만, **모바일은
    이번이 첫 실측**이라 W6 델타 리뷰에서 처음 드러난 것으로 보고한다.
    "맞춤" 낱말 제거로 버튼 텍스트가 짧아진 것은 겹침을 줄이는 방향(전에는
    더 넓었을 것)이었을 가능성이 높지만, 완전히 없애지는 못했다 — src를
    못 고치므로 정확한 이전 폭은 비교하지 않았다.

    수정됨(2026-09-01) — SummaryBar가 md 미만에서는 absolute를 걷고 진짜 흐름으로
    배치한다(justify-between + flex-wrap). 그래서 이 테스트는 `test.fail()` 잠금을
    걷어내고 **회귀 가드**가 됐다.

    이 케이스를 확정하는 데 테스트 쪽 결함이 둘 나왔고 함께 고쳤다:
    ① 셀렉터가 `p.text-body.text-center`라 클래스에 묶여 있었다 — 정렬을 md 이상으로
       미루는 바로 그 수정이 들어오자 요소를 못 찾고 타임아웃났다. 고치려는 대상을
       건드리면 깨지는 셀렉터는 그 대상을 지킬 수 없다. 내용 기반으로 바꿨다.
    ② 겹침을 X축만으로 쟀다 — 컨트롤이 아랫줄로 내려가 안 겹치는 상태에서도 둘 다
       왼쪽 끝에서 시작하니 X는 겹쳐 보여 "여전히 결함"으로 오판했다. 사각형 교차
       면적으로 바꿨다.
  */
  test(
    'TC-13 [BLOCKER 후보]: 모바일 폭(375px)에서 요약 시간 텍스트와 세로 축척 컨트롤이 겹치지 않아야 한다',
    async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
      const page = await context.newPage()
      try {
        await mockPlanBackend(page)
        await page.goto(`${BASE}/weekly`, { waitUntil: 'networkidle' })
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(200)

        // 클래스가 아니라 **내용**으로 잡는다. 예전엔 `p.text-body.text-center`를
        // 썼는데, 모바일에서 가운데 정렬을 md 이상으로 미루는 수정이 들어오자
        // 그 클래스가 사라져 요소를 영영 못 찾고 타임아웃났다 — 레이아웃을 고치는
        // 순간 깨지는 셀렉터는 이 케이스가 지켜야 할 대상 자체를 놓친다.
        const timeText = page.locator('p').filter({ hasText: /\/\s*\d+시간/ }).first()
        const scaleGroup = page.locator('div[role="group"][aria-label="시간 간격"]')
        const tb = await timeText.boundingBox()
        const sb = await scaleGroup.boundingBox()
        /*
          겹침은 **두 축이 동시에** 겹칠 때만 겹침이다. 처음엔 X축만 쟀는데, 좁은
          폭에서 컨트롤이 아랫줄로 내려간(= 안 겹치는) 상태에서도 둘 다 컨테이너
          왼쪽 끝에서 시작하니 X는 그대로 겹쳐 보여 오판했다. 사각형 교차 면적으로
          판정한다.
        */
        const overlapX = Math.max(0, Math.min(tb.x + tb.width, sb.x + sb.width) - Math.max(tb.x, sb.x))
        const overlapY = Math.max(0, Math.min(tb.y + tb.height, sb.y + sb.height) - Math.max(tb.y, sb.y))
        expect(
          Math.round(overlapX * overlapY),
          `요약 시간 텍스트(x:${tb.x}~${tb.x + tb.width}, y:${tb.y}~${tb.y + tb.height})와 ` +
            `축척 컨트롤(x:${sb.x}~${sb.x + sb.width}, y:${sb.y}~${sb.y + sb.height})이 겹치면 안 된다 ` +
            `— 겹침 ${Math.round(overlapX)}×${Math.round(overlapY)}px`,
        ).toBe(0)
      } finally {
        await context.close()
      }
    },
  )

  /*
    TC-14 [2026-09-01 요구: "집중/24시 전환했을 때 100% 크기가 동일했으면 좋겠어"] —
    모드를 오가도 **블록 크기(시간당 픽셀)가 그대로**여야 한다.

    그 전에는 기준 축척을 "지금 그리는 범위"로 잡아서, 24시간 모드로 넘어가면
    나누는 시간 수가 9에서 24로 뛰며 같은 100%가 절반 이하로 쪼그라들었다. 이제
    기준 창을 집중 모드의 창으로 고정했으므로, 달라지는 것은 "몇 시간을 펼쳐
    보이느냐"뿐이다.

    재는 법: 한 시간 눈금선 사이의 실제 거리. 눈금선은 `h*60*pxPerMin`으로 놓이니
    이웃한 두 줄의 간격이 곧 시간당 픽셀이다. 블록을 심지 않아도 되고 축척을
    직접 읽지 않아도 되는, 화면에서 곧바로 확인 가능한 값이다.
  */
  test('TC-14: 집중 ↔ 24시간 모드를 오가도 100%의 시간당 픽셀이 같다', async ({ page }) => {
    await mockPlanBackend(page)
    await page.goto(`${BASE}/weekly`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('button', { name: /세로 축척/ })).toHaveText('100%')
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(200)

    // 이웃한 두 시간 눈금선의 세로 간격 = 시간당 픽셀.
    const hourPitch = async () =>
      page.evaluate(() => {
        const lines = [...document.querySelectorAll('div.pointer-events-none.absolute.inset-x-0')]
          .map((el) => el.getBoundingClientRect().top)
          .sort((a, b) => a - b)
        return lines.length >= 2 ? Math.round((lines[1] - lines[0]) * 100) / 100 : null
      })

    const focusPitch = await hourPitch()
    expect(focusPitch, '집중 모드에서 시간 눈금 간격을 재지 못했다').toBeGreaterThan(0)

    await page.getByRole('button', { name: '24h', exact: true }).click()
    await page.waitForTimeout(250)
    const dayPitch = await hourPitch()

    expect(
      dayPitch,
      `모드를 바꿔도 시간당 픽셀이 같아야 한다: 집중 ${focusPitch}px vs 24시간 ${dayPitch}px`,
    ).toBe(focusPitch)

    // 축척 표시도 100% 그대로여야 한다 — 기준이 모드와 무관하기 때문이다.
    await expect(page.getByRole('button', { name: /세로 축척/ })).toHaveText('100%')

    /*
      100%에서만이 아니라 **확대한 상태에서도** 모드 간 크기가 같아야 한다
      (2026-09-01 요구를 그렇게 읽었다: "집중 100%일 때랑 100 이상일 때 크기가
      같았으면"). 축척 상태가 모드와 무관한 값 하나이므로 원리상 성립하지만,
      원리는 테스트가 아니다 — 실제로 잰다.
    */
    await page.getByRole('button', { name: /시간 간격 넓게/ }).click()
    await page.waitForTimeout(250)
    const zoomedDayPitch = await hourPitch()
    const zoomedPercent = await page.getByRole('button', { name: /세로 축척/ }).textContent()
    expect(zoomedDayPitch, '확대 후 24시간 모드에서 눈금 간격을 재지 못했다').toBeGreaterThan(0)

    await page.getByRole('button', { name: '집중', exact: true }).click()
    await page.waitForTimeout(250)
    const zoomedFocusPitch = await hourPitch()

    expect(
      zoomedFocusPitch,
      `확대(${zoomedPercent}) 상태에서도 모드 간 시간당 픽셀이 같아야 한다: ` +
        `24시간 ${zoomedDayPitch}px vs 집중 ${zoomedFocusPitch}px`,
    ).toBe(zoomedDayPitch)
    await expect(page.getByRole('button', { name: /세로 축척/ })).toHaveText(zoomedPercent)
  })

  /*
    TC-15 [2026-09-01 요구: "100%랑 114%일 때랑 크기가 조금씩 변하는디"] —
    축척을 바꿔도 **달력 상자 자체의 높이**는 그대로여야 한다.

    원인은 상자가 max-height였다는 것이다. 내용이 상자보다 짧으면 컨테이너가
    내용 높이로 줄어드는데, 100%(맞춤)에서는 fitHourPx가 정수로 내림되므로 내용이
    상자보다 최대 (시간 수 − 1)px 짧다. 한 칸 확대하면 내용이 상자를 넘겨 상자가
    최대치가 되고, 그 몇 px 차이가 눈에 띄었다.
  */
  test('TC-15: 축척(100% ↔ 확대/축소)을 바꿔도 달력 상자 높이가 변하지 않는다', async ({ page }) => {
    await mockPlanBackend(page)
    await page.goto(`${BASE}/weekly`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('button', { name: /세로 축척/ })).toHaveText('100%')
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(200)

    const boxHeight = async () => (await scroller(page).boundingBox()).height
    const atFit = await boxHeight()
    expect(atFit, '달력 상자 높이를 재지 못했다').toBeGreaterThan(0)

    for (const label of [/시간 간격 넓게/, /시간 간격 넓게/, /시간 간격 좁게/, /시간 간격 좁게/, /시간 간격 좁게/]) {
      const btn = page.getByRole('button', { name: label })
      if (await btn.isDisabled()) continue
      await btn.click()
      await page.waitForTimeout(200)
      const percent = await page.getByRole('button', { name: /세로 축척/ }).textContent()
      expect(await boxHeight(), `축척 ${percent}에서 상자 높이가 달라졌다`).toBe(atFit)
    }
  })

  /*
    TC-16 [2026-09-01 요구: "집중→24시로 변환할 때 지금 보고 있는 화면에
    맞춰졌으면 좋겠어"] — 모드를 바꿔도 화면 맨 위에 있던 **시각**이 유지돼야 한다.

    예전에는 24시간으로 가면 무조건 8시로 감았다. 그래서 오후를 보다 토글하면
    아침으로 튕겼다. 여기서는 24시간 모드에서 한참 아래(오후)로 스크롤한 뒤
    집중 → 24시간을 오가며 맨 윗 시각이 보존되는지 잰다.
  */
  test('TC-16: 모드를 바꿔도 화면 맨 위의 시각이 유지된다', async ({ page }) => {
    await mockPlanBackend(page)
    await page.goto(`${BASE}/weekly`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('button', { name: /세로 축척/ })).toHaveText('100%')
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(200)

    // 집중 모드에서 아래로 스크롤할 여지를 만들기 위해 한 칸 확대한다.
    await page.getByRole('button', { name: /시간 간격 넓게/ }).click()
    await page.waitForTimeout(200)

    const el = scroller(page)
    await el.evaluate((node) => {
      node.scrollTop = Math.round((node.scrollHeight - node.clientHeight) / 2)
    })
    await page.waitForTimeout(150)
    const before = await el.evaluate((node) => node.scrollTop)
    expect(before, '스크롤할 여지가 없어 이 케이스가 의미를 잃었다').toBeGreaterThan(0)

    // 집중 → 24시간: 범위 시작이 앞당겨지므로 같은 시각을 유지하려면 스크롤이
    // 그만큼 더 내려가 있어야 한다.
    await page.getByRole('button', { name: '24h', exact: true }).click()
    await page.waitForTimeout(300)
    const after = await el.evaluate((node) => node.scrollTop)

    expect(
      after,
      `24시간으로 바꿨을 때 맨 윗 시각이 유지돼야 한다(집중 scrollTop ${before} → 24시간 ${after}). ` +
        `예전처럼 8시로 되감으면 이 값이 훨씬 작아진다.`,
    ).toBeGreaterThan(before)
  })

  /*
    TC-17 [2026-09-01 요구: "블럭 클릭했을 때 그 블럭으로 포커싱되는 기능"] —
    블록을 누르면 **하이라이트 링이 실제로 뜬다**.

    TC-06은 스크롤만 확인한다. 링이 뜨는지는 별개이고(오너 질문: "블록 포커싱
    되는 거 맞아?"), 링은 focusRequest가 그 블록을 가리키는 동안만 렌더되므로
    존재 여부로 곧장 잴 수 있다. 링을 내리는 것까지 확인한다 — 하이라이트는
    선택 상태가 아니라 한 번의 대답이라, 남아 있으면 그것대로 결함이다.
  */
  test('TC-17: 블록을 누르면 하이라이트 링이 떴다가 사라진다', async ({ page }) => {
    await mockPlanBackend(page, {
      blocks: [
        {
          planBlockId: 101,
          blockType: 'TASK',
          title: 'E2E 포커스 링 테스트',
          status: 'PLANNED',
          startAt: (weekStartDate) => `${weekStartDate}T10:00:00`,
          endAt: (weekStartDate) => `${weekStartDate}T11:00:00`,
        },
      ],
    })
    await page.goto(`${BASE}/weekly`, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(200)

    const block = page.getByRole('button', { name: /E2E 포커스 링 테스트/ })
    const ring = block.locator('span.ring-2.ring-focus-ring')

    await expect(ring, '누르기 전에는 링이 없어야 한다').toHaveCount(0)

    await block.click()
    await expect(ring, '누르면 그 블록에 링이 떠야 한다').toHaveCount(1)
    // 눌린 블록이 키보드 포커스도 받는다 — 검토 패널 경로와 같은 처리다.
    await expect(block).toBeFocused()

    // FOCUS_HIGHLIGHT_MS(900ms) 뒤에는 스스로 내려간다.
    await expect(ring, '하이라이트는 잠시 뒤 스스로 사라져야 한다').toHaveCount(0, {
      timeout: 3000,
    })
  })

  /*
    TC-18 [오너 보고 2026-09-01: "검토에서 대상항목 눌러도 포커싱이 안 되네 —
    이 항목의 대상 블록을 찾을 수 없다고 떠"] — **요일 수준 규칙**도 그 요일의
    문제 블록으로 포커싱돼야 한다.

    계약(openapi ValidationIssue)상 `planBlockId`는 nullable이고, 가용 시간 밖
    배치(V4)·초과(V3)는 weekday만 낸다. 그래서 예전에는 그 항목이 언제나 막다른
    길이었다. 여기서는 **계약 그대로**(planBlockId 없음, params 없음, weekday만)
    응답을 만들어, 클라이언트가 그 요일에서 가용 창을 벗어난 TASK를 찾아
    가리키는지 확인한다.
  */
  test('TC-18: 요일 수준 검토 항목(V4)을 누르면 그 요일의 문제 블록이 포커싱된다', async ({
    page,
  }) => {
    await mockPlanBackend(page, {
      // 월요일 20:00-21:00 — 가용(09-18) 밖 TASK.
      blocks: [
        {
          planBlockId: 101,
          blockType: 'TASK',
          title: 'E2E 가용시간 밖 블록',
          status: 'PLANNED',
          startAt: (weekStartDate) => `${weekStartDate}T20:00:00`,
          endAt: (weekStartDate) => `${weekStartDate}T21:00:00`,
        },
      ],
      issues: [
        {
          validationIssueId: null,
          ruleId: 'V4_OUT_OF_AVAILABILITY',
          severity: 'WARNING',
          planBlockId: null, // ← 계약대로 블록을 안 준다
          counterpartId: null,
          taskId: null,
          weekday: 'MONDAY',
          reason: '규칙 V4_OUT_OF_AVAILABILITY에 의해 판정되었습니다',
          resolutionStatus: 'OPEN',
        },
      ],
    })
    await page.goto(`${BASE}/weekly`, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    // 검증은 디바운스 뒤 실행된다 — 배지가 뜰 때까지 기다린다.
    const reviewBtn = page.getByRole('button', { name: /검토 열기/ })
    await expect(reviewBtn).toBeVisible({ timeout: 10000 })
    await reviewBtn.click()

    /*
      검토 항목만 잡는다. 그냥 /가용 시간/ 으로 찾으면 축척 버튼의 접근성 이름
      ("세로 축척 100% — 가용 시간대가 …")까지 걸려 엉뚱한 것을 누른다 — 실제로
      한 번 그렇게 걸렸다. 패널의 리스트 항목(<li> 안의 버튼)으로 한정한다.
    */
    const row = page.locator('li > button').filter({ hasText: /가용 시간/ }).first()
    await expect(row, '검토 패널에 V4 항목이 있어야 한다').toBeVisible({ timeout: 10000 })
    await row.click()

    // 대상 블록이 포커스 링을 받아야 한다 — "찾을 수 없습니다" 토스트가 아니라.
    const block = page.getByRole('button', { name: /E2E 가용시간 밖 블록/ })
    await expect(block.locator('span.ring-2.ring-focus-ring'), '그 요일의 문제 블록이 포커싱돼야 한다').toHaveCount(1)
    await expect(page.getByText('이 항목의 대상 블록을 찾을 수 없습니다')).toHaveCount(0)
  })

  /*
    TC-19 [2026-09-01 요구: "달력 스크롤 없을 때는(예: 집중모드 100%일 때)
    100%보다 작아질 필요는 없을 것 같기도 해"] — 넘치지 않으면 − 가 잠긴다.

    상자 높이가 고정이므로(TC-15) 이미 다 보이는 상태에서 더 줄이면 블록만
    작아지고 아래 빈 공간이 늘 뿐이다. 반대로 넘치는 상태에서는 줄이는 것이
    실제로 더 보이게 하므로 열려 있어야 한다 — 24시간 모드가 그 경우다.
  */
  test('TC-19: 스크롤이 없으면 − 가 잠기고, 넘치면 다시 열린다', async ({ page }) => {
    await mockPlanBackend(page)
    await page.goto(`${BASE}/weekly`, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(200)

    const scaleBtn = page.getByRole('button', { name: /세로 축척/ })
    const minus = page.getByRole('button', { name: /시간 간격 좁게/ })

    // 집중 100% — 스크롤 없음(TC-01) → 잠김.
    await expect(scaleBtn).toHaveText('100%')
    await expect(minus, '집중 100%에서는 더 줄일 이유가 없다').toBeDisabled()

    // 한 칸 확대하면 넘치므로 다시 열린다(되돌아올 길이 막히면 안 된다).
    await page.getByRole('button', { name: /시간 간격 넓게/ }).click()
    await page.waitForTimeout(200)
    await expect(minus, '확대해 넘치면 줄이는 것이 의미를 갖는다').not.toBeDisabled()

    // 24시간 모드는 같은 100%에서도 넘치므로 열려 있어야 한다.
    await scaleBtn.click() // 100%로 복귀
    await page.waitForTimeout(200)
    await page.getByRole('button', { name: '24h', exact: true }).click()
    await page.waitForTimeout(250)
    await expect(scaleBtn).toHaveText('100%')
    await expect(minus, '24시간 모드는 100%에서도 넘치므로 줄일 수 있어야 한다').not.toBeDisabled()
  })

  /*
    TC-20 [오너 보고 2026-09-01: "24h에서 블록 누르면 블록의 반밖에 안 보이게
    움직여 … 거의 차이가 안 나"] — 누른 뒤에는 블록이 **sticky 요일 헤더에
    가리지 않고 온전히** 보여야 한다.

    예전 `block:'nearest'`가 부족했던 이유: 헤더가 `sticky top-0`라 스크롤
    컨테이너 맨 위를 덮는데 브라우저는 그 가림을 모른다. 그래서 블록을 컨테이너
    꼭대기에 붙여 놓고 "보이게 했다"고 끝내면, 실제로는 헤더 뒤에 반쯤 들어간다.

    여기서는 그 상황을 그대로 만든다 — 24시간 모드에서 블록이 헤더에 반쯤 걸리도록
    스크롤한 뒤 눌러, 헤더 아래로 완전히 내려오는지 잰다.
  */
  test('TC-20: 24시간 모드에서 헤더에 반쯤 가린 블록을 누르면 온전히 드러난다', async ({ page }) => {
    await mockPlanBackend(page, {
      blocks: [
        {
          planBlockId: 101,
          blockType: 'TASK',
          title: 'E2E 헤더 가림 블록',
          status: 'PLANNED',
          startAt: (weekStartDate) => `${weekStartDate}T14:00:00`,
          endAt: (weekStartDate) => `${weekStartDate}T15:00:00`,
        },
      ],
    })
    await page.goto(`${BASE}/weekly`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: '24h', exact: true }).click()
    await page.waitForTimeout(300)
    await page.evaluate(() => document.fonts.ready)

    const sc = page.locator('[data-plan-scroller]')
    const header = sc.locator('> div.sticky').first()
    const block = page.getByRole('button', { name: /E2E 헤더 가림 블록/ })

    const headerBox = await header.boundingBox()

    // 먼저 블록을 화면 안으로 들인 다음(한 번에 계산하면 컨테이너 밖으로 밀려
    // boundingBox가 null이 된다), 위쪽 절반이 헤더 뒤로 들어가도록 조금만 민다.
    await block.scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)
    const b0 = await block.boundingBox()
    const v0 = await sc.boundingBox()
    expect(b0, '전제 확인: 블록이 화면 안에 들어와야 한다').not.toBeNull()
    await sc.evaluate(
      (node, dy) => {
        node.scrollTop += dy
      },
      b0.y - (v0.y + headerBox.height - b0.height / 2),
    )
    await page.waitForTimeout(200)

    const beforeBox = await block.boundingBox()
    const viewBefore = await sc.boundingBox()
    expect(beforeBox, '전제 확인: 블록이 여전히 화면 안에 있어야 한다').not.toBeNull()
    expect(
      beforeBox.y,
      '전제 확인: 누르기 전엔 블록 윗부분이 헤더에 가려 있어야 한다',
    ).toBeLessThan(viewBefore.y + headerBox.height)

    /*
      `.click()`을 쓰면 안 된다 — Playwright는 클릭 전에 **스스로 요소를 화면
      안으로 스크롤**한다. 그러면 우리 코드가 아무 일도 안 해도 블록이 드러나
      이 케이스가 항상 통과한다(음성 대조로 확인: 옛 'nearest' 구현에서도 통과했다).
      제품 코드의 스크롤만 재려면 스크롤 없이 이벤트만 쏘아야 한다.
    */
    await block.dispatchEvent('click')
    await page.waitForTimeout(600) // smooth 스크롤이 멎을 시간

    const afterBox = await block.boundingBox()
    const viewAfter = await sc.boundingBox()
    expect(
      afterBox.y,
      `누른 뒤에는 헤더(높이 ${Math.round(headerBox.height)}px) 아래로 내려와야 한다 ` +
        `(블록 top ${Math.round(afterBox.y)}, 가려지는 경계 ${Math.round(viewAfter.y + headerBox.height)})`,
    ).toBeGreaterThanOrEqual(viewAfter.y + headerBox.height)
    expect(
      afterBox.y + afterBox.height,
      '아래쪽도 잘리면 안 된다',
    ).toBeLessThanOrEqual(viewAfter.y + viewAfter.height + 1)
  })

  /*
    TC-21 [오너 보고 2026-09-01: "블록을 위아래로 움직일 때마다 블록 크기가
    바뀌는 건지 세로 칸 자체가 변하는 건지 … 뭐가 계속 바뀐다"] — **블록 위치가
    축척을 바꾸면 안 된다.**

    원인이었던 것: `visibleRange`는 가용 시간과 이 주에 그려지는 것들의
    **합집합**으로 창을 정한다(가용 창 밖 블록이 잘리지 않게). 그 창을 100% 기준
    으로도 쓰면, 블록 하나를 가용 시간 밖으로 옮기는 순간 창이 넓어지며 격자
    전체가 작아진다 — 옮기던 블록만이 아니라 화면이 통째로 출렁인다.

    재는 법: 가용 시간(09-18)만 있는 화면과, 거기에 가용 밖 블록(22-23시)이 있는
    화면의 **시간당 픽셀**이 같아야 한다. 다르면 블록 위치가 축척을 흔든 것이다.
  */
  test('TC-21: 가용 시간 밖 블록이 있어도 시간당 픽셀(100% 기준)이 달라지지 않는다', async ({
    browser,
  }) => {
    const pitchOf = async (blocks) => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
      const page = await context.newPage()
      try {
        await mockPlanBackend(page, { blocks })
        await page.goto(`${BASE}/weekly`, { waitUntil: 'networkidle' })
        await expect(page.getByRole('button', { name: /세로 축척/ })).toHaveText('100%')
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(200)
        return await page.evaluate(() => {
          const lines = [...document.querySelectorAll('div.pointer-events-none.absolute.inset-x-0')]
            .map((el) => el.getBoundingClientRect().top)
            .sort((a, b) => a - b)
          return lines.length >= 2 ? Math.round((lines[1] - lines[0]) * 100) / 100 : null
        })
      } finally {
        await context.close()
      }
    }

    const clean = await pitchOf([])
    expect(clean, '기준 화면에서 눈금 간격을 재지 못했다').toBeGreaterThan(0)

    const withOutsideBlock = await pitchOf([
      {
        planBlockId: 101,
        blockType: 'TASK',
        title: 'E2E 가용 밖 블록',
        status: 'PLANNED',
        startAt: (weekStartDate) => `${weekStartDate}T22:00:00`,
        endAt: (weekStartDate) => `${weekStartDate}T23:00:00`,
      },
    ])

    expect(
      withOutsideBlock,
      `블록 위치가 축척을 바꾸면 안 된다: 블록 없음 ${clean}px vs 가용 밖 블록 있음 ${withOutsideBlock}px`,
    ).toBe(clean)
  })

  /*
    TC-22 [오너 보고 2026-09-01: "블럭 우클릭해서 다음 주로 이동 눌렀더니
    없어졌어"] — 주를 넘겨 옮기면 **어디로 갔는지 알려 주고 따라갈 길을 준다.**

    동작 자체는 원래 맞았다 — 블록은 그 주로 갔고 이번 주에서 사라지는 게 정상이다.
    문제는 그 사실을 알 길이 없었다는 것: 블록 하나가 소리 없이 없어지고, 어디로
    갔는지도 되돌릴 방법도 화면에 안 떴다. 메뉴로 옮기면 드래그와 달리 "내가
    저쪽으로 보냈다"는 감각조차 없어서 더 그렇다.
  */
  test('TC-22: 다음 주로 이동하면 안내가 뜨고 "보러 가기"로 따라갈 수 있다', async ({ browser }) => {
    /*
      뷰포트를 직접 고정한다 — 우클릭 메뉴는 데스크톱 상호작용이고, 375px 폭에서는
      격자가 `min-w-[640px]`라 가로로 잘려 블록이 화면 밖에 있다(모바일 프로젝트에서
      한 번 그렇게 걸렸다). 이 케이스가 재는 것은 폭과 무관한 "주 이동 안내"다.
    */
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await context.newPage()
    try {
    let patched = null
    await mockPlanBackend(page, {
      onPatch: (body) => {
        patched = body
      },
      blocks: [
        {
          planBlockId: 101,
          blockType: 'TASK',
          title: 'E2E 주 이동 블록',
          status: 'PLANNED',
          startAt: (weekStartDate) => `${weekStartDate}T10:00:00`,
          endAt: (weekStartDate) => `${weekStartDate}T11:00:00`,
        },
      ],
    })
    await page.goto(`${BASE}/weekly`, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)

    const block = page.getByRole('button', { name: /E2E 주 이동 블록/ })
    await expect(block).toBeVisible()

    await block.click({ button: 'right' })
    // 메뉴 컨테이너만 role="menu"이고 항목은 평범한 <button>이다(menuitem 아님).
    await page.locator('[role="menu"]').getByRole('button', { name: '다음 주로 이동' }).click()

    /*
      서버에 **주차 이동을 명시해서** 보내야 한다 — 계약의 `targetWeekStartDate`
      (PATCH /plan-blocks/{blockId} summary: "주차 이동은 targetWeekStartDate").
      예전에는 startAt/endAt만 보내서, 블록이 새 날짜를 갖되 옛 주간 계획에 매달린
      채로 남아 **양쪽 주 어디에서도 안 보였다**(오너 보고). 이 단언이 그 회귀를
      막는다.
    */
    expect(patched, 'PATCH가 나가야 한다').not.toBeNull()
    expect(
      patched.targetWeekStartDate,
      `주차 이동은 targetWeekStartDate로 알려야 한다(실제 본문: ${JSON.stringify(patched)})`,
    ).toBeTruthy()

    // 소리 없이 사라지지 않는다 — 어느 주로 갔는지 뜬다.
    await expect(page.getByText('다음 주로 옮겼습니다')).toBeVisible()

    // 그리고 따라갈 수 있다.
    const follow = page.getByRole('button', { name: '보러 가기' })
    await expect(follow).toBeVisible()
    await follow.click()
    await page.waitForTimeout(400)
    await expect(page.getByText('다음 주로 옮겼습니다')).toHaveCount(0)
    } finally {
      await context.close()
    }
  })
})
