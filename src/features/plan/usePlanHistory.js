/*
  Client-side undo/redo stack for plan edits (PLAN-30/31). The server keeps NO
  edit history (J2), so this is the sole source of "이전 상태". The stack is a
  GENERIC action log, not move-only: each entry carries a `type` and knows how to
  invert/re-apply itself.

    - 'move'   entries carry {before, after} positions; the caller (WeeklyPage)
               replays them through the same optimistic+PATCH move mechanic a
               drag uses — undo is not a special server call, it's just another
               move (unchanged from the original design).
    - 'remove' entries (PLAN-16 배치 해제 / PLAN-18 일정 삭제) carry `undo`/`redo`
               closures supplied by useRemoveBlockWithUndo, which re-run the exact
               recreate/delete calls the "실행 취소" toast already uses — this
               store never talks to the API directly, it only owns ordering.

  Cleared on a successful plan save (PLAN-03 "되돌리기 불가"): once confirmed, the
  stack is emptied so nothing can be undone past the save point.

  Every entry gets a stable `id` (assigned by the caller before recording) so a
  'remove' entry can also be resolved OUT OF ORDER by the "실행 취소" toast (see
  `claim`), independent of the ↶ button's strict LIFO pop — the two are two UI
  surfaces for the same underlying action and must not both fire it.
*/

import { create } from 'zustand'

/**
 * @typedef {Object} MoveEntry
 * @property {string} id
 * @property {'move'} type
 * @property {string} planBlockId
 * @property {{startAt:string,endAt:string,week:string}} before
 * @property {{startAt:string,endAt:string,week:string}} after
 */

/**
 * @typedef {Object} RemoveEntry
 * @property {string} id
 * @property {'remove'} type
 * @property {() => void} undo  Re-creates the removed block (recreate path).
 * @property {() => void} redo  Re-runs the removal (delete path).
 */

export const usePlanHistory = create((set, get) => ({
  past: /** @type {(MoveEntry|RemoveEntry)[]} */ ([]),
  future: /** @type {(MoveEntry|RemoveEntry)[]} */ ([]),

  /** Record a freshly committed action; a new action invalidates the redo branch. */
  record: (entry) => set((s) => ({ past: [...s.past, entry], future: [] })),

  /** Pop the most recent action (LIFO); returns the entry to invert, or null when empty. */
  undo: () => {
    const { past, future } = get()
    if (past.length === 0) return null
    const entry = past[past.length - 1]
    set({ past: past.slice(0, -1), future: [...future, entry] })
    return entry
  },

  /** Re-apply the most recently undone action; returns the entry, or null when empty. */
  redo: () => {
    const { past, future } = get()
    if (future.length === 0) return null
    const entry = future[future.length - 1]
    set({ future: future.slice(0, -1), past: [...past, entry] })
    return entry
  },

  /**
   * Move a SPECIFIC entry (by id) from `past` to `future`, wherever it sits —
   * not necessarily the top. Used by a "실행 취소" toast, which targets its own
   * removal regardless of what the user did afterward. Returns the entry when
   * found (meaning: you have exclusive permission to invert it now), or `null`
   * when it's no longer in `past` (already claimed by ↶, or already invalidated
   * by a later action) — the caller MUST treat `null` as "do nothing" so the
   * toast and the ↶ button can never invert the same removal twice.
   */
  claim: (id) => {
    const { past, future } = get()
    const idx = past.findIndex((e) => e.id === id)
    if (idx === -1) return null
    const entry = past[idx]
    set({
      past: [...past.slice(0, idx), ...past.slice(idx + 1)],
      future: [...future, entry],
    })
    return entry
  },

  /** Drop an entry entirely (both branches) — used when an invert attempt fails. */
  discard: (id) =>
    set((s) => ({
      past: s.past.filter((e) => e.id !== id),
      future: s.future.filter((e) => e.id !== id),
    })),

  /** Emptied on save (PLAN-03) — the confirmed plan is the new floor. */
  clear: () => set({ past: [], future: [] }),
}))

export const selectCanUndo = (s) => s.past.length > 0
export const selectCanRedo = (s) => s.future.length > 0

export default usePlanHistory
