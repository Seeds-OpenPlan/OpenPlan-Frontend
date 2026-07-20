import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/common/Button'
import { NotFoundIcon } from '../components/common/statusIcons'
import { systemMessages } from '../constants/systemMessages'

/*
  SCR-404 (ui-spec §1). Rendered by the router `*` catch-all, kept nested inside
  AppLayout so the header/tabs stay visible and the user doesn't lose their place.

  Two actions: "홈으로 이동" (primary) and "이전 화면으로 가기" (secondary). Back
  goes to the previous entry when history exists; on direct entry
  (history.length <= 1) it quietly falls back to home with no warning — a silent
  success is the frictionless path (AC-2). Distinct from SCR-403 by icon/copy
  (a search glyph vs a lock) so the two states are never confused.
*/
const m = systemMessages.notFound

function NotFoundPage() {
  const navigate = useNavigate()
  const headingRef = useRef(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  const goBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/')
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <NotFoundIcon className="text-text-muted" size={64} />
      <h1 ref={headingRef} tabIndex={-1} className="text-heading font-bold text-balance outline-none">
        {m.title}
      </h1>
      <p className="max-w-[42ch] text-body text-text-muted">{m.body}</p>
      {/* Desktop shows back then home; on mobile the primary (home) reads first
          via source order for thumb-reach priority (ui-spec §1). */}
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row-reverse">
        <Button variant="primary" size="lg" onClick={() => navigate('/')}>
          {m.home}
        </Button>
        <Button variant="secondary" size="lg" onClick={goBack}>
          {m.back}
        </Button>
      </div>
    </div>
  )
}

export default NotFoundPage
