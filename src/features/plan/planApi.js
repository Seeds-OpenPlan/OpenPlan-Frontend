/*
  OP functions for the weekly plan (ux-flow-map §2, api-contracts §2.7). Each maps
  1:1 to an endpoint. Consumers (the TanStack Query hooks) call ONLY these — never
  apiClient directly — so the OP↔endpoint mapping lives in exactly one place.

  DEV fallback: on a network error, OR on a 404 from an endpoint the local BE
  has not implemented yet (E-COM-004), the call is served from the in-memory
  mock backend so the screen is buildable before BE-1's Swagger is up. In
  production (or against any reachable server) the real path runs untouched,
  keeping the mock→real switch a base-URL change only (build-plan §3).
*/

import { apiClient } from '../../api/client'
import { mockBackend } from './planFixtures'
import { clampPriority } from './planPlacement'
import { UNSPECIFIED_CONFLICT_CODE, violationCatalog, violationSeverity } from './violationMessages'

// Run the real call; in DEV, fall back to the mock for (a) a genuine network
// failure (no server) or (b) a 404 with code E-COM-004 — Spring's generic
// "no handler for this route" response, which is what the local BE returns
// for an endpoint it hasn't implemented yet (some routes, e.g. dashboard/
// stats/weekly-plans, are still mock-only while auth/projects/users are real).
// Any OTHER real HTTP error (4xx/5xx) propagates unchanged so error handling
// and rollback are exercised against real responses. Exported so sibling OP
// modules (taskApi) share one definition of the mock-fallback rule.
//
// TRADE-OFF: this is a DEV-only convenience, and it is intentionally coarse —
// on an IMPLEMENTED endpoint, a genuine "resource not found" 404 that happens
// to also carry E-COM-004 gets masked by the mock too, instead of surfacing as
// a real error. That's accepted because (1) prod never takes this branch, and
// (2) for any endpoint the local BE hasn't implemented, the mock IS the
// source of truth in dev, so hiding its 404 is the point, not a bug.
export async function withDevFallback(realCall, mockCall) {
  try {
    return await realCall()
  } catch (error) {
    const isUnimplementedEndpoint = error?.status === 404 && error?.code === 'E-COM-004'
    const shouldFallback = error?.isNetwork || isUnimplementedEndpoint
    if (import.meta.env.DEV && shouldFallback) return mockCall()
    throw error
  }
}

/**
 * Normalize a server week payload to the camelCase shape the UI reads. Tolerates
 * either snake_case (server) or camelCase (mock) so the exact envelope field
 * casing — unconfirmed until Swagger — is absorbed in this one adapter.
 */
function normalizeBlock(b) {
  return {
    planBlockId: b.planBlockId ?? b.plan_block_id,
    blockType: b.blockType ?? b.block_type,
    title: b.title,
    tone: b.tone ?? null,
    status: b.status,
    taskId: b.taskId ?? b.task_id ?? null,
    scheduleId: b.scheduleId ?? b.schedule_id ?? null,
    startAt: b.startAt ?? b.start_at,
    endAt: b.endAt ?? b.end_at,
    // SCHEDULE-block extras (PLAN-17 편집 프리필); null on TASK blocks.
    memo: b.memo ?? null,
    // NOT run through snapDuration (planTime.js): unlike a TASK's estimate,
    // this field never feeds a block start/end computation — a SCHEDULE's
    // own startAt/endAt come from the user's time-of-day picks, each
    // independently snapped (see ScheduleForm's own `snapMinutes` calls) — so
    // it sits outside this invariant's actual scope (block times).
    estimatedMinutes: b.estimatedMinutes ?? b.estimated_minutes ?? null,
    // Folded to the 1~3 the server accepts: this value prefills 일정 편집's own
    // 우선순위 select and is re-sent on save (see clampPriority's header).
    priority: clampPriority(b.priority, null),
    // TASK-block project link (PLAN-12 프로젝트에서 보기); null when unknown.
    projectId: b.projectId ?? b.project_id ?? null,
    projectName: b.projectName ?? b.project_name ?? null,
  }
}

