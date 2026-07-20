import { create } from 'zustand'

/*
  Global client-side store (Zustand). Owns local state that is NOT server data:
  the unsaved-edit `dirty` flag, an undo/redo stack stub, and the network
  online flag. Server data stays in TanStack Query; UI-instant state stays in
  component useState. This separation is the ADR-0002 boundary — never mirror a
  server response here (see story §2.1).

  Single sources of truth co-located here on purpose:
  - `dirty`  : the ONLY unsaved-edit flag. useUnsavedGuard reads it; screens
               must not reinvent per-page dirty tracking (SYS-04 AC-4).
  - `online` : mirrored from useOnlineStatus (the hook is the single source;
               it writes here so a `canWrite` selector can live in the store,
               which is where save buttons subscribe — story §2.1 adopted plan).
*/
export const useAppStore = create((set) => ({
  // --- bootstrap flag (existing) ---
  appReady: false,
  setAppReady: (v) => set({ appReady: v }),

  // --- unsaved-edit (draft dirty) slice — SYS-04 ---
  dirty: false,
  markDirty: () => set({ dirty: true }),
  markClean: () => set({ dirty: false }),

  // --- undo/redo slice — stub this cycle (real consumers land in SS10).
  //     clearUndoStack is invoked by the save-success pattern (§2.6) so the
  //     contract is fixed now even though no screen pushes onto the stack yet.
  undoStack: [],
  redoStack: [],
  clearUndoStack: () => set({ undoStack: [], redoStack: [] }),

  // --- network online slice — SYS-07. Written by useOnlineStatus only.
  //     Default true so first paint on a connected client shows no banner
  //     before the hook subscribes (avoids a false offline flash / CLS).
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  setOnline: (v) => set({ online: v }),
}))

/*
  Derived selector: writes are allowed only when online (offline disables save
  per SYS-07 AC-2). Kept as a standalone selector so components subscribe to the
  boolean, not the whole store, avoiding needless re-renders. `isPending` (the
  in-flight mutation state) is combined at the call site, since it lives in
  TanStack Query, not here.
*/
export const selectCanWrite = (state) => state.online
