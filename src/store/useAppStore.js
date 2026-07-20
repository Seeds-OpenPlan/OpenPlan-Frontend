import { create } from 'zustand'

// 구조 확인용 최소 store. 도메인/인증/API 상태는 포함하지 않는다.
export const useAppStore = create((set) => ({
  appReady: false,
  setAppReady: (v) => set({ appReady: v }),
}))