function normalizeWeek(w) {
  return {
    weeklyPlanId: w.weeklyPlanId ?? w.weekly_plan_id,
    weekStartDate: w.weekStartDate ?? w.week_start_date,
    weekEndDate: w.weekEndDate ?? w.week_end_date,
    status: w.status ?? 'DRAFT',
    version: w.version ?? 1,
    totalPlannedMinutes: w.totalPlannedMinutes ?? w.total_planned_minutes ?? 0,
    unplacedCount: w.unplacedCount ?? w.unplaced_count ?? 0,
    validation: w.validation ?? { blockCount: 0, warningCount: 0 },
    blocks: (w.blocks ?? []).map(normalizeBlock),
  }
}

/*
  AVAILABILITY SHAPE (실서버 확인, 2026-07-29). The server speaks
    { patterns: [{weekday:'MON', startTime:'09:00:00', endTime:'18:00:00', isActive}],
      weeklyTotalMinutes }
  while everything above this adapter — planGeometry's column windows, the
  settings screen's own draft, availabilityHelpers — speaks a BARE ARRAY of
  `{weekday, startMinutes, endMinutes, isActive}`. Two mismatches, both here:

  1. the `{patterns}` envelope. The old code handed the whole object to
     `.map()`, which is a TypeError, not an empty list — the availability query
     REJECTED against a real server, which is why 온보딩 가용시간 단계 never
     became ready and its [다음] did nothing.
  2. `HH:mm:ss` vs minutes-since-midnight. Sending minutes back made the PUT
     400 (`startTime 널이어서는 안됩니다`), and 온보딩's [다음] only advances
     after that save resolves — so the step could not be passed at all.

  `weekday` needs no translation: both sides use the same 'MON'…'SUN' keys.
  The DEV mock still answers in the FE's own shape (a bare array of minutes),
  so both directions accept either and only convert what's actually foreign.
*/
function minutesFromTime(value) {
  if (typeof value !== 'string') return null
  const [h, m] = value.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}

