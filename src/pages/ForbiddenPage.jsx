import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../components/common/Button'
import { LockIcon } from '../components/common/statusIcons'
import { systemMessages } from '../constants/systemMessages'

/*
  SCR-403 (ui-spec §2). Reached via the `/403` route (the session guard throws
  redirect('/403') on a 403, story §2.4) or a future FE id-validation defense
  (NFR-030). Visually distinct from SCR-404 — a lock glyph and its own copy — so
  "no access" is never mistaken for "not found" (AC-4).

  The reason text comes from `location.state.reason` (mapped from
  details.reason) when present; otherwise the default body. Real consumers land
  in ST-F1-15; the routing contract is fixed now.
*/
const m = systemMessages.forbidden

function ForbiddenPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const headingRef = useRef(null)
  const reason = location.state?.reason

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  // "접근 가능한 화면으로" → nearest valid screen (previous entry if any, else
  // home). Home is always a distinct, explicit action.
  const goAccessible = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/')
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <LockIcon className="text-danger-600" size={64} />
      <h1 ref={headingRef} tabIndex={-1} className="text-heading font-bold text-balance outline-none">
        {m.title}
      </h1>
      <p className="max-w-[42ch] text-body text-text-muted">{reason ?? m.body}</p>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row-reverse">
        <Button variant="primary" size="lg" onClick={() => navigate('/')}>
          {m.home}
        </Button>
        <Button variant="secondary" size="lg" onClick={goAccessible}>
          {m.back}
        </Button>
      </div>
    </div>
  )
}

export default ForbiddenPage
