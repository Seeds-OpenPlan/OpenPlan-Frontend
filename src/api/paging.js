/*
  Full-list helper for paged endpoints whose caller wants EVERY item, not one
  page. Depends on client.js's opt-in `withMeta` request flag to see
  `meta.page.totalPages` — without it there is no signal at all that a second
  page even exists (that IS the bug this file exists to close; see
  docs/w2-connection-readiness.md §2/§6 "meta 유실" and taskApi.js's own
  pre-existing comment on why `size=100` alone was only a ceiling, not a fix).

  Rather than teach every `getXxx` list function its own "loop until
  totalPages" logic, one function owns that walk (1-based `page`, server's max
  page `size`, follow `meta.page.totalPages`) plus its runaway guard; each
  caller supplies only (a) how to fetch page 1, (b) how to fetch page N>1, and
  (c) how to pull the item array out of one page's raw payload. One bug fix
  here covers every caller instead of N near-identical copies.

  MOCK/REAL MIXING GUARD (Thomas review, MAJOR — this is why fetchPage is
  split into TWO functions instead of one): the original single-`fetchPage`
  design let every page go through the SAME DEV-fallback wrapper. In DEV, that
  meant: page 1 succeeds against the real server (totalPages=3), but page 2's
  real request hits a transient network error — `withDevFallback` only checks
  `isNetwork`, so it fell back to the mock, and the mock branch returns its
  ENTIRE in-memory list (not "page 2 of the mock"), because mocks don't page.
  The result was page-1-real-items + the-whole-mock-list concatenated into one
  array, with no error and no log — two unrelated data sources silently
  spliced together as if they were one consistent list.

  The fix: mock fallback may only ever decide the shape of the WHOLE list, at
  page 1. Once page 1 comes back as a REAL paginated page (`meta.page` is
  present), every subsequent page is fetched with `fetchNextPage` — which
  callers wire directly to the real endpoint call, with NO fallback wrapper —
  so a later page's failure propagates as a normal rejection instead of ever
  reaching the mock. See each caller (taskApi/projectApi/helpApi) for how
  `fetchFirstPage`/`fetchNextPage` share the same real request function.
*/

// The server's own documented ceiling (BE 확인, 2026-07-29 — see taskApi.js's
// getUnplacedTasks comment for the same number). Requesting this every page
// minimizes the number of round trips needed to drain a list.
export const SERVER_MAX_PAGE_SIZE = 100

// Defensive ceiling on the NUMBER OF PAGES fetched — not a real limit on list
// size (100 pages * 100/page = 10,000 items, far beyond any plausible single
// user's list). Exists only to turn a runaway loop (a server whose
// `totalPages` is wrong, or that never converges) into a loud, bounded
// failure instead of an infinite request storm.
const MAX_PAGES = 100

/**
 * Fetch every page of a paged endpoint and concatenate the items.
 *
 * @param {(page: number, size: number) => Promise<{data: unknown, meta: unknown}>} fetchFirstPage
 *   Fetches page 1. The ONLY page allowed to fall back to a DEV mock. Must
 *   resolve to `{data, meta}` — a real request gets this shape via client.js's
 *   `withMeta` opt-in; a mock fallback resolves to `{data: <mock payload>,
 *   meta: null}` (mocks never page — `meta: null` tells this loop "that mock
 *   payload IS the whole list, stop here").
 * @param {(page: number, size: number) => Promise<{data: unknown, meta: unknown}>} fetchNextPage
 *   Fetches page N (N>1). REAL SERVER ONLY — must NOT be wrapped in a mock
 *   fallback. Only ever called once page 1 has already proven real pagination
 *   exists, so a rejection here is a genuine failure, not a case to paper over
 *   with mock data (see the file header's mixing-bug note).
 * @param {(data: unknown) => unknown[]} extractItems - pulls the item array
 *   out of one page's `data` (real server: already an array; mock: an
 *   object keyed by resource name — see api/unwrap.js's `unwrapList`, which
 *   every caller here reuses so both shapes are absorbed in one adapter).
 * @returns {Promise<unknown[]>} every item across every page, in order.
 */
export async function fetchAllPages(fetchFirstPage, fetchNextPage, extractItems) {
  const first = await fetchFirstPage(1, SERVER_MAX_PAGE_SIZE)
  const items = [...extractItems(first.data)]

  const totalPages = first.meta?.page?.totalPages
  // No usable page meta (the DEV mock path, or a real response that omits it
  // unexpectedly) means there's no "next page" concept to follow at all —
  // treat what's already in hand as the complete list rather than guessing.
  if (!Number.isFinite(totalPages) || totalPages <= 1) return items

  const pagesToFetch = Math.min(totalPages, MAX_PAGES)
  if (totalPages > MAX_PAGES) {
    // Loud, not silent — this codebase's own rule (see taskApi.js's history of
    // a list silently truncating at the server's page-1 default, the exact
    // bug class this whole feature closes). A dev sees this in the console
    // instead of quietly getting a partial list with no indication.
    console.error(
      `[api] fetchAllPages: totalPages=${totalPages} exceeds the safety cap ` +
        `(${MAX_PAGES}); only the first ${MAX_PAGES} pages were fetched.`,
    )
  }

  // Sequential by design: page N+1's existence is only confirmed once page 1
  // reports totalPages, and a real list is expected to be a handful of pages
  // at most — no benefit to bursting parallel requests for that.
  for (let page = 2; page <= pagesToFetch; page += 1) {
    const next = await fetchNextPage(page, SERVER_MAX_PAGE_SIZE)
    // `fetchNextPage` is contractually real-server-only (no mock fallback),
    // so a page here without pagination meta should be impossible — page 1
    // already proved this endpoint pages. If it ever happens anyway (a
    // server bug, or a future caller wiring this wrong), THROW rather than
    // `console.error`-and-continue: silently accepting an ambiguous page and
    // splicing it in is exactly the "looks complete but isn't" failure mode
    // this file exists to prevent (see the mixing-bug note above) — a thrown
    // error surfaces through the caller's normal AppError/query-error path,
    // where the UI already has a visible error state, instead of only a
    // devtools console line nobody but a developer will ever see.
    if (!Number.isFinite(next.meta?.page?.totalPages)) {
      throw new Error(
        `[api] fetchAllPages: page ${page} response carried no pagination meta ` +
          `after page 1 confirmed this endpoint pages; aborting instead of ` +
          `silently mixing partial/inconsistent pages.`,
      )
    }
    items.push(...extractItems(next.data))
  }
  return items
}
