/*
  브라우저 Push API 왕복을 감싼 순수 헬퍼 (ADR-0015 결정 ④⑤). PushNotificationSection이
  이 함수들만 호출하고 PushManager/Notification 전역을 직접 만지지 않는다 — 구독
  생성·재동기화 로직이 한 곳에만 살아, 두 호출부(토글 클릭·페이지 로드 재동기화)가
  서로 다른 방식으로 구독을 만들 위험이 없다.
*/

/**
 * VAPID 공개키는 base64url(RFC 4648 §5)로 온다 — `PushManager.subscribe`의
 * `applicationServerKey`는 반드시 `Uint8Array`(또는 ArrayBuffer)라, 표준
 * base64(+ / 패딩)로 되돌려 디코드한다. 흔히 쓰는 변환이라 별도 설명 없는
 * 구현 — 패딩(`=`)을 길이에 맞춰 보충하고 -/_ 를 +// 로 치환하는 것이 전부다.
 */
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/**
 * 지금 기기에 이미 살아 있는 구독이 있는가. 토글을 켤 때 이 값이 있으면
 * 권한 재요청·재구독을 건너뛴다(이미 구독돼 있다는 뜻) — 없을 때만 아래
 * `subscribeToPush`로 새로 만든다.
 *
 * `navigator.serviceWorker.ready`를 거치는 이유: 등록이 아직 `installing`/
 * `waiting` 단계여도 이 프라미스는 `active`가 될 때까지 기다려 준다(브라우저
 * 표준 동작) — 등록 직후 레이스 없이 항상 활성 서비스워커의 PushManager를
 * 돌려받는다.
 */
export async function getExistingPushSubscription() {
  if (!('serviceWorker' in navigator)) return null
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

/** `publicKey`(base64url)로 새 구독을 만든다. `userVisibleOnly: true`는
 * 표준 요구사항이다 — 이 값 없이 구독하면 "조용한(사용자가 못 보는) 푸시"를
 * 예고하는 것이라 크롬이 구독 자체를 거부한다. */
export function subscribeToPush(publicKey) {
  return navigator.serviceWorker.ready.then((registration) =>
    registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }),
  )
}

/** `PushSubscription` → 서버 계약 body(`POST /users/me/push-subscriptions`) 모양.
 * `platform: 'ANDROID_APP'`을 여기서 고정한다 — 이 섹션 자체가 앱 전용이라 다른
 * 값을 보낼 경로가 없다(ADR-0015 결정 ④ — 서버도 이 값을 요구하지만 완전한
 * 차단은 아니라고 명시한 신고값). */
export function subscriptionToPayload(subscription) {
  const json = subscription.toJSON()
  return {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    platform: 'ANDROID_APP',
  }
}
