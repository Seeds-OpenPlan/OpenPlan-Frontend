/*
  THE single catalog for validation-violation copy (RB-PLAN-02 · PLAN-24~27).
  Every violation string the user can read — panel item, block chip, header badge
  — resolves through here, so a copy change is a one-file change and the P4 grep
  audit finds exactly one hit per string (J1). Do NOT hardcode a violation phrase
  anywhere else, and do not duplicate systemMessages copy into this file (the two
  catalogs are audited separately — see systemMessages.js's header).

  CODE NUMBERING IS AN ESTIMATE. V1 (겹침) and V2 (고정 일정 충돌) are pinned by the
  stories that name them (PLAN-24/25, and ST-F1-06 AC-3 which calls the fixed-
  schedule violation "V2"). V3~V7 follow RB-PLAN-02's own enumeration order
  (일정 겹침 · 마감일 이후 배치 · 가용 시간 초과 · 가용 시간 밖 배치 · 버퍼 부족 ·
  WBS 기간 밖 배치) with V2 inserted. When BE-1 publishes the real rule codes, THIS
  TABLE is the only thing that changes — every consumer looks a code up here.

  SEVERITY is client-authoritative for known codes: the save gate (PLAN-28) must
  be deterministic, so a known code's blocking/warning class comes from this table
  and not from the response. An UNKNOWN code falls back to `unknownViolation`,
  which honors the server's severity (defaulting to the safer 'warning') so a rule
  BE adds before FE knows about it still surfaces instead of crashing the panel.

  Copy rules applied (ui-spec §0.2 §COPY + NFR-017): every message names the
  violation TYPE and its TARGET in text, so the meaning never depends on the
  block's stripe color alone. `hint` is the recovery path — what the user can do —
  because a violation the user can't act on is just noise.
*/

import { formatDurationKO } from './planTime'

// Korean object/subject particles depend on whether the preceding syllable ends
// in a consonant (받침). Titles are user data, so picking the particle at render
// time is the only way the copy reads correctly ("대시보드가" vs "회의록이").
// Non-Hangul endings (English, digits) fall back to the no-받침 form, which is the
// conventional choice for Latin text in Korean UI copy.
function hasBatchim(word) {
  const last = String(word ?? '').trim().slice(-1)
  if (!last) return false
  const code = last.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return false
  return (code - 0xac00) % 28 !== 0
}

/** `josa('대시보드', '이', '가')` → '대시보드가'. */
function josa(word, withBatchim, withoutBatchim) {
  return `${word}${hasBatchim(word) ? withBatchim : withoutBatchim}`
}

// Params arrive from the server (or the DEV mock) and any of them can be missing
// on a partially-populated issue, so each message substitutes a neutral noun
// rather than rendering "undefined" (defensive: the panel must never look broken).
const someBlock = (title) => title ?? '대상 블록'
const someTime = (range) => range ?? '해당 시간대'
const someDay = (label) => label ?? '해당 요일'
const someDate = (date) => date ?? '배치된 날짜'

/**
 * @typedef {Object} ViolationDefinition
 * @property {string} code
 * @property {'blocking'|'warning'} severity
 * @property {string} label      Short type name — the text half of the block chip.
 * @property {(params: Object) => string} message  Type + target, always both.
 * @property {string} hint       How to resolve it.
 */

