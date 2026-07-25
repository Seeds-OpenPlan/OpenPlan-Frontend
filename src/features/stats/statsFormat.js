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

/** 18 → "+18%", -4 → "-4%", 0 → "0%". */
export function formatSignedPercent(value) {
  if (!value) return '0%'
  return `${value > 0 ? '+' : ''}${value}%`
}
