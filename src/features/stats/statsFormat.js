/*
  Number formatting for the 통계 screen ONLY. Deliberately separate from
  planTime.js's formatDurationKO ("2시간 30분"): the Desktop.Status.png
  reference renders every duration on this screen in the compact "24.5h" /
  "+1h 14m" numeral style (dense stat cards and a bar list have no room for
  Korean words per row), so matching it pixel-for-pixel means a distinct
  formatter, not a variant of the Korean one used everywhere else in the app.
*/

/** 1470 → "24.5h", 480 → "8h" (whole hours never show a trailing ".0"). */
export function formatHoursDecimal(minutes) {
  const rounded = Math.round((minutes / 60) * 10) / 10
  return `${rounded}h`
}

/**
 * Signed hour/minute delta for the 편차 분석 panel: 74 → "+1h 14m", 120 → "+2h",
 * -30 → "-30m", 0 → "0m" (no sign on exactly zero — there is no "+0m" reading
 * that means anything different from "0m").
 */
export function formatSignedHm(minutes) {
  if (!minutes) return '0m'
  const sign = minutes > 0 ? '+' : '-'
  const abs = Math.abs(minutes)
  const h = Math.floor(abs / 60)
  const m = Math.round(abs % 60)
  if (h && m) return `${sign}${h}h ${m}m`
  if (h) return `${sign}${h}h`
  return `${sign}${m}m`
}

/**
 * 0~100 스케일 비율을 정수 퍼센트로. 서버의 completionRate/varianceRate는
 * `(a * 100.0) / b` 나눗셈 결과라 20.833333333333332처럼 배정밀도 자릿수가
 * 그대로 실려 온다 — 화면에 붙이기 전에 반드시 여기를 거친다.
 */
export function formatPercent(value) {
  return `${Math.round(value)}%`
}

/** 18 → "+18%", -4.2 → "-4%", 0 → "0%". */
export function formatSignedPercent(value) {
  const rounded = Math.round(value)
  if (!rounded) return '0%'
  return `${rounded > 0 ? '+' : ''}${rounded}%`
}
