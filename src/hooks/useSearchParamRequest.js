import { useEffect, useState } from 'react'

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

  Split in two for `react-hooks/set-state-in-effect` (this codebase's lint
  config rejects calling setState synchronously inside a `useEffect` body —
  only a plain `setSearchParams` call, a browser-history write, is exempt,
  since an effect really is the right place to talk to an EXTERNAL system
  like the URL, per that rule's own guidance):
    - `onFire` runs DURING RENDER, guarded by comparing the param's raw value
      against the last one we already acted on — React's own "adjusting state
      when a value changes" pattern (the exact shape ProjectsPage's own
      `tabResolvedForId` already uses for a different seam).
    - Stripping the param from the URL is a SEPARATE effect that only runs
      once `onFire` has actually happened for the CURRENT raw value — not
      keyed off the raw searchParams value directly, so a param that hasn't
      met `ready` yet is left alone instead of being stripped before it ever
      got a chance to fire.
*/
export function useSearchParamRequest(
  searchParams,
  setSearchParams,
  paramName,
  { ready = true, isMatch = (raw) => raw === '1', onFire } = {},
) {
  const raw = searchParams.get(paramName)
  const [handledRaw, setHandledRaw] = useState(null)

  if (raw !== handledRaw) {
    if (raw != null && isMatch(raw) && ready) {
      setHandledRaw(raw)
      onFire(raw)
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
