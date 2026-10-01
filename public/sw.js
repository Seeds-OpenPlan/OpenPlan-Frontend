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