function timeFromMinutes(minutes) {
  const total = Number.isFinite(minutes) ? minutes : 0
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

function normalizeAvailability(payload) {
  const patterns = Array.isArray(payload) ? payload : (payload?.patterns ?? [])
  return patterns.map((a) => ({
    weekday: a.weekday,
    startMinutes: a.startMinutes ?? a.start_minutes ?? minutesFromTime(a.startTime ?? a.start_time),
    endMinutes: a.endMinutes ?? a.end_minutes ?? minutesFromTime(a.endTime ?? a.end_time),
    isActive: a.isActive ?? a.is_active ?? true,
  }))
}

// A day the user switched OFF still has to carry times: the server requires
// startTime/endTime on all seven rows (@NotNull), and `isActive:false` is what
// actually turns the day off. Falls back to the same 09:00-18:00 the settings
// screen shows for an all-off week, so an off day can never serialize as null.
const DEFAULT_START_MINUTES = 9 * 60
const DEFAULT_END_MINUTES = 18 * 60

function serializeAvailability(patterns) {
  return (patterns ?? []).map((p) => ({
    weekday: p.weekday,
    startTime: timeFromMinutes(p.startMinutes ?? DEFAULT_START_MINUTES),
    endTime: timeFromMinutes(p.endMinutes ?? DEFAULT_END_MINUTES),
    isActive: p.isActive ?? true,
  }))
}

/** OP-PLAN-GETWEEK → GET /weekly-plans?weekStartDate= */
export function getWeek(weekStartDate) {
  return withDevFallback(
    () => apiClient.get('/weekly-plans', { params: { weekStartDate } }),
    () => mockBackend.getWeek(weekStartDate),
  ).then(normalizeWeek)
}

/** GET /users/me/availabilities (read side of the availability contract). */
export function getAvailability() {
  return withDevFallback(
    () => apiClient.get('/users/me/availabilities'),
    () => mockBackend.getAvailability(),
  ).then(normalizeAvailability)
}

/**
 * Block write → PATCH /plan-blocks/{id}. `patch` carries startAt/endAt (and,
 * for a week-boundary move, __targetWeek so the mock can migrate stores; the
 * real server infers the target week from start_at).
 */
export function patchBlock(planBlockId, patch) {
  // __targetWeek is a client-only hint for the mock's cross-week migration; the
  // real server infers the target week from start_at, so strip it before PATCH.
  const serverPatch = { ...patch }
  delete serverPatch.__targetWeek
  return withDevFallback(
    () => apiClient.patch(`/plan-blocks/${planBlockId}`, serverPatch),
    () => mockBackend.patchBlock(planBlockId, patch),
  )
}

/**
 * 가용 저장 → PUT /users/me/availabilities (full replace — exactly 7 patterns).
 * Body rows are serialized to the server's `startTime/endTime` time strings;
 * the mock keeps receiving the FE's own minute shape (see normalizeAvailability).
 */
export function putAvailabilities(patterns) {
  return withDevFallback(
    () => apiClient.put('/users/me/availabilities', { patterns: serializeAvailability(patterns) }),
    () => mockBackend.putAvailabilities(patterns),
  ).then(normalizeAvailability)
}

/**
 * Block delete → DELETE /plan-blocks/{id}. Used by both PLAN-18 (일정 삭제) and
 * PLAN-16 (배치 해제): a SCHEDULE block is deleted; a TASK block is removed and its
 * task returns to the unplaced backlog (the server decides by block type).
 */
export function deleteBlock(planBlockId) {
  return withDevFallback(
    () => apiClient.delete(`/plan-blocks/${planBlockId}`),
    () => mockBackend.deleteBlock(planBlockId),
  )
}

// --- ST-F1-05: validation dry-run · week confirm --------------------------------

/*
  SCHEMA CONFIRMED (W3, 검증 도메인 정합 — BE PR #19, ADR-0013 / openapi.yaml
  ValidationIssue, 2026-08-04; BE-1 openapi is authoritative, this endpoint
  itself is still [미구현] — no controller serves it yet, so this stays an
  ADAPTER+MOCK alignment, wired live once BE opens the route):

    validationIssueId: uuid | null   dry-run은 무영속이라 항상 null
    ruleId:    V1_OVERLAP | V2_FIXED_CONFLICT | V3_CAPACITY_EXCEEDED |
               V4_OUT_OF_AVAILABILITY | V5_OUT_OF_WBS | V6_AFTER_DUE_DATE |
               V7_BUFFER_SHORTAGE
    severity:  BLOCK | WARNING
    planBlockId: uuid | null   쌍 규칙(V1·V2)에서는 대표(UUID 오름차순 첫) 블록
    counterpartId: uuid | null 쌍 규칙의 상대 — V1=다른 plan_block, V2=fixed_schedule
    taskId:    uuid | null
    weekday:   string | null  (DayOfWeek 직렬화, 서버 기본 Jackson 규약상 "MONDAY" 전체
               영문명 — FE 자체 표기 'MON'..'SUN'과 다르다, 아래 normalizeWeekday)
    reason:    string          규칙 근거 문구 — violationMessages.js의 message()가
               텍스트를 못 만들 때만 폴백으로 쓴다(그 파일 자신의 violationCopy 주석 참고)

  ADR-0013 쌍 규칙 규약: V1_OVERLAP·V2_FIXED_CONFLICT는 무순서 쌍당 1건만 나온다.
  **V2의 counterpartId는 plan_block이 아니라 fixed_schedule id다** — 블록 강조
  목록에 그대로 섞으면 존재하지 않거나 엉뚱한 블록을 가리키므로, 아래
  normalizeIssue는 V1_OVERLAP일 때만 counterpartId를 targetBlockIds에 합친다.

  이 어댑터는 여전히 관대하다(옛 키도 계속 수용) — "openapi와 실서버가 다르다"를
  이미 한 번 겪었다(파일 자신의 기존 관례). `code`/`rule`/`ruleCode`는 실서버가
  아직 한 번도 쓴 적 없는 이전 세대 추측 필드명이지만, 지우지 않는다.
*/

// Envelope keys that are structure, not copy variables. Everything NOT in here
// becomes a `params` entry, so a rule that starts sending a new variable needs no
// adapter change — only the catalog message that reads it.
const ISSUE_STRUCTURE_KEYS = new Set([
  'id',
  'issueId',
  'validationIssueId',
  'code',
  'rule',
  'ruleCode',
  'ruleId',
  'severity',
  'targetBlockIds',
  'target_block_ids',
  'blockIds',
  'block_ids',
  'planBlockId',
  'counterpartId',
  'taskId',
  'weekday',
  'reason',
  'params',
])

// Server DayOfWeek serializes as the full English enum name (Jackson default —
// confirmed no custom enum module in the BE, see planApi.js's own W3 header) —
// "MONDAY".."SUNDAY" — while this app's own convention everywhere else
// (WEEKDAY_KEYS, planTime.js) is the 3-letter 'MON'..'SUN'. Tolerant of an
// already-short value (a future BE change, or this file's own mock) and of an
// unrecognized one (passthrough — better than silently dropping a real weekday
// the UI could still show as raw text).
const FULL_WEEKDAY_TO_KEY = {
  MONDAY: 'MON',
  TUESDAY: 'TUE',
  WEDNESDAY: 'WED',
  THURSDAY: 'THU',
  FRIDAY: 'FRI',
  SATURDAY: 'SAT',
  SUNDAY: 'SUN',
}
function normalizeWeekday(raw) {
  if (!raw) return null
  return FULL_WEEKDAY_TO_KEY[raw] ?? raw
}

// Recognizes the server's own BLOCK/WARNING vocabulary (and this app's older
// mock convention, 'blocking'/'warning' lowercase — both compare
// case-insensitively) and maps it to the internal 'blocking'/'warning' words.
// Returns null for anything else (missing, or a genuinely unrecognized
// string) so the caller knows there is no server verdict to defer to and must
// fall back to the catalog.
function normalizeServerSeverity(raw) {
  const s = String(raw ?? '').trim().toLowerCase()
  if (s === 'block' || s === 'blocking') return 'blocking'
  if (s === 'warning' || s === 'warn') return 'warning'
  return null
}

/**
 * Normalize one validation issue. The response shape is only pinned down to
 * "issues: []" by the spec, so this adapter is deliberately tolerant: it accepts
 * either an explicit `params` object or the copy variables spread at the top
 * level, and either a single target id or a list. Everything the copy catalog
 * needs ends up under `params`; everything the UI needs to point at a block ends
 * up in `targetBlockIds`.
 *
 * SEVERITY IS SERVER-AUTHORITATIVE (W3 2차 리뷰 — reverses this function's own
 * prior rule). The save gate (PLAN-28) exists to keep the user from confirming
 * a plan the SERVER will reject, so the server's own BLOCK/WARNING verdict must
 * win whenever it sends one — a known code's client-catalog classification is
 * now only the FALLBACK for when the server doesn't say (an old mock response,
 * a partial one). The previous rule ("catalog wins for a known code") had it
 * backwards: if the server ever classifies a rule differently than this file's
 * own table (e.g. treats V6_AFTER_DUE_DATE as BLOCK where the catalog still
 * says warning), that used to produce `blockingCount:0` while the server's own
 * `savable` said false — a save button left OPEN for a plan the server was
 * always going to reject, with no on-screen reason why. COPY IS UNCHANGED BY
 * THIS: violationCopy still resolves label/message/hint purely by `code`
 * (violationDefinition), so a rule whose SEVERITY got overridden here still
 * shows its real catalog explanation, never a generic one — only which side
 * of the save gate it lands on can change, never what it says.
 */
function normalizeIssue(raw, index) {
  // `ruleId` first (the confirmed real field — see this file's own W3 header);
  // the three legacy names are kept as a fallback chain, not replaced, per this
  // adapter's own "stay tolerant" rule.
  const code = raw.ruleId ?? raw.code ?? raw.rule ?? raw.ruleCode ?? 'UNKNOWN'
  const rawTargets =
    raw.targetBlockIds ??
    raw.target_block_ids ??
    raw.blockIds ??
    raw.block_ids ??
    (raw.planBlockId ? [raw.planBlockId] : [])
  // Array.isArray guard, not a bare .filter: a server sending a single id as a
  // STRING (or an object) would otherwise throw here, and a throw in this
  // adapter turns a perfectly good validation response into a "검증 실패", which
  // is the one state where the gate has the least information to work with.
  let targetBlockIds = Array.isArray(rawTargets)
    ? rawTargets.filter(Boolean)
    : [rawTargets].filter((id) => typeof id === 'string' && id.length > 0)
  // Pair-rule counterpart (ADR-0013) — ONLY for V1_OVERLAP, whose counterpart is
  // ANOTHER PLAN BLOCK and therefore belongs on the same highlight list as
  // `planBlockId`. V2_FIXED_CONFLICT's own counterpart is a fixed_schedule id —
  // deliberately NEVER added here, or a real server response would make this
  // adapter point the grid at a block that doesn't exist (or, worse, an
  // unrelated one that happens to share that id). Harmless no-op when
  // `targetBlockIds` already came from the mock's own convenience field above
  // (already contains both ids) — this only matters once a real server, which
  // sends planBlockId/counterpartId but never targetBlockIds, answers.
  if (code === 'V1_OVERLAP' && raw.counterpartId && !targetBlockIds.includes(raw.counterpartId)) {
    targetBlockIds = [...targetBlockIds, raw.counterpartId]
  }
  const params =
    raw.params ??
    Object.fromEntries(Object.entries(raw).filter(([key]) => !ISSUE_STRUCTURE_KEYS.has(key)))

  // Server verdict wins when present; the catalog (via violationSeverity, which
  // itself falls back to unknownViolation for an unrecognized code) is the
  // fallback for when the server didn't classify this issue at all — see this
  // function's own SEVERITY doc block above.
  const serverSeverity = normalizeServerSeverity(raw.severity)
  const severity = serverSeverity ?? violationSeverity(code, raw.severity)

  // DEV-only mismatch alarm (never shown to the user — a console warning, not
  // a banner): if the server actually SENT a severity for a rule this table
  // claims to know, and the two disagree, this catalog is simply wrong for
  // that rule and needs updating — silently accepting the server's override
  // forever would mean nobody ever notices the table drifted. `violationCatalog`
  // (not `violationDefinition`) is checked directly so this only fires for a
  // TRUE known-code mismatch, never for the generic unknownViolation fallback.
  if (import.meta.env.DEV && serverSeverity && violationCatalog[code] && serverSeverity !== violationCatalog[code].severity) {
    console.warn(
      `[validation] severity mismatch for ${code}: server says ${serverSeverity}, ` +
        `catalog says ${violationCatalog[code].severity} — using the server's value ` +
        `(catalog copy still applies); update violationMessages.js's table`,
    )
  }

  return {
    // A stable key for the list. The server may not send an id, so a code+index
    // composite is the fallback — issues are re-created wholesale per dry-run,
    // never patched in place, so index stability within one response is enough.
    id: raw.id ?? raw.issueId ?? raw.validationIssueId ?? `${code}-${index}`,
    code,
    severity,
    targetBlockIds,
    // Structural fields the real contract promises but no UI reads yet (W3) —
    // exposed on the normalized shape so a future consumer (e.g. a day-level
    // banner for the weekday-only V3/V4 rules — see this file's own W3 header)
    // doesn't need its own second normalizeIssue.
    counterpartId: raw.counterpartId ?? null,
    taskId: raw.taskId ?? null,
    weekday: normalizeWeekday(raw.weekday),
    reason: raw.reason ?? null,
    params,
  }
}

/**
 * Normalize a `{ issues, savable? }` payload into what the UI consumes. Exported
 * because the SAME shape arrives by two routes: the dry-run response, and a save
 * 409's `details.issues` (AC-4) — both must produce identical panel rows and
 * counts.
 *
 * `blockingCount`/`warningCount` are DERIVED here rather than read from the
 * payload: the spec does not promise per-severity counts, and deriving keeps
 * them consistent with the client-side severity table the save gate uses.
 *
 * `savable` (W3, ADR-0013 — "savable = 차단 0건이면 true"): the server now sends
 * this directly. Preferred when present (a real boolean — `typeof` guard, not
 * just truthiness, so a literal `false` is never mistaken for "absent"),
 * because the server is the authority on what actually blocks a save; falls
 * back to `blockingCount === 0` when absent (every mock response today, and any
 * older server that hasn't caught up) — same derivation this codebase already
 * used before `savable` existed, so the mock-only path is byte-for-byte
 * unchanged. The two are DEFINED to always agree per ADR-0013's own wording, so
 * there is no real precedence conflict to resolve — if that ever stops being
 * true, this is the one place to start trusting `savable` over the derived
 * count (flagged here for whoever hits that case first).
 */
export function normalizeValidationPayload(payload) {
  const issues = (payload?.issues ?? []).map(normalizeIssue)
  const blockingCount = issues.filter((i) => i.severity === 'blocking').length
  return {
    issues,
    blockingCount,
    warningCount: issues.filter((i) => i.severity !== 'blocking').length,
    savable: typeof payload?.savable === 'boolean' ? payload.savable : blockingCount === 0,
  }
}

/**
 * OP-PLAN-VALIDATE → POST /weekly-plans/{weeklyPlanId}/validation-issues (dry-run;
 * writes nothing). Body carries the LOCAL block set so the check reflects the
 * user's unsaved draft, not the last persisted plan.
 *
 * ENDPOINT NOTE: the FE-1 작업지시 writes this as `.../validations`; the BE 명세서
 * (07번) says `.../validation-issues` and that spec is authoritative.
 *
 * STATUS BRANCHES ARE RESULTS, NOT FAILURES. The spec lists 200 검증 통과 · 206
 * 일부 블록만 통과 · 409 일정 충돌 발견 as three outcomes of the SAME successful check.
 * axios resolves 2xx only, so 200/206 arrive here normally but 409 arrives as a
 * rejection — and rejecting it would be a silent, dangerous mistranslation: the
 * caller treats a rejection as "검증 못 함", keeps its last known counts (often
 * zero) and leaves the save button enabled. A 409 means the OPPOSITE of clean, so
 * it is converted back into a result here:
 *   409 + details.issues → those issues, exactly like a 200 body
 *   409 without issues   → one UNSPECIFIED_CONFLICT_CODE issue, which is blocking,
 *                          so the gate closes even though nothing can be pointed at
 * "without issues" covers BOTH a missing/non-array `details.issues` AND an EMPTY
 * array — a 409 saying "conflict found" alongside `issues: []` is the server
 * confirming a conflict while failing to list it, not confirming there is none.
 * Treating `[]` as "zero issues" would derive `blockingCount: 0` from a
 * rejection whose entire premise was 충돌 발견, silently reopening the save
 * gate on the exact response meant to close it.
 * Every other status still rejects and is handled as a genuine failure upstream.
 */
export function validatePlan(weeklyPlanId, blocks) {
  const body = {
    blocks: (blocks ?? []).map((b) => ({
      planBlockId: b.planBlockId,
      blockType: b.blockType,
      title: b.title,
      taskId: b.taskId ?? null,
      scheduleId: b.scheduleId ?? null,
      startAt: b.startAt,
      endAt: b.endAt,
      status: b.status,
    })),
  }
  return withDevFallback(
    () => apiClient.post(`/weekly-plans/${weeklyPlanId}/validation-issues`, body),
    () => mockBackend.validatePlan(weeklyPlanId, body.blocks),
  ).then(normalizeValidationPayload, (error) => {
    if (error?.status !== 409) throw error
    const issues = error?.details?.issues
    // `.length > 0`, not just `Array.isArray`: an EMPTY array is still "without
    // issues" (see the comment above) and must fall through to the blocking
    // fallback rather than normalizing to zero issues.
    return normalizeValidationPayload({
      issues: Array.isArray(issues) && issues.length > 0 ? issues : [{ code: UNSPECIFIED_CONFLICT_CODE }],
    })
  })
}

/**
 * OP-PLAN-SAVEWEEK → PUT /weekly-plans/{weeklyPlanId} with status:"CONFIRMED"
 * (PLAN-03 저장/확정). Returns { weeklyPlanId }.
 *
 * ENDPOINT NOTE: the FE-1 작업지시 writes this as POST `.../confirmation`; the BE
 * 명세서 (07번) says PUT `/weekly-plans/{id}` and that spec is authoritative.
 *
 * TWO DIFFERENT 409s can come back here, and they mean different things
 * (실서버 카탈로그 대조 2026-08-03 — ErrorCode.java/errors.properties):
 *   E-PLAN-004 — NOT a race. The server re-ran validation on confirm and found
 *     blocking items still present ("차단 항목이 남아 있어 저장할 수 없습니다",
 *     PLAN-28's own rule enforced server-side). `details.issues` carries the
 *     current blocking list, same shape as the dry-run's own body.
 *   E-COM-006 — the actual optimistic-lock race (another tab/device confirmed
 *     a newer version first), `details.latest` carrying the newer version.
 * The caller (WeeklyPage.handleSaveError) re-syncs the review panel from
 * `details.issues` when present, or re-runs the dry-run when it isn't, for
 * BOTH — but must not describe one as the other to the user.
 */
export function saveWeek(weeklyPlanId, { weekStartDate, weekEndDate, totalPlannedMinutes }) {
  const body = { weekStartDate, weekEndDate, totalPlannedMinutes, status: 'CONFIRMED' }
  return withDevFallback(
    () => apiClient.put(`/weekly-plans/${weeklyPlanId}`, body),
    () => mockBackend.saveWeek(weeklyPlanId, body),
  )
}
