import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/*
  Generic "open-on-param, strip-after" seam — the shape this codebase already
  uses for every cross-screen open request (ProjectsPage's `?create=1`,
  WeeklyPage's `?openUnplaced=1`/`?project=`/`?openReplan=1`), generalized so
  it ALSO re-fires on a REPEAT appearance of the SAME param while the
  component stays mounted — a plain lazy `useState` initializer (what every
  one of those pre-existing seams used) only ever catches the param on the
  FIRST render, which is fine when the param only ever arrives via a real
  navigation FROM another page, but not for a param that can legitimately
  reappear on an ALREADY-mounted page (a deep link the user follows twice,
  or — historically, ST-F1-13's tutorial — a [다시 열기] button re-sending the
  same request; that button is gone, RING-BASED REDESIGN, 2026-10, but the
  general "re-arriving deep link" case this hook also covers is not
  tutorial-specific and still applies to every caller below).

  Split in THREE for `react-hooks/set-state-in-effect` (this codebase's lint
  config rejects calling a LOCAL `useState` setter synchronously inside a
  `useEffect` body — only talking to an EXTERNAL system from an effect, e.g.
  a plain `setSearchParams` browser-history write or an opaque caller-owned
  callback, is exempt, per that rule's own guidance):
    - DECIDING is render-time: comparing the param's raw value against the
      last one we already acted on, and writing `handledRaw` when it should
      change — React's own "adjusting state when a value changes" pattern
      (the exact shape ProjectsPage's own `tabResolvedForId` already uses for
      a different seam). This step has no side effect of its own (a plain
      local `setHandledRaw`), so it stays in render rather than an effect.
    - FIRING is an effect (Thomas code review SHOULD-FIX, 2026-10 — see
      below; `useLayoutEffect` specifically, AI-review SHOULD-FIX, 2026-10 —
      see that effect's own comment) that only REACTS to `handledRaw` having
      changed; it never decides anything itself.
    - STRIPPING the param from the URL is a SEPARATE effect that only runs
      once firing has actually happened for the CURRENT raw value — not
      keyed off the raw searchParams value directly, so a param that hasn't
      met `ready` yet is left alone instead of being stripped before it ever
      got a chance to fire.

  FIRING MOVED OUT OF RENDER (fixes a real risk, not yet a reproduced bug):
  `onFire` is a caller-supplied side effect — opens a panel/form, seeds a
  filter, mutates a DIFFERENT component's state (e.g. WeeklyPage's
  `onFire: () => setPanelOpen(true)`) — and React only guarantees an EFFECT
  runs exactly once per render that actually COMMITS. Calling it directly in
  the render body, as this used to, ran it during React 19 Strict Mode's own
  double-invoked dev render pass too (this file's "adjusting state" step
  above is written to tolerate that — see its own comment — but `onFire`
  itself is arbitrary caller code with no such guarantee), and would have
  silently run for a render a Transition later discarded before it ever
  committed. Every current caller's own `onFire` happens to be idempotent in
  its OBSERVABLE result (setting the same boolean/filter twice is a no-op
  the second time), which is exactly why this bug was only a latent RISK
  rather than something already reproduced — but this hook has no way to
  assume that holds for every future caller.

  `onFire` itself is read through a ref (the same shape tutorialEvents.js's
  own `useTutorialEvent` already uses for an identical reason), so the FIRE
  effect's dependency array never needs to include it directly: every call
  site passes a FRESH inline closure on every render, and putting that
  reference in `useEffect`'s deps would re-run the effect — re-firing the
  request — on every unrelated re-render of the page, not just when
  `handledRaw` itself actually changes.

  DEFAULT `isMatch` WIDENED TO "any non-empty string", not just the LITERAL
  `'1'` (owner report, 2026-10, from the tutorial's OLD auto-open design —
  "할 일 창이 자동으로 열릴 때도 있고 안 열릴 때도 있다"). That design sent a
  monotonically-incrementing nonce instead of a fixed `'1'` so that a REPEAT
  request (the user re-entering a step, or clicking [다시 열기]) always
  produced a URL distinct from the one before it — a navigation to a URL
  that is BYTE-FOR-BYTE IDENTICAL to the one react-router already has is a
  complete no-op at the router level (`location` never changes, so nothing
  here ever sees a new `raw` to react to), which a value that never repeats
  sidesteps by construction. [다시 열기] is gone and no tutorial step sends
  any of these request params anymore (RING-BASED REDESIGN, see
  TutorialOverlay.jsx's own header) — this widening is no longer load-
  bearing for that reason, but is kept rather than reverted: every existing
  caller here (ProjectsPage's `?create=1`, WeeklyPage's `?openUnplaced=1`/
  `?project=`/`?highlightBlocks=`) still only ever sends a fixed literal, so
  `raw.length > 0` matching exactly those same literals is no different in
  practice from requiring `raw === '1'` would have been; reverting the
  default buys nothing today and risks quietly breaking a future caller
  that (like the old tutorial did) legitimately needs a non-`'1'` value.
*/
export function useSearchParamRequest(
  searchParams,
  setSearchParams,
  paramName,
  { ready = true, isMatch = (raw) => raw.length > 0, onFire } = {},
) {
  const raw = searchParams.get(paramName)
  const [handledRaw, setHandledRaw] = useState(null)

  const onFireRef = useRef(onFire)
  useEffect(() => {
    onFireRef.current = onFire
  }, [onFire])

  if (raw !== handledRaw) {
    if (raw != null && isMatch(raw) && ready) {
      setHandledRaw(raw)
    } else if (raw == null) {
      // The param is gone WITHOUT us ever firing for it (not ready yet, or it
      // never matched) — forget it, so a FUTURE identical value is compared
      // against `null` again instead of a stale memory that would silently
      // swallow it.
      setHandledRaw(null)
    }
    // While present but not yet `ready`, deliberately do nothing: `handledRaw`
    // stays whatever it was, so `raw !== handledRaw` keeps re-checking every
    // render until `ready` flips true — a passive retry, not a timer/poll.
  }

  /*
    THE FIRE — see this file's own header for why this lives in an effect
    instead of inline above. Keyed on `handledRaw` alone (not `onFire`, see
    header): React only runs this when that value actually changes, which
    is exactly once per raw value the render-time step above decided on —
    including a REPEAT occurrence of the identical string after it went
    back to `null` in between, since that round trip is still two distinct
    transitions of `handledRaw`, not one (no current caller actually
    re-sends an identical value today — the tutorial's OLD [다시 열기] used
    to, but is gone, RING-BASED REDESIGN — this still matters for a GENUINE
    deep-link re-arriving with the same param, e.g. the user navigating to
    `?create=1` twice via two separate dashboard clicks).

    `useLayoutEffect`, NOT `useEffect` (AI-review SHOULD-FIX, 2026-10 —
    deep-link flicker risk) — a FRESH navigation straight to a param-bearing
    URL (dashboard's "+ 새 프로젝트"/"지금 배치하기" → `/projects?create=1`
    / `/weekly?openUnplaced=1`, etc.) mounts the whole page with `onFire`
    (typically `setOverlay(...)`/`setPanelOpen(true)`) not yet having run.
    A PASSIVE effect fires AFTER the browser paints — the user would see one
    real frame of "page, no overlay" before the overlay snaps open a tick
    later. `useLayoutEffect` runs synchronously after the DOM commits but
    BEFORE the browser paints, so the `onFire`-triggered state update (and
    the re-render/re-commit it causes) resolves before anything is ever
    shown — the overlay is simply part of the FIRST painted frame, same as
    the OLD lazy-`useState`-initializer seams this hook generalizes (this
    file's own header) used to achieve by running during the initial render
    itself. Safe to move: `onFire` here only ever calls a LOCAL state setter
    (`setOverlay`/`setPanelOpen`/`setProjectFilter`/`handleFocusBlock`+
    `setMode` — checked every current call site), never `navigate()` or
    `setSearchParams` directly, and calling a state setter from a layout
    effect is a fully supported React pattern (it is, in fact, the
    textbook use case for the hook). React 19 Strict Mode's dev-only
    double-invoke applies identically to `useLayoutEffect` as it already
    did to `useEffect` — this effect has no cleanup to "undo" a first call
    either way, so the existing idempotency requirement on every `onFire`
    (this file's own header, "FIRING MOVED OUT OF RENDER") is unchanged,
    not newly introduced by this switch. The STRIP effect below stays a
    PASSIVE `useEffect` — removing the param from the URL has no visible
    flicker to avoid, so there is nothing to gain from running it before
    paint too.
  */
  useLayoutEffect(() => {
    if (handledRaw == null) return
    onFireRef.current(handledRaw)
  }, [handledRaw])

  useEffect(() => {
    if (handledRaw == null) return
    if (searchParams.get(paramName) !== handledRaw) return
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete(paramName)
        return next
      },
      { replace: true },
    )
  }, [handledRaw, paramName, searchParams, setSearchParams])
}

export default useSearchParamRequest
