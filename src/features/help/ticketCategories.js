/*
  문의 카테고리 (owner feedback #9 — 문의 작성 폼에 카테고리 select 추가).

  값 집합은 이제 [가정]이 아니라 실서버 계약이다 (2026-07-29 대조):
  CreateTicketRequest의 `@Pattern(BUG|ACCOUNT|PLAN|ETC)` — 이 넷 외의 값을
  보내면 등록이 거부된다. 이 PR이 처음 고른 4종은 ACCOUNT/FEATURE/BUG/OTHER
  였는데, FEATURE·OTHER 두 값이 서버에 없어 그대로 두면 문의 등록이 항상
  실패했다. 라벨은 그 서버 값에 맞춰 '기능'→'계획'으로 바뀐다(FEATURE를
  ETC로 몰아 넣는 쪽은 사용자가 고른 분류를 조용히 버리는 셈이라 택하지
  않았다). TicketCreateForm(select)과 TicketContent(라벨)가 이 카탈로그
  하나만 참조하므로 값이 또 바뀌면 이 배열만 고치면 된다.

  이미 저장된 예전 값(FEATURE/OTHER)은 ticketCategoryLabel의 폴백이 원문
  그대로 보여 준다 — 목록에서 라벨이 빈칸이 되지는 않는다.
*/
export const TICKET_CATEGORIES = [
  { value: 'ACCOUNT', label: '계정' },
  { value: 'PLAN', label: '계획' },
  { value: 'BUG', label: '버그' },
  { value: 'ETC', label: '기타' },
]

export function ticketCategoryLabel(value) {
  return TICKET_CATEGORIES.find((c) => c.value === value)?.label ?? value
}
