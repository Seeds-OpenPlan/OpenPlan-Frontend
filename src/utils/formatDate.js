/*
  Small shared date-formatting helpers for ST-F1-15's read-mostly lists
  (notifications, 문의, 공지) — none of these screens edit a date, they only
  display a server timestamp, so a single `toLocaleDateString`/`toLocaleTimeString`
  pair covers every caller instead of each page writing its own copy of
  SettingsAccountPage.jsx's `formatDateKO`.
*/

/** "2026년 7월 24일" — day-level precision (문의 작성일, 공지 게시일). */
export function formatDateKO(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
}

/** "7월 24일 09:10" — minute-level precision (알림 발생 시각, 대부분 오늘 안에서
 * 여러 건이 온다는 전제라 연도는 생략해 짧게 유지한다). */
export function formatDateTimeKO(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  const date = d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
  const time = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  return `${date} ${time}`
}
