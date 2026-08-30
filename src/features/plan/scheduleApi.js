/*
  OP functions for personal-schedule blocks (ST-F1-04 — PLAN-08 create, PLAN-17
  edit). Each maps 1:1 to an endpoint; consumers (TanStack hooks) call ONLY these.
  Same DEV mock-fallback rule as planApi/taskApi: real path in prod, mock only on a
  genuine network error, so the mock→real switch is a base-URL change only.

  실서버 대조 (2026-08-29, 팀장 보고 "주간계획 화면에서 일정 추가가 안 된다"):
  이 파일의 두 함수 모두 실서버 계약과 어긋나 있었다. 화면·훅·mock은 예전부터
  써 온 "평평한" 로컬 shape를 그대로 쓰고, 서버로 나가는 몸체만 여기서 번역한다
  — settingsApi가 BASELINE sentinel을 번역하는 것과 같은 자리, 같은 이유다
  (호출부를 전부 고치면 mock 경로가 같이 깨진다).
*/

import { apiClient } from '../../api/client'
import { withDevFallback } from './planApi'
import { mockBackend } from './planFixtures'

/*
  실서버 PlanBlockCreateRequest (weeklyplan/dto):

      { blockType, taskId?, schedule?: {title, estimatedMinutes, priority, memo},
        startAt, endAt }

  SCHEDULE 블록의 일정 필드는 **중첩 `schedule` 객체**다. 우리가 보내던 평평한
  {title, estimatedMinutes, priority, memo}는 서버에서 그냥 무시되고
  `req.schedule() == null` 이라 PlanBlockService가 422
  invalidField("schedule","required")로 떨군다 — 즉 실서버에서 일정 추가는
  지금까지 100% 실패했다. `status`도 요청 필드가 아니다(서버가 SCHEDULED로
  규정). DEV mock은 평평한 shape를 기대하므로 mock 인자는 건드리지 않는다.
*/
function toBlockCreateBody(body) {
  const { blockType, startAt, endAt, title, estimatedMinutes, priority, memo, taskId } = body
  if (blockType !== 'SCHEDULE') {
    // TASK 배치는 taskId만 쓴다(평평한 그대로가 이미 계약과 같다).
    return { blockType, taskId, startAt, endAt }
  }
  return {
    blockType: 'SCHEDULE',
    startAt,
    endAt,
    schedule: {
      title,
      estimatedMinutes: estimatedMinutes ?? null,
      priority: priority ?? null,
      // 빈 메모는 아예 안 보낸다 — 서버는 담겨 온 값을 그대로 저장하므로
      // ''를 넣으면 "빈 문자열 메모"가 생긴다(미입력과 다른 상태).
      memo: memo?.trim() ? memo : null,
    },
  }
}

/**
 * OP-SCHED-CREATE → POST /weekly-plans/{id}/blocks (blockType=SCHEDULE, PLAN-08).
 * 로컬(평평한) shape를 받아 계약(중첩 schedule)으로 번역해 보낸다 —
 * toBlockCreateBody 헤더 참고. Returns { planBlockId, scheduleId, ... }.
 */
export function postScheduleBlock(weeklyPlanId, body) {
  return withDevFallback(
    () => apiClient.post(`/weekly-plans/${weeklyPlanId}/blocks`, toBlockCreateBody(body)),
    () => mockBackend.createScheduleBlock(weeklyPlanId, body),
  )
}

/*
  실서버 ScheduleUpdateRequest (schedule/dto)가 받는 건 딱 다섯이다:

      { title?, estimatedMinutes?, priority?, memo?, version }   ← version 필수

  - `startAt`/`endAt`은 편집 대상이 아니다("시각은 블록 이동 소관"). 담겨 가도
    Jackson이 조용히 버리지만, 보내면 계약을 오해한 코드로 남으므로 뺀다.
  - `status`도 편집 경로가 아니다.
  - `version`이 없으면 @NotNull → 400. 우리 로컬 블록 shape에 version이 실려
    있으면 그대로 싣는다.

  ⚠ 알려진 서버측 공백(BE-2에 보고): GET /weekly-plans 응답의 PlanBlock에는
  scheduleId만 있고 일정의 `version`이 없다. GET /schedules/{id}도 계약에
  없다. 즉 지금 계약만으로는 클라이언트가 version을 얻을 방법 자체가 없어
  일정 "편집"은 실서버에서 여전히 400이 난다 — 생성 경로(위)와 달리 FE에서
  닫을 수 없는 구멍이라 그대로 남긴다. mock에는 version이 있어 DEV에서는
  동작한다.
*/
function toScheduleUpdateBody(patch) {
  const { title, estimatedMinutes, priority, memo, version } = patch
  const request = { title, estimatedMinutes, priority, memo }
  if (version != null) request.version = version
  return request
}

/**
 * OP-SCHED-UPDATE → PATCH /schedules/{scheduleId} (PLAN-17). 계약이 받는
 * 필드만 추려 보낸다 — toScheduleUpdateBody 헤더 참고.
 */
export function patchSchedule(scheduleId, patch) {
  return withDevFallback(
    () => apiClient.patch(`/schedules/${scheduleId}`, toScheduleUpdateBody(patch)),
    () => mockBackend.updateSchedule(scheduleId, patch),
  )
}
