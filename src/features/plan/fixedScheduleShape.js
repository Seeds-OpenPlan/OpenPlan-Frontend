/*
  Shared fixed-schedule shape helpers — `normalizeFixedSchedule` and
  `activeInWeek`. Split out of fixedScheduleApi.js (BE #90) because BOTH
  fixedScheduleApi.js (the settings-screen CRUD + the undefined-field fallback
  GET) and planApi.js (the plan grid's primary source, `GET /weekly-plans`'s
  own `fixedSchedules` field) need to normalize the exact same server shape
  the exact same way, and planApi.js cannot import fixedScheduleApi.js without
  creating a real import cycle at the TOP LEVEL (fixedScheduleApi.js already
  imports `withDevFallback` from planApi.js). This module depends on nothing
  but planTime.js's pure helpers, so either OP module can import it with no
  cycle at all — one normalization, two call sites, always in agreement.
*/

import { minutesFromTime, addDaysISO } from './planTime'

/**
 * Normalize a fixed schedule to the camelCase shape the grid AND the ST-F1-12
 * settings screen both read. version/effectiveFrom/effectiveTo/source/status
 * (ST-B2-12's fixed_schedules columns) are additive — of these, only `version`
 * is actually consumed anywhere in this codebase today (the optimistic-lock
 * check on update). `effectiveFrom`/`effectiveTo`/`source`/`status` are kept
 * normalized here so the shape round-trips cleanly (the mock backend already
 * threads them through create/update), but NO current screen reads or writes
 * them — neither the ST-F1-06 grid nor FixedScheduleForm (ST-F1-12's own CRUD
 * form only edits title/weekday/start/end minutes). They're reserved fields,
 * unused/on hold until a future story actually surfaces them in the UI.
 */
export function normalizeFixedSchedule(f) {
  return {
    fixedScheduleId: f.fixedScheduleId ?? f.fixed_schedule_id,
    title: f.title,
    weekday: f.weekday,
    // 🔴 서버는 `startTime`/`endTime`을 시각 문자열("09:00:00")로 보낸다 —
    //    `startMinutes`라는 이름은 계약에 없다(openapi FixedScheduleInput). 이걸
    //    변환하지 않아 화면 전체가 undefined를 받았고, 시:분 계산이 `NaN:NaN`으로
    //    렌더됐다. 가용 시간(normalizeAvailability)이 이미 쓰는 것과 같은 폴백
    //    사슬을 그대로 따른다 — 목(분 단위)과 실서버(시각 문자열)를 둘 다 받는다.
    startMinutes: f.startMinutes ?? f.start_minutes ?? minutesFromTime(f.startTime ?? f.start_time),
    endMinutes: f.endMinutes ?? f.end_minutes ?? minutesFromTime(f.endTime ?? f.end_time),
    // Defaults to true: a server that doesn't yet understand week exceptions
    // (or omits the field) should render every fixed schedule as ACTIVE, not
    // silently ghost all of them — an unrecognized false would be the wrong
    // failure direction (hiding a real conflict), so only an explicit false wins.
    activeThisWeek: (f.activeThisWeek ?? f.active_this_week) !== false,
    // 🔴 서버가 보내는 이름은 `startDate`/`endDate`다. 이름이 어긋나 항상 null이
    //    됐고, 그래서 **하루짜리 일정이 매주 반복으로 보였다** — 외부 캘린더에서
    //    반영한 일정(ExternalEventToFixedSchedule이 startDate=endDate=그 날짜로
    //    하루에 가둔다)이 모든 같은 요일에 뜨던 원인이다.
    effectiveFrom: f.effectiveFrom ?? f.effective_from ?? f.startDate ?? f.start_date ?? null,
    effectiveTo: f.effectiveTo ?? f.effective_to ?? f.endDate ?? f.end_date ?? null,
    source: f.source ?? 'MANUAL',
    status: f.status ?? 'ACTIVE',
    version: f.version ?? 1,
    // Settings-list-only convenience (see planFixtures.getFixedSchedulesAll's
    // own comment) — undefined on the week-scoped grid read, never a false
    // "no conflict" claim it can't back up.
    hasConflict: f.hasConflict ?? undefined,
  }
}

/**
 * 이 주에 실제로 나타나야 하는 고정 일정인가.
 *
 * 🔴 고정 일정은 기본적으로 **요일 반복**이지만, 외부 캘린더에서 반영한 일정은
 * `startDate=endDate=그 날짜`로 하루에 갇혀 있다(백엔드 ExternalEventToFixedSchedule).
 * 그 경계를 보지 않으면 하루짜리 약속이 **모든 같은 요일**에 나타난다 — 그 위에
 * 계획을 얹지 못하게 막으므로 조용한 오표시가 아니라 실제 배치 제약이 된다.
 *
 * 경계가 둘 다 없으면 무기한 반복(손으로 만든 고정 일정)이라 항상 보인다.
 * ISO 날짜 문자열(YYYY-MM-DD)은 사전순 비교가 곧 시간순이라 그대로 비교한다.
 */
export function activeInWeek(schedule, weekStartISO) {
  if (!weekStartISO) return true
  const { effectiveFrom, effectiveTo } = schedule
  if (!effectiveFrom && !effectiveTo) return true
  const weekEndISO = addDaysISO(weekStartISO, 6)
  if (effectiveFrom && effectiveFrom > weekEndISO) return false
  if (effectiveTo && effectiveTo < weekStartISO) return false
  return true
}
