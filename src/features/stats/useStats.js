/*
  TanStack Query wiring for the stats feature's first (and, this cycle, only)
  read — the correction-proposal suggestion chip (ST-F1-09 AC-2).
*/
import { useQuery } from '@tanstack/react-query'
import { getCorrectionProposal } from './statsApi'

export const correctionProposalKey = (category) => ['correctionProposal', category]

/**
 * GET /stats/correction-proposals for the CURRENTLY selected category. Disabled
 * entirely while `category` is null/"" (없음) — see getCorrectionProposal's own
 * short-circuit — so switching to "없음" never fires a request just to throw
 * its result away.
 */
export function useCorrectionProposal(category) {
  return useQuery({
    queryKey: correctionProposalKey(category),
    queryFn: () => getCorrectionProposal(category),
    enabled: Boolean(category),
    staleTime: 5 * 60 * 1000,
  })
}

export default useCorrectionProposal