/** @type {Record<string, ViolationDefinition>} */
export const violationCatalog = {
  // PLAN-24 — 차단. Two plan blocks claim the same time; the plan is not runnable.
  V1: {
    code: 'V1',
    severity: 'blocking',
    label: '일정 겹침',
    message: ({ blockTitle, otherTitle, timeRange }) =>
      `${josa(someBlock(blockTitle), '과', '와')} ${josa(someBlock(otherTitle), '이', '가')} ` +
      `${someTime(timeRange)}에 겹칩니다`,
    hint: '한쪽 블록을 다른 시간대로 옮기거나 삭제하면 해결됩니다',
  },

  // PLAN-25 — 차단. A fixed schedule is an immovable constraint, so a plan block
  // sitting on it can't run; ST-F1-06's "이번 주만 비활성화" is the other way out.
  V2: {
    code: 'V2',
    severity: 'blocking',
    label: '고정 일정 충돌',
    message: ({ blockTitle, otherTitle, timeRange }) =>
      `${josa(someBlock(blockTitle), '이', '가')} 고정 일정 ` +
      `${josa(someBlock(otherTitle), '과', '와')} ${someTime(timeRange)}에 겹칩니다`,
    hint: '계획 블록을 다른 시간대로 옮기거나, 고정 일정을 이번 주만 비활성화할 수 있습니다',
  },

  // RB-PLAN-02 마감일 이후 배치 — 경고. Still savable: the user may have moved the
  // deadline in their head, so this informs rather than blocks.
  V3: {
    code: 'V3',
    severity: 'warning',
    label: '마감일 이후 배치',
    message: ({ blockTitle, dueDate, placedDate }) =>
      `${josa(someBlock(blockTitle), '이', '가')} 마감일 ${someDate(dueDate)} 이후인 ` +
      `${someDate(placedDate)}에 배치되어 있습니다`,
    hint: '마감일 전으로 옮기거나 태스크의 마감일을 조정해 주세요',
  },

  // PLAN-26 (초과) — 경고. A day's planned total exceeds that day's availability.
  V4: {
    code: 'V4',
    severity: 'warning',
    label: '가용 시간 초과',
    message: ({ dayLabel, overMinutes }) =>
      `${someDay(dayLabel)} 계획 시간이 가용 시간을 ` +
      `${overMinutes == null ? '초과합니다' : `${formatDurationKO(overMinutes)} 초과합니다`}`,
    hint: '블록을 다른 요일로 옮기거나 해당 요일의 가용 시간을 늘려 주세요',
  },

  // PLAN-26 (밖 배치) — 경고. The block sits outside the day's availability window
  // (or on a day with no active window at all).
  V5: {
    code: 'V5',
    severity: 'warning',
    label: '가용 시간 밖 배치',
    message: ({ blockTitle, dayLabel, timeRange }) =>
      `${josa(someBlock(blockTitle), '이', '가')} ${someDay(dayLabel)} 가용 시간 밖인 ` +
      `${someTime(timeRange)}에 배치되어 있습니다`,
    hint: '가용 시간 안으로 옮기거나 해당 요일의 가용 시간을 조정해 주세요',
  },

  // RB-PLAN-02 버퍼 부족 — 경고. Back-to-back blocks with almost no gap are the
  // usual reason a plan slips, so the copy states the measured gap.
  V6: {
    code: 'V6',
    severity: 'warning',
    label: '버퍼 부족',
    message: ({ blockTitle, otherTitle, gapMinutes }) =>
      `${josa(someBlock(blockTitle), '과', '와')} ${someBlock(otherTitle)} 사이 여유가 ` +
      `${gapMinutes == null ? '거의 없습니다' : `${formatDurationKO(gapMinutes)}뿐입니다`}`,
    hint: '두 블록 사이에 여유를 두면 앞 블록이 길어져도 계획이 밀리지 않습니다',
  },

  // PLAN-27 — 경고. The task is placed outside its WBS start/end range.
  // The story cites "결정문 §2 reason 템플릿" for this wording, but that decision
  // document is not in the repository, so this line is written in the same
  // type + target + range tone as the rest of the table; align it once the
  // 결정문 lands (this entry only).
  V7: {
    code: 'V7',
    severity: 'warning',
    label: 'WBS 기간 밖 배치',
    message: ({ blockTitle, wbsRange, placedDate }) =>
      `${josa(someBlock(blockTitle), '이', '가')} WBS 기간` +
      `${wbsRange ? `(${wbsRange})` : ''} 밖인 ${someDate(placedDate)}에 배치되어 있습니다`,
    hint: 'WBS 기간을 조정하거나 배치일을 기간 안으로 옮겨 주세요',
  },

  // Not a rule — the dry-run's 409 "일정 충돌 발견" with no itemized issues. It is
  // blocking because the response already told us the plan has a conflict; the
  // only thing missing is which block, so the copy says exactly that instead of
  // pretending to name a target. Keyed by UNSPECIFIED_CONFLICT_CODE below.
  CONFLICT_UNSPECIFIED: {
    code: 'CONFLICT_UNSPECIFIED',
    severity: 'blocking',
    label: '일정 충돌',
    message: () => '이 주간 계획에서 일정 충돌이 발견되었습니다',
    hint: '충돌한 항목을 아직 불러오지 못했습니다. 잠시 후 다시 확인해 주세요',
  },
}

