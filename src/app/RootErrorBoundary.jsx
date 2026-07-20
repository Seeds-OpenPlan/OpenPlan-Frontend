import { ErrorState } from '../components/common/ErrorState'

/*
  Root route ErrorBoundary — the global fallback for unhandled render/loader
  runtime errors (SYS-02 AC-5). A JSX wrapper so router.js can stay a plain .js
  module (no JSX) while still mounting the ErrorState page variant.

  Only errors WITHOUT a designated surface reach here: the session guard routes
  403→/403 and 404→* explicitly, so those never fall through to this generic
  fallback (story §2.4).
*/
export function RootErrorBoundary() {
  return <ErrorState variant="page" />
}

export default RootErrorBoundary
