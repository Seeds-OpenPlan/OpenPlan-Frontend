/*
  «지금 안드로이드 앱(TWA) 안에서 돌고 있는가» 판별.

  왜 필요한가 — TWA 는 웹과 **같은 코드를 같은 주소에서** 띄운다. 그래서 「안드로이드
  앱에서만 다르게」 를 빌드로 가를 수 없고, 런타임 신호로 알아내야 한다.

  두 신호를 쓴다. 둘 중 하나라도 맞으면 앱으로 본다.

  ① **`?platform=android`** — Bubblewrap 의 `twa-manifest.json` 에서 `startUrl` 을
     `/?platform=android` 로 두면 앱이 실행될 때 이 주소로 들어온다. **우리가 심는
     표식이라 가장 확실하다**(브라우저로 그 주소를 직접 열면 같게 판정되지만, 그건
     사용자가 일부러 한 것이라 문제가 아니다).
  ② **`document.referrer` 가 `android-app://`** — 크롬이 TWA 로 띄울 때 넣어 주는
     값이다. ①이 어떤 이유로 빠져도 걸리도록 둔 보조 신호다.

  둘 다 **실행 시점(최초 내비게이션)에만** 보이므로, 한 번 판별하면 sessionStorage 에
  적어 두고 이후 SPA 이동·새로고침에서도 같은 답을 유지한다.

  🔴 **실패하면 «앱이 아니다» 로 본다**(fail-open). 이 판별이 틀렸을 때 생기는 일이
  양쪽으로 다르기 때문이다 — 앱인데 웹으로 보면 제공자가 하나 더 보일 뿐이지만,
  웹인데 앱으로 보면 **웹 이용자에게서 기능을 빼앗는다.**

  display-mode 미디어 쿼리(`standalone`)는 쓰지 않는다 — 데스크톱에 설치한 PWA 도
  참이라 «안드로이드 앱» 을 가리지 못한다.
*/

const STORAGE_KEY = 'openplan.app-shell'
const ANDROID_APP = 'android-app'

function readPersisted() {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY)
  } catch {
    // 프라이버시 모드·용량 초과 — 저장소가 없어도 판별 자체는 동작해야 한다.
    return null
  }
}

function persist(value) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, value)
  } catch {
    /* 저장만 실패 — 이번 문서 안에서는 아래 메모이즈로 버틴다. */
  }
}

function detect() {
  try {
    const param = new URLSearchParams(window.location.search).get('platform')
    if (param === 'android') return true
    return String(document.referrer || '').startsWith('android-app://')
  } catch {
    return false
  }
}

let memo

/** 안드로이드 앱(TWA) 안에서 실행 중인가. */
export function isAndroidAppShell() {
  if (typeof window === 'undefined') return false
  if (memo !== undefined) return memo

  const persisted = readPersisted()
  if (persisted !== null) {
    memo = persisted === ANDROID_APP
    return memo
  }

  memo = detect()
  persist(memo ? ANDROID_APP : 'web')
  return memo
}

export default isAndroidAppShell
