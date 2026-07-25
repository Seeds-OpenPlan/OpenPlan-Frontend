/*
  OP functions for ST-F1-13 (온보딩·튜토리얼). `onboarding-progress` is a REAL
  contract (스토리 스펙 §ST-B1-08, BE-1) — only its exact request/response shape
  is unconfirmed in this checkout, so the endpoint path itself is treated as
  real while the field names stay flexible (see `normalizeProgress`). The
  import-candidates/decisions pair (ONB-09) has no confirmed contract at all —
  [가정-확장], same status as settingsApi.js's connections/preferences group.

  Reuses planApi's withDevFallback rather than redeclaring the one shared
  mock-fallback rule a fifth time (statsApi.js/settingsApi.js already made the
  same choice).
*/
import { apiClient } from '../../api/client'
import { withDevFallback } from '../plan/planApi'
import { onboardingMockBackend } from './onboardingFixtures'

/** Tolerate snake_case from a real BE response the same way planApi.js's
 * normalizeBlock/normalizeWeek do — this endpoint's exact casing is
 * unconfirmed until Swagger, so both are accepted. */
function normalizeProgress(p) {
  if (!p) return p
  return {
    onboardingCompleted: p.onboardingCompleted ?? p.onboarding_completed ?? false,
    introSeen: p.introSeen ?? p.intro_seen ?? false,
    currentStep: p.currentStep ?? p.current_step ?? 'PROFILE',
    profile: p.profile ?? null,
    tutorialCompleted: p.tutorialCompleted ?? p.tutorial_completed ?? false,
    tutorialSkipped: p.tutorialSkipped ?? p.tutorial_skipped ?? false,
    tutorialStep: p.tutorialStep ?? p.tutorial_step ?? 0,
    version: p.version ?? 1,
  }
}

/** GET /users/me/onboarding-progress. */
export function getOnboardingProgress() {
  return withDevFallback(
    () => apiClient.get('/users/me/onboarding-progress'),
    () => onboardingMockBackend.getProgress(),
  ).then(normalizeProgress)
}

/** PATCH /users/me/onboarding-progress. Partial merge — callers send only the
 * fields that changed (e.g. `{ currentStep: 'AVAILABILITY' }` on step advance,
 * `{ profile }` on ONB-02 save). */
export function updateOnboardingProgress(patch) {
  return withDevFallback(
    () => apiClient.patch('/users/me/onboarding-progress', patch),
    () => onboardingMockBackend.patchProgress(patch),
  ).then(normalizeProgress)
}

/** GET /onboarding/import-candidates ([가정-신규], ONB-09). `provider` selects
 * which connected account's events to list. */
export function getImportCandidates(provider) {
  return withDevFallback(
    () => apiClient.get('/onboarding/import-candidates', { params: { provider } }),
    () => onboardingMockBackend.getImportCandidates(provider),
  )
}

/** POST /onboarding/import-decisions ([가정-신규]). `decisions` = one entry per
 * candidate event: `{ eventId, mode: 'AS_IS'|'EDITED'|'EXCLUDED' }`. */
export function submitImportDecisions(provider, decisions) {
  return withDevFallback(
    () => apiClient.post('/onboarding/import-decisions', { provider, decisions }),
    () => onboardingMockBackend.submitImportDecisions(provider, decisions),
  )
}
