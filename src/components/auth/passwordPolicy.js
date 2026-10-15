/*
  비밀번호 정책 (AUTH-03 · AC5). Shared by SCR-AUTH-SIGNUP, SCR-AUTH-RESET,
  AND PasswordChangeDialog(ACCT-02) — all three screens set a brand-new
  password against the same rules, so the policy lives here ONCE rather than
  being re-typed per screen. Kept in its own (non-component) module, separate
  from PasswordChecklist.jsx, so that file can stay component-only
  (react-refresh/only-export-components).

  상한 72자(Thomas 리뷰 S1) — 계약은 서버의 `@Size(max=72)`
  (ChangePasswordRequest.java, SignupRequest.java 등 전부 동일)인데 지금까지
  클라이언트 쪽엔 상한 검사가 전혀 없었다. 그래서 73자 이상을 입력하면
  "충족" 체크리스트(하한 8자만 봄)는 전부 초록인데도 서버가 400(E-COM-001)으로
  거절하는, 사용자 입장에서 설명되지 않는 실패가 났다.

  별도 규칙 항목으로 추가하지 않고 기존 'length' 규칙의 테스트·라벨에
  합쳤다 — 상한만 따로 두면 그 규칙은 입력 전(빈 문자열)부터 항상 "충족"
  상태로 보여, 체크리스트에 처음부터 체크돼 있는 줄이 하나 생기는 어색한
  모양이 된다(하한 규칙은 반대로 입력 전엔 항상 "미충족"이라 자연스럽다).
  "8~72자" 라벨은 이 엔드포인트들의 인라인 오류 문구(예: PasswordChangeDialog의
  newPasswordError "8~72자")와도 이미 같은 표현이라 그대로 재사용했다.
*/
export const passwordPolicy = [
  { id: 'length', label: '8~72자', test: (pw) => pw.length >= 8 && pw.length <= 72 },
  { id: 'letter', label: '영문 포함', test: (pw) => /[a-zA-Z]/.test(pw) },
  { id: 'digit', label: '숫자 포함', test: (pw) => /[0-9]/.test(pw) },
  { id: 'special', label: '특수문자 포함', test: (pw) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pw) },
]

export function isPasswordValid(password) {
  return passwordPolicy.every((rule) => rule.test(password))
}
