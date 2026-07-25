/*
  비밀번호 정책 (AUTH-03 · AC5). Shared by SCR-AUTH-SIGNUP and
  SCR-AUTH-RESET — both screens set a brand-new password against the same
  rules, so the policy lives here ONCE rather than being re-typed per screen.
  Kept in its own (non-component) module, separate from PasswordChecklist.jsx,
  so that file can stay component-only (react-refresh/only-export-components).
*/
export const passwordPolicy = [
  { id: 'length', label: '8자 이상', test: (pw) => pw.length >= 8 },
  { id: 'letter', label: '영문 포함', test: (pw) => /[a-zA-Z]/.test(pw) },
  { id: 'digit', label: '숫자 포함', test: (pw) => /[0-9]/.test(pw) },
  { id: 'special', label: '특수문자 포함', test: (pw) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pw) },
]

export function isPasswordValid(password) {
  return passwordPolicy.every((rule) => rule.test(password))
}
