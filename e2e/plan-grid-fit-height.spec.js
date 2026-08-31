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
async function mockPlanBackend(page, { blocks = [], availability = WEEKDAY_AVAILABILITY, onPatch } = {}) {
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

  test('TC-01b: 가용 밖 블록이 창을 크게 넓히면 FIT_HOUR_PX_MIN(28) 바닥에서 부분 스크롤이 남는다 (설계대로)', async ({
    page,
  }) => {
    // visibleRange가 가용(09-18)과 실제로 그려지는 블록의 합집합으로 창을 넓힌다
    // (planGeometry.js:visibleRange). 22-23시 블록 하나로 창이 09-23(14h)까지 벌어지면,
    // 700px 높이에서는 14h * 28px(바닥) + 헤더가 가용 공간을 넘는다 — fitHourPx 주석이
    // "바닥에 닿으면 맞춤은 포기하고 스크롤로 넘긴다"고 명시한 바로 그 경로다.
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
    // 이 케이스는 "스크롤 없음"이 아니라 "바닥에서 최소한만 남는 스크롤"이 기대값이다 —
    // TC-01과 반대 방향의 단언. 차이가 28px/h 바닥 근처(수십 px)인지만 확인한다.
    expect(dims.scrollHeight).toBeGreaterThan(dims.clientHeight)
    expect(dims.scrollHeight - dims.clientHeight).toBeLessThan(60)
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

  test('TC-03: 24시간 모드 — 세로 스크롤은 정상, 가로는 오버플로 없음', async ({ page }) => {
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

  /*
    2026-08-31 (3차 요구: "맞춤이라는 단어를 빼", "100 = 맞춤 사이즈면 안 돼?")
    — 가운데 버튼은 이제 낱말 없이 **%만** 보여 주고, 그 %는 한 화면에 들어차는
    축척을 100%로 놓고 잰 값이다. 그래서 "누르면 100%로"와 "화면 크기로 복귀"가
    같은 동작이 됐다(예전에 필요했던 숨은 갈래가 사라졌다).
  */
  test('TC-04: 축척 버튼 — 기본이 100%, −로 100%를 벗어나고, 누르면 100%로 복귀', async ({
    page,
  }) => {
    await mockPlanBackend(page)
    await page.goto(`${BASE}/weekly`, { waitUntil: 'networkidle' })

    const scaleBtn = page.getByRole('button', { name: /세로 축척/ })

    // 기본은 화면에 들어차는 축척이고, 그 기준이 100%다. "맞춤"이라는 낱말은
    // 화면에 없어야 한다(오너 요구).
    await expect(scaleBtn).toHaveAttribute('aria-pressed', 'true')
    await expect(scaleBtn).toHaveText('100%')
    await expect(scaleBtn).not.toContainText('맞춤')

    // −를 누르면 수동 단계로 빠지고 100%를 벗어난다.
    await page.getByRole('button', { name: /시간 간격 좁게/ }).click()
    await expect(scaleBtn).toHaveAttribute('aria-pressed', 'false')
    await expect(scaleBtn).not.toHaveText('100%')

    // %를 누르면 100%(= 한 화면에 들어차는 크기)로 되돌아온다.
    await scaleBtn.click()
    await expect(scaleBtn).toHaveAttribute('aria-pressed', 'true')
    await expect(scaleBtn).toHaveText('100%')
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
    await page.getByRole('button', { name: /시간 간격 좁게/ }).click()
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
})
