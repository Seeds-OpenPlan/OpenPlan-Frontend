import { useEffect, useRef, useState } from 'react'

/*
  Generic "open-on-param, strip-after" seam — the shape this codebase already
  uses for every cross-screen open request (ProjectsPage's `?create=1`,
  WeeklyPage's `?openUnplaced=1`/`?project=`/`?openReplan=1`), generalized so
  it ALSO re-fires on a REPEAT appearance of the SAME param while the
  component stays mounted. A plain lazy `useState` initializer (what every one
  of those pre-existing seams used) only ever catches the param on the FIRST
  render — fine when the param only ever arrives via a real navigation FROM
  another page. The tutorial's guided coachmark (ST-F1-13, 2026-10) breaks
  that assumption: several of its steps share one route and never remount
  between them, and its own [다시 열기] button deliberately re-sends the exact
  same param while already here — both need the open action to fire again,
  not just once at mount.

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
      below) that only REACTS to `handledRaw` having changed; it never
      decides anything itself.
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

  DEFAULT `isMatch` WIDENED TO "any non-empty string" (owner report, 2026-10:
  "할 일 창이 자동으로 열릴 때도 있고 안 열릴 때도 있다") — it used to require
  the LITERAL `'1'`. This file's own re-fire-on-reappear design (above) and
  TutorialOverlay's own [다시 열기] both assume the param gets STRIPPED before
  a repeat request arrives, so a GENUINE repeat of the exact same `'1'` is
  comparing against `null`, not the previous `'1'` — that part was already
  correct. The actual gap: a navigation to a URL that is BYTE-FOR-BYTE
  IDENTICAL to the one react-router already has (one is possible any time a
  caller recomputes its own request from the SAME inputs — a step the user
  re-enters, or two [다시 열기] clicks before the first request's own strip
  effect has run) can be a complete NO-OP at the router level: `location`
  never changes, so NOTHING here ever sees a new `raw` to react to in the
  first place — widening `isMatch` cannot fix THAT by itself. The real fix
  (TutorialOverlay.jsx's own `requestNonceRef`) is sending a value that is
  NEVER repeated across two real requests, which only works if every
  CONSUMER here accepts something other than the literal `'1'` — hence this
  widening. Every existing non-tutorial caller that only ever sends `'1'`
  (none do today, but nothing stops one from existing later) is unaffected —
  `'1'.length > 0` still matches.
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

  // THE FIRE — see this file's own header for why this lives in an effect
  // instead of inline above. Keyed on `handledRaw` alone (not `onFire`, see
  // header): React only runs this when that value actually changes, which
  // is exactly once per raw value the render-time step above decided on —
  // including a REPEAT occurrence of the identical string after it went
  // back to `null` in between (TUT-05's own [다시 열기] relies on this), since
  // that round trip is still two distinct transitions of `handledRaw`, not
  // one.
  useEffect(() => {
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
