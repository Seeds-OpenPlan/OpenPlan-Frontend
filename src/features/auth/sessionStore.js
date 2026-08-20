import { create } from 'zustand'

/*
  OVL-SESSION state (AUTH-08). A tiny module-level Zustand store, same shape
  useToasts.js already uses for a global UI signal reachable from both
  components and non-component code (client.js's own interceptor, once ST-F1-14
  flips its real-auth switch in week 4 — see the "REAL INTEGRATION POINT"
  comment below).

  `previousPath` is what AUTH-08 promises to restore on successful re-login
  (NFR-004) — captured at the moment the overlay opens, not derived later
  (by the time the user re-authenticates, `window.location` has already moved
  nowhere else, but capturing it here keeps the contract explicit and testable
  without reading global location state from three different call sites).

  WIRED (W5, 2026-08-18): `src/api/client.js`의 응답 인터셉터가 토큰 갱신에
  실패한 지점에서 `useSessionStore.getState().expire(...)`를 호출한다. 위에서
  예고했던 그 한 줄이고, 나머지(AppLayout의 마운트 지점, 오버레이 안의
  재로그인 폼)는 예고대로 손댈 것이 없었다.

  단 한 가지 예외가 붙었다 — 세션 프로브(router.js의 sessionGuardLoader와
  useSession이 부르는 GET /auth/session)의 401에서는 expire()를 부르지 않는다.
  그건 만료가 아니라 "애초에 로그인한 적 없음"일 수 있고, 그 경우의 목적지는
  이 오버레이가 아니라 로그인 화면이기 때문이다.
*/
/*
  `loggingOut` — 사용자가 스스로 로그아웃하는 동안에는 만료 오버레이를 띄우지
  않는다(W5 실사용 결함, 2026-08-18: "로그아웃 눌렀더니 세션이 만료됐다고 뜸").

  로그아웃은 서버가 쿠키를 지우는 동작이라, 그 직후 AppLayout에 아직 마운트돼
  있는 쿼리(TutorialOverlay의 온보딩 진행도 등)가 한 박자 늦게 401을 받는다.
  client.js 입장에서는 "갱신 실패 = 세션 만료"와 구분이 안 되므로, 방금 로그인
  화면으로 나가려던 사용자에게 "세션이 만료되었습니다. 다시 로그인하세요"가
  뜬다 — 사용자가 방금 의도한 것과 정반대의 안내다.

  플래그는 재로그인 성공 시(useLogin) 또는 오버레이 해제 시 내려간다. 스토어는
  메모리에만 있어 새로고침으로도 초기화된다.
*/
export const useSessionStore = create((set) => ({
  expired: false,
  previousPath: null,
  loggingOut: false,
  beginLogout: () => set({ loggingOut: true, expired: false, previousPath: null }),
  endLogout: () => set({ loggingOut: false }),
  expire: (path) =>
    set((s) => (s.loggingOut ? s : { expired: true, previousPath: path ?? null })),
  resolve: () => set({ expired: false, previousPath: null, loggingOut: false }),
}))

export default useSessionStore
