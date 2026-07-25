import { CheckCircleIcon } from '../common/statusIcons'
import { passwordPolicy } from './passwordPolicy'

/*
  비밀번호 충족 체크리스트 (AUTH-03 · AC5). Live-updating rule list rendered
  beside the password field on SCR-AUTH-SIGNUP/RESET — the rules themselves
  live in passwordPolicy.js (shared with those pages' own submit-time
  validation), this file only renders them.

  Each rule shows a filled check (met) or an empty ring (not yet) — never
  color alone (NFR-017): the icon SHAPE changes, not just its color, and the
  row text itself gets a subtle emphasis change as a secondary cue.
  `role="status"`/`aria-live="polite"` on the wrapping list announces changes
  as the user types, but only the icon's accessible name (via `sr-only` text
  per item) carries "충족"/"미충족" — not a decorative color.
*/
export function PasswordChecklist({ password }) {
  return (
    <ul role="status" aria-live="polite" className="flex flex-col gap-1">
      {passwordPolicy.map((rule) => {
        const met = rule.test(password)
        return (
          <li
            key={rule.id}
            className={[
              'flex items-center gap-1.5 text-caption',
              met ? 'text-success-700' : 'text-text-muted',
            ].join(' ')}
          >
            {met ? (
              <CheckCircleIcon size={14} className="shrink-0" />
            ) : (
              <span aria-hidden="true" className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-current" />
            )}
            <span>
              {rule.label}
              <span className="sr-only">{met ? ' 충족' : ' 미충족'}</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export default PasswordChecklist
