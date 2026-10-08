import { useCallback, useSyncExternalStore } from 'react'

/*
  OVL-TUT's own step CURSOR (TUT-01~08) — entirely separate from the
  onboarding-progress document onboardingApi.js owns. The real contract's
  `OnboardingProgress` schema (BE openapi.yaml, confirmed against
  origin/main — line ~2505) has exactly one tutorial field, `tutorialDone`:
  no column for "which of the 6 coachmark steps is the user on". This file is
  the FE-only answer to that — a step index kept in localStorage, scoped per
  user, read/written by whichever of TutorialOverlay/useTutorialRestart needs
  it right now.

  THE BUG THIS REPLACES (owner report, production, 2026-10): the previous
  version PATCHed `tutorialStep` to the server as if it were a real field.
  `progressFlagsFrom` (onboardingApi.js) never translated it to anything the
  server understood, so every such PATCH body was effectively `{}` — the
  server's response came back with no step info, `normalizeProgress`
  defaulted it to 0, and `useUpdateOnboardingProgress`'s onSuccess wrote that
  0 straight back into the query cache. The kickoff dialog ("시작하기")
  reappeared after every single click, in any environment with a REAL
  server — masked in dev because the mock backend (onboardingFixtures.js)
  used to persist `tutorialStep` itself, a shape the real server never had.

  A plain module-level variable (not React state) + a tiny pub/sub, mirroring
  utils/overlayStack.js's own shape — because TWO separate components need to
  read/write the SAME cursor with no shared parent to lift state into:
  TutorialOverlay (mounted once in AppLayout, drives the coachmark) and
  useTutorialRestart (SettingsLayout/FaqBrowser, TUT-09 "다시 하기") both have
  to agree on it reactively. A restart triggered from Settings must be
  visible to the Coachmark mounted elsewhere in the tree on the very next
  render, not just after some unrelated remount — a plain useState in each
  component separately couldn't do that.
*/

const STORAGE_PREFIX = 'openplan.tutorial.step'

let cachedUserId = null
let step = 0
const listeners = new Set()

function notify() {
  listeners.forEach((listener) => listener())
}

function storageKey(userId) {
  return `${STORAGE_PREFIX}:${userId}`
}

// Defensive — localStorage can throw (privacy mode, quota) or hold junk from
// an older build; either way this falls back to "not started" rather than
// breaking the tutorial overlay (same shape onboardingFixtures.js's own
// `loadPersisted`/useHourScale.js's `readStored` already use).
function readStored(userId) {
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    const parsed = raw == null ? 0 : Number.parseInt(raw, 10)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
  } catch {
    return 0
  }
}

function writeStored(userId, value) {
  try {
    window.localStorage.setItem(storageKey(userId), String(value))
  } catch {
    // Best-effort — a failed write just means this step won't survive a
    // refresh; the in-memory cursor above still drives the current session.
  }
}

function clearStored(userId) {
  try {
    window.localStorage.removeItem(storageKey(userId))
  } catch {
    // no-op — see writeStored.
  }
}

// Re-reads from storage only when the SCOPING user actually changes (a
// login/logout swap, or the session query resolving after this module's
// first call with `userId` still undefined) — every other call is a cheap
// read of the in-memory value, not a localStorage round-trip per render.
function syncUser(userId) {
  if (userId === cachedUserId) return
  cachedUserId = userId
  step = userId ? readStored(userId) : 0
}

/** 0 = not started (TUT-01 kickoff); 1..N = the Nth Coachmark step. */
export function getTutorialStep(userId) {
  syncUser(userId)
  return step
}

export function setTutorialStep(userId, next) {
  syncUser(userId)
  step = next
  if (userId) writeStored(userId, next)
  notify()
}

/** Shared by completion, skip, and TUT-09 restart — all three send the
 * cursor back to kickoff; only what they PATCH to the server differs
 * (see TutorialOverlay.jsx / useTutorialRestart.jsx). */
export function resetTutorialStep(userId) {
  syncUser(userId)
  step = 0
  if (userId) clearStored(userId)
  notify()
}

export function subscribeTutorialStep(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * React binding. `userId` is expected from `useSession()` (features/auth/
 * useAuth.js) — undefined until the session query resolves, which this
 * module treats as "no cursor yet" (step 0) rather than throwing.
 */
export function useTutorialStep(userId) {
  const currentStep = useSyncExternalStore(
    subscribeTutorialStep,
    () => getTutorialStep(userId),
    () => 0,
  )
  const setStep = useCallback((next) => setTutorialStep(userId, next), [userId])
  const reset = useCallback(() => resetTutorialStep(userId), [userId])
  return [currentStep, setStep, reset]
}
