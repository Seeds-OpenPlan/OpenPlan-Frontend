// 서비스워커: TWA(Trusted Web Activity)로 구글 플레이에 올리려면 등록된
// 서비스워커가 하나는 있어야 "설치된 앱"처럼 동작한다(Bubblewrap 요건).
// 다만 이 앱은 화면이 빠르게 바뀌는 중이라, 캐시가 낡은 화면을 띄우는
// 사고가 가장 위험하다 — 그래서 캐싱 범위를 의도적으로 최소한으로 둔다.
//
// 방침:
//   - install 시점에 프리캐시하는 건 오프라인 폴백 페이지 하나뿐이다.
//   - fetch 가로채기는 "문서 내비게이션" 요청(request.mode === 'navigate',
//     즉 주소창 이동/새로고침/링크 클릭으로 페이지 자체를 불러오는 경우)에만
//     반응한다. 스크립트·스타일·이미지·API(/api/*) 등은 여기서 손대지
//     않는다 — respondWith를 호출하지 않으므로 브라우저 기본 네트워크
//     동작이 그대로 흐른다(항상 최신 응답, 캐시 개입 없음).
//   - 내비게이션은 "network-first": 온라인이면 항상 서버의 최신 HTML을
//     쓰고, 네트워크 요청이 실패했을 때만(완전 오프라인 등) 오프라인
//     폴백 페이지를 보여준다. 앱 화면 자체를 캐시에서 서빙하는 경로는
//     없다.
//   - activate 시점에 이전 버전 캐시를 정리하고 즉시 모든 탭을 제어한다
//     (skipWaiting + clients.claim) — 배포 때마다 사용자가 수동으로 새
//     탭을 열 필요 없이 다음 네비게이션부터 새 서비스워커가 적용된다.
//
// 캐시 이름에 버전을 넣어 둔다: 로직이 바뀌어 캐시 내용을 다시 받아야 할
// 때 이 숫자만 올리면 activate가 구버전 캐시를 자동으로 지운다.
const CACHE_NAME = 'openplan-shell-v1'
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL)))
  // 대기 중인 이전 서비스워커를 기다리지 않고 바로 이 버전으로 전환한다.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  // 페이지 내비게이션이 아니면(=/api 호출, JS/CSS/이미지 등 정적 자산 요청)
  // 아무것도 하지 않고 그대로 통과시킨다. 여기서 respondWith를 호출하지
  // 않아야 브라우저 기본 네트워크 요청이 그대로 나간다.
  if (request.mode !== 'navigate') {
    return
  }
  // /api로 가는 문서 이동(소셜 로그인 /api/v1/auth/oauth/* → 302 → 제공자)도
  // 건드리지 않는다. 리다이렉트 체인에 서비스워커가 끼어들 이유가 없다.
  if (new URL(request.url).pathname.startsWith('/api/')) {
    return
  }

  event.respondWith(
    fetch(request).catch(() => caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error())),
  )
})

// ──────────────────────────────────────────────────────────────────────────
// 푸시 알림 (ADR-0015 — 안드로이드 앱 전용 "시작 10분 전" 알림).
//
// 위 fetch/install/activate는 TWA 설치 요건(Bubblewrap)과 내비게이션 캐싱
// 정책을 위한 것이고, 이 아래 두 핸들러는 그와 **완전히 독립된 관심사**다 —
// 캐시 이름(CACHE_NAME)이나 OFFLINE_URL을 전혀 참조하지 않는다. 서버
// 발송기(1분 주기)가 Web Push 프로토콜로 보낸 payload를 받아 OS 알림으로
// 띄우는 것과, 그 알림을 탭했을 때 앱 화면으로 보내는 것 두 가지만 한다.
// ──────────────────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  // payload가 없는 푸시(일부 브라우저의 "빈 알림으로 깨우기"용 핑)는 보여줄
  // 내용이 없으므로 그대로 무시한다 — 서버는 항상 JSON을 싣지만, 방어적으로
  // 비워 둔다.
  if (!event.data) return

  // JSON 파싱 실패(서버 payload 형식이 바뀌었거나 손상된 경우)는 조용히
  // 삼킨다 — 여기서 던지면 이 이벤트 전체가 처리되지 않은 push로 남아
  // 브라우저가 재시도하거나 경고를 띄울 수 있다. 알림 하나를 못 띄우는 것이
  // 서비스워커를 깨뜨리는 것보다 낫다.
  let payload
  try {
    payload = event.data.json()
  } catch {
    return
  }

  const { title, body, url, tag } = payload
  // title이 없으면 showNotification 자체가 거부된다 — 서버가 항상 title을
  // 싣지만, 방어적으로 제목 없는 호출을 막아 둔다.
  if (!title) return

  // tag를 넣는 이유: 같은 대상(같은 태스크·고정 일정 회차 등)에 대해 서버가
  // 중복 발송을 DB UNIQUE로 막아도(ADR 결정 ③) 알림 센터에는 여러 발송기
  // 회차의 알림이 쌓일 수 있다 — 같은 tag를 가진 이전 알림을 새 알림이
  // 자동으로 교체하게 해, 기기 알림 목록이 같은 일로 여러 줄 쌓이지 않게
  // 한다. 서버가 tag를 안 보내면(이전 계약) undefined로 전달돼 OS가 매번
  // 새 알림으로 쌓는다 — 그 쪽이 기존 동작이라 안전한 기본값이다.
  //
  // url은 showNotification의 `data`에 실어 두고, 실제 이동은 아래
  // notificationclick에서 처리한다 — showNotification 자체에는 클릭 동작을
  // 지정하는 표준 옵션이 없다.
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      data: { url },
      // manifest.webmanifest의 PWA 아이콘을 그대로 쓴다 — 알림 전용 아이콘을
      // 새로 만들지 않는다. TWA에서는 Bubblewrap이 enableNotifications:
      // true로 이 알림을 크롬이 아니라 앱 이름·아이콘으로 띄운다(ADR 결정
      // ⑤) — 이 icon 값은 TWA가 아닌 환경(일반 브라우저 알림)에서만 실제로
      // 쓰인다.
      icon: '/icons/icon-192.png',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  const url = event.notification.data?.url ?? '/'
  // 알림을 닫는 것도 waitUntil 안에서 해야 한다 — 클릭 핸들러가 비동기로
  // 끝나기 전에 브라우저가 이벤트를 "처리 완료"로 보고 서비스워커를 재울
  // 수 있다(알림이 화면에 남아 있는 채로).
  event.notification.close()

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // 이미 열려 있는 탭이 있으면 새 탭을 띄우지 않고 그 탭을 포커스 +
      // 이동시킨다 — TWA는 보통 탭이 하나뿐이라 이 경로가 거의 항상 맞고,
      // 여러 탭을 띄우는 동작은 "알림 하나 눌렀는데 창이 늘어난다"는 혼란을
      // 준다. 같은 오리진이면 되고 정확히 같은 경로일 필요는 없다 — 알림이
      // 가리키는 화면으로 그 탭을 이동시키는 것이 목적이다.
      const sameOrigin = clientsList.find((c) => new URL(c.url).origin === self.location.origin)
      if (sameOrigin) {
        await sameOrigin.focus()
        if ('navigate' in sameOrigin) await sameOrigin.navigate(url)
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})
