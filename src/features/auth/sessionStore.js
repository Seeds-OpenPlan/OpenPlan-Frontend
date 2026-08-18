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
export const useSessionStore = create((set) => ({
  expired: false,
  previousPath: null,
  expire: (path) => set({ expired: true, previousPath: path ?? null }),
  resolve: () => set({ expired: false, previousPath: null }),
}))

export default useSessionStore
