/*
  TanStack Query wiring for ST-F1-13. Server state (the onboarding-progress
  document) only — the wizard/tutorial's own in-progress edits (profile form
  fields, which import-decision radio is picked) stay in page-local state
  until submitted, same server/draft split every other feature follows
  (design-handoff §3).
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getOnboardingProgress,
  updateOnboardingProgress,
  getImportCandidates,
  submitImportDecisions,
} from './onboardingApi'
import { toast } from '../../hooks/useToasts'
import { systemMessages } from '../../constants/systemMessages'

export const onboardingProgressKey = () => ['onboardingProgress']

export function useOnboardingProgress() {
  return useQuery({ queryKey: onboardingProgressKey(), queryFn: getOnboardingProgress })
}

/**
 * Every step-advance/profile-save/tutorial-progress write goes through this
 * one mutation. `onSuccess` writes the server's own returned document back
 * into the cache (never a locally-guessed merge) — the source of truth for
 * "where was the user" (AC2) must always be what the server just confirmed.
 */
export function useUpdateOnboardingProgress() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateOnboardingProgress,
    onSuccess: (data) => queryClient.setQueryData(onboardingProgressKey(), data),
    onError: () => toast({ tone: 'error', message: systemMessages.error.writeTitle }),
  })
}

export const importCandidatesKey = (provider) => ['onboardingImportCandidates', provider]

/** ONB-09. Only enabled once the caller actually has a provider to list
 * (a connected account with calendars picked) — no point fetching candidates
 * for a still-disconnected provider. */
export function useImportCandidates(provider) {
  return useQuery({
    queryKey: importCandidatesKey(provider),
    queryFn: () => getImportCandidates(provider),
    enabled: Boolean(provider),
  })
}

export function useSubmitImportDecisions() {
  return useMutation({
    mutationFn: ({ provider, decisions }) => submitImportDecisions(provider, decisions),
    onError: () => toast({ tone: 'error', message: systemMessages.error.writeTitle }),
  })
}
