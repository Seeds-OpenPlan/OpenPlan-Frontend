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

  REAL INTEGRATION POINT (do not wire this cycle — owner: "가드 건드리지
  마"): once ST-F1-14 is live, `src/api/client.js`'s response interceptor
  should call `useSessionStore.getState().expire(window.location.pathname)`
  in the branch where its own comment already says "실패 시 ... 세션 표면
  (ST-F1-14)으로 위임" (currently just rejects with AppError). That is the
  ONLY line this store needs touched elsewhere — everything else (the
  overlay's mount point in AppLayout, the re-login form inside it) is already
  wired and needs no further change at that point.
*/
export const useSessionStore = create((set) => ({
  expired: false,
  previousPath: null,
  expire: (path) => set({ expired: true, previousPath: path ?? null }),
  resolve: () => set({ expired: false, previousPath: null }),
}))

export default useSessionStore
