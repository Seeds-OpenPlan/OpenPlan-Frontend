/*
  문의 카테고리 (owner feedback #9 — 문의 작성 폼에 카테고리 select 추가).
  [가정] — 실 Swagger에 이 필드가 있는지/값 집합이 무엇인지 확인되지 않아
  이 PR이 고른 4종(계정/기능/버그/기타)이다. TicketCreateForm(select 옵션)와
  TicketContent(라벨 표시)가 이 하나의 카탈로그만 참조하므로, 실제 값 집합이
  확정되면 이 배열 하나만 바꾸면 된다(P4 grep 1곳 원칙과 같은 이유).
*/
export const TICKET_CATEGORIES = [
  { value: 'ACCOUNT', label: '계정' },
  { value: 'FEATURE', label: '기능' },
  { value: 'BUG', label: '버그' },
  { value: 'OTHER', label: '기타' },
]

export function ticketCategoryLabel(value) {
  return TICKET_CATEGORIES.find((c) => c.value === value)?.label ?? value
}
