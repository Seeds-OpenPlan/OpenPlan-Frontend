import { version } from '../../package.json'

/*
  Single source for the app version string the SCR-SET hub footer shows
  (오너 리뷰 2차, item E — reference PNG's "OpenPlan v1.0.0"). Reads
  package.json directly (Vite inlines JSON imports at build time) so a real
  version bump never needs a second place updated.

  package.json's version is still the untouched "0.0.0" scaffold default —
  showing that literally would read as a broken build to an end user, so it
  is special-cased to an explicit "MVP" label until the project's first real
  bump. Once package.json actually carries a real version, this collapses to
  a plain `v${version}` with no special case left to remove.
*/
export const APP_VERSION_LABEL = version === '0.0.0' ? 'v0.1.0 (MVP)' : `v${version}`

export default APP_VERSION_LABEL