/**
 * The dry-run answered "일정 충돌 발견" (HTTP 409) without itemizing what. There is
 * nothing to point at, but the plan is definitively NOT clean, so this stands in
 * as a real blocking issue: the gate closes and the panel says why it can't say
 * more. Only ever emitted for that response — never by a 200/206.
 */
export const UNSPECIFIED_CONFLICT_CODE = 'CONFLICT_UNSPECIFIED'

// Severity words meaning "this is only advisory". Compared case-insensitively:
// this codebase's own enums are upper-case (CONFIRMED/SCHEDULED), so BE is at
// least as likely to send "BLOCKING"/"WARNING" as the lower-case forms.
const WARNING_SEVERITY_WORDS = new Set(['warning', 'warn', 'info', 'notice', 'minor'])

/**
 * Fallback definition for a code this build doesn't know (BE ships a new rule
 * before FE learns about it). It renders a usable, non-crashing row.
 *
 * SEVERITY DEFAULTS TO 'blocking', deliberately. This value feeds a save gate,
 * and the two ways of being wrong are not symmetric: calling an unknown rule a
 * warning lets a genuinely broken plan be confirmed, while calling it blocking
 * only makes the user open the panel and read an unfamiliar row. So only an
 * explicitly advisory severity opens the gate; a missing or unrecognized one
 * closes it. Trade-off accepted knowingly: a new INFORMATIONAL rule that arrives
 * without a severity will block saving until its code is added to the catalog
 * above — the fail-safe direction, not an oversight.
 */
export function unknownViolation(code, severity) {
  return {
    code: code ?? 'UNKNOWN',
    severity: WARNING_SEVERITY_WORDS.has(String(severity ?? '').trim().toLowerCase())
      ? 'warning'
      : 'blocking',
    label: '검토 필요',
    message: ({ blockTitle }) => `${josa(someBlock(blockTitle), '을', '를')} 다시 확인해 주세요`,
    hint: '이 항목은 최신 검증 규칙에서 추가된 내용입니다',
  }
}

/** Look a code up; never returns undefined (see unknownViolation). */
export function violationDefinition(code, serverSeverity) {
  return violationCatalog[code] ?? unknownViolation(code, serverSeverity)
}

/**
 * Resolve one normalized issue into everything the UI renders for it. Consumers
 * (panel row, block chip, aria-label) all call THIS, so the type/target pairing
 * required by NFR-017 can't be forgotten at an individual call site.
 *
 * @param {{code:string, severity?:string, params?:Object}} issue
 * @returns {{code:string, severity:'blocking'|'warning', label:string, text:string, hint:string}}
 */
export function violationCopy(issue) {
  const def = violationDefinition(issue?.code, issue?.severity)
  return {
    code: def.code,
    severity: def.severity,
    label: def.label,
    text: def.message(issue?.params ?? {}),
    hint: def.hint,
  }
}

/** Severity for a code, without building the full copy (block marking, counts). */
export function violationSeverity(code, serverSeverity) {
  return violationDefinition(code, serverSeverity).severity
}

// Human names for the two severities. Used by the badges, the block chips and the
// save-gate copy so "차단"/"경고" is never spelled out ad hoc.
export const severityLabels = {
  blocking: '차단',
  warning: '경고',
}

/** Sort comparator: 차단 first (they're what actually blocks saving), then 경고. */
export function compareBySeverity(a, b) {
  const rank = (issue) => (violationSeverity(issue.code, issue.severity) === 'blocking' ? 0 : 1)
  return rank(a) - rank(b)
}

export default violationCatalog
