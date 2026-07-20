import { create } from 'zustand'

/*
  Toast queue as a small module-level Zustand store, kept at the hook layer so
  both components (the Toaster host) and other hooks (useAppError) can reach it
  without a component→component import (respects the import direction in §2.7).

  Toasts are transient global UI signals (e.g. "다시 연결되었습니다"). At most
  two are shown at once; older ones are dropped when a third arrives
  (components.md §5). This cycle only the reconnect toast fires, but the queue
  contract is fixed for later save-success toasts.
*/

const MAX_VISIBLE = 2

let nextId = 0

export const useToastStore = create((set) => ({
  toasts: [],
  push: (toast) =>
    set((state) => {
      const next = [...state.toasts, { id: ++nextId, tone: 'info', duration: 4000, ...toast }]
      // Drop the oldest when exceeding the visible cap.
      return { toasts: next.slice(-MAX_VISIBLE) }
    }),
  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))

/**
 * Imperative helper for firing a toast from anywhere (event handlers, mutation
 * callbacks). Prefer this over reaching into the store directly.
 * @param {{ message: string, tone?: 'success'|'info', duration?: number }} toast
 */
export function toast(toast) {
  useToastStore.getState().push(toast)
}

// Hook the Toaster host subscribes to.
export function useToasts() {
  return useToastStore((s) => s.toasts)
}

export default useToasts
