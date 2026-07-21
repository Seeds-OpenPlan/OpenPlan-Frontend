/*
  Client-side undo/redo stack for plan edits (PLAN-30/31). The server keeps NO
  edit history (J2), so this is the sole source of "이전 상태". Each entry captures
  a block's position before and after a committed move; undo re-drives the move to
  `before`, redo to `after`, reusing the exact same optimistic+PATCH mechanic as a
  drag (so undo is not a special server call — it's just another move).

  Cleared on a successful plan save (PLAN-03 "되돌리기 불가"): once confirmed, the
  stack is emptied so nothing can be undone past the save point.
*/

import { create } from 'zustand'

/**
 * @typedef {Object} MoveEntry
 * @property {string} planBlockId
 * @property {{startAt:string,endAt:string,week:string}} before
 * @property {{startAt:string,endAt:string,week:string}} after
 */

export const usePlanHistory = create((set, get) => ({
  past: /** @type {MoveEntry[]} */ ([]),
  future: /** @type {MoveEntry[]} */ ([]),

  /** Record a freshly committed move; a new action invalidates the redo branch. */
  record: (entry) => set((s) => ({ past: [...s.past, entry], future: [] })),

  /** Pop the last move; returns the entry to invert, or null when empty. */
  undo: () => {
    const { past, future } = get()
    if (past.length === 0) return null
    const entry = past[past.length - 1]
    set({ past: past.slice(0, -1), future: [...future, entry] })
    return entry
  },

  /** Re-apply the last undone move; returns the entry, or null when empty. */
  redo: () => {
    const { past, future } = get()
    if (future.length === 0) return null
    const entry = future[future.length - 1]
    set({ future: future.slice(0, -1), past: [...past, entry] })
    return entry
  },

  /** Emptied on save (PLAN-03) — the confirmed plan is the new floor. */
  clear: () => set({ past: [], future: [] }),
}))

export const selectCanUndo = (s) => s.past.length > 0
export const selectCanRedo = (s) => s.future.length > 0

export default usePlanHistory
