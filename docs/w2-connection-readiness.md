# W2 프론트↔백엔드 실연결 준비 맵

- **정본 근거**: `openapi.yaml` (백엔드 PR #11 `origin/docs/openapi-single-source`, `src/main/resources/static/openapi.yaml`, 2558줄). 아래 줄번호는 이 파일 기준.
- **대조 대상**: `D:\su\...\OpenPlan-Frontend\src\features\*/*Api.js` 13개 모듈 + `src/api/client.js` 응답 인터셉터.
- **작성일**: 2026-07-26. 읽기·분석만 수행(코드 무수정).
- **핵심 발견**: 프론트가 "정본"으로 삼아온 **07 API 명세서(CSV)** 와 리드가 1순위로 지정한 **openapi 단일소스가 여러 지점에서 정면 충돌**한다. 프론트는 CSV를 근거로 `validation-issues`/`PUT weekly-plans`/`PATCH .../selection` 등을 선택했는데, openapi 단일소스는 각각 `validations`/`POST .../confirmation`/`POST .../application`으로 **반대**를 말한다. 리드 지침상 openapi가 이긴다 → 이 항목들은 전부 프론트 수정 대상.

---

## 1. 요약 — 모듈별 연결 준비도(신호등)

| 모듈 | 신호 | 한 줄 요약 |
|---|---|---|
| `taskApi.js` (미배치·배치) | 🟡 | 경로 대부분 일치. 봉투(`r?.tasks`), `execution-records→execution-logs`, block-batch body(`placements→operations`) 조정 필요 |
| `fixedScheduleApi.js` | 🟡 | 경로 전부 일치. conflict-preview body `{candidate}` 래핑, `startTime/endTime`(분→time), version, `activeThisWeek` 출처 조정 |
| `scheduleApi.js` | 🟡 | `patchSchedule`에 **version 필수 누락** + startAt/endAt/status 미허용(일정 시간이동은 plan-blocks로) |
| `statsApi.js` | 🟡 | 경로 4개 전부 실재. 하지만 period/groupBy **enum 값 불일치**(week vs WEEKLY), 응답 shape(rows/slots) 전면 조정, time-pattern은 서버가 이미 4구간 집계 |
| `dashboardApi.js` | 🟡 | `/dashboard` **단일 GET 실재**(가정 아님!). 응답 필드명 전면 재매핑(statusBoard/priorityAction/riskIssues/todayBoard/…) |
| `onboardingApi.js` | 🟡 | progress는 실재하나 필드명(introDone 등) 재매핑. import-candidates/decisions는 **계약 부재** |
| `notificationsApi.js` | 🟡 | 경로 일치. 봉투(`r?.notifications`) + **meta.unreadCount 유실**(인터셉터가 meta 버림) + read-all 미구현 |
| `helpApi.js` | 🟠 | 경로 전부 오타 수준 불일치(`support-tickets→support/tickets`, `help-articles→support/help-articles`), 티켓 body `body→content`·email/attachments 미허용 |
| `authApi.js` | 🔴 | 경로 대부분 불일치(`login→sessions`, `signup→POST /users`, `logout→DELETE /auth/session`, password-reset token 위치). 게다가 4주차 전 **501 스텁**(x-auth-phase: WEEK4-STUB) |
| `settingsApi.js` | 🔴 | preferences PATCH→PUT, notification PATCH→PUT+`{settings}`, connections 경로 전면 상이(`/users/me/connections`→`/external-calendar-connections`), account/deactivation 경로 상이, availability-target **계약 부재** |
| `planApi.js` (검증·저장·주간) | 🔴 | getWeek 응답 **중첩 구조 미반영**(plan.* 아래로), validate 경로·body(`validations`/`virtualBlocks`), save는 **PUT 자체가 없음**→`POST .../confirmation` |
| `replanApi.js` | 🔴 | apply가 `PATCH .../selection {isSelected}`인데 실계약은 `POST .../application`(무body), generate는 body없이 3전략 한번에(`{baseline,options}`) |
| `projectApi.js` (핵심 CRUD) | 🟢 | 이미 실연결 완료(PR #27). 단, WBS/카테고리/구조화/스케줄 보조 함수는 🔴(아래 표) |

**연결 난이도 순서(쉬운→어려운)**: `notifications`·`fixedSchedule`(경로 일치, 봉투·소소한 body만) → `stats`·`dashboard`(경로 실재, 응답 재매핑) → `help`(경로 오타 교정) → `plan 배치(taskApi)` → `settings`·`plan 검증/저장` → `replan` → `auth`(스텁이라 4주차까지 보류).

### 가장 심각한 미스매치 Top 8
1. **`client.js` 401 갱신 경로 오류** — 인터셉터가 `POST /auth/refresh` 호출(client.js:130). 실계약은 `POST /auth/token-refresh`(openapi:84). 모든 API의 401 자동복구가 깨짐. **공용 인프라라 1건 고치면 전 모듈 효과**.
2. **`client.js`가 `meta`를 버림** — 성공 인터셉터가 `data.data ?? data`만 반환(client.js:117). openapi의 목록은 `{data:[...], meta:{page, unreadCount}}` 봉투(openapi:773,785). 프론트는 `meta.unreadCount`(알림 뱃지)·`meta.page`(페이지네이션)를 **영영 못 읽음**.
3. **목록 봉투 불일치(전 모듈 공통)** — 실서버 목록은 `data:[배열]`이라 인터셉터가 **벗겨진 배열**을 넘김. 그런데 프론트는 `r?.tasks`/`r?.projects`/`r?.notifications`/`r?.fixedSchedules`/`r?.articles`/`r?.groups` 등 **객체 키**를 기대 → 전부 빈 목록. (프로젝트에서 이미 터진 그 버그의 재발판. 최소 9개 함수 해당.)
4. **주간 계획 저장(save)에 해당 엔드포인트가 아예 없음** — `planApi.saveWeek`는 `PUT /weekly-plans/{id}`(planApi.js:291). openapi에 그 PUT은 **존재하지 않음**. 실계약은 `POST /weekly-plans/{planId}/confirmation`(무body, openapi:1502).
5. **getWeek 응답 중첩 미반영** — `normalizeWeek`가 `weeklyPlanId/status/version/unplacedCount/validation`을 **최상위**에서 읽음(planApi.js:69). 실 `WeeklyPlanView`는 `plan.{weeklyPlanId,status,version}`·`unassignedCount`·`validationSummary`로 중첩·개명(openapi:2355). 주간 화면 전체가 빈 값.
6. **재계획 apply 방식 반대** — `replanApi.selectReplanOption`은 `PATCH /replan-options/{id}/selection {isSelected:true}`(replanApi.js:84). 실계약은 `POST /replan-options/{optionId}/application`(무body, openapi:1743). generate도 body없이 3전략 한번에 반환하는데 프론트는 전략당 1회씩 3회 호출.
7. **auth 경로 대량 불일치 + 501 스텁** — `login→POST /auth/sessions`, `signup→POST /users`(+`termsAgreed` 필수), `logout→DELETE /auth/session`, `verifyEmail→POST /auth/email-verifications/confirmation`, `confirmPasswordReset→PATCH /auth/password-resets/{token}`(token은 경로, body는 `newPassword`). 게다가 sessions/token-refresh/users는 `WEEK4-STUB`(4주차 전 501) → 4주차 전엔 붙여도 501.
8. **settings 연동/기본값/알림 경로·메서드 전면 상이** — connections는 `/users/me/connections`가 아니라 `/external-calendar-connections`(openapi:549), preferences는 PATCH가 아니라 **PUT 전체교체**(openapi:466), notification은 PATCH 낱개가 아니라 **PUT `{settings:[]}`**(openapi:749). `/users/me/availability-target`은 openapi에 **부재**.

---

## 2. 시스템 전반(먼저 고치면 전 모듈에 효과)

| 이슈 | 근거 | 조치 |
|---|---|---|
| 401 갱신 경로 | client.js:130 `POST /auth/refresh` vs openapi:84 `/auth/token-refresh` | 인터셉터 경로 1줄 교정 |
| `meta` 유실 | client.js:117 `data.data ?? data` | 목록 소비 함수가 `meta`(unreadCount/page)를 필요로 하면 인터셉터/시그니처 재설계 필요 |
| 목록 봉투 = 벗겨진 배열 | 전 목록 endpoint `data:[...]`(예 openapi:970,1148,782) | 각 `getXxx`의 `.then((r)=>(r?.KEY??[]))`를 `.then((r)=>(Array.isArray(r)?r:(r?.KEY??[])))` 류로 통일 |
| 페이지네이션 | projects/tasks/notifications/tickets/announcements 모두 `Page/Size` 파라미터(openapi:773 등) | 프론트는 전량 로드 가정. 기본 페이지 크기로 잘릴 수 있음 — 협의 |
| 낙관적 락 `version` | project/task/schedule/fixed update가 `version` 필수(openapi:1031,1257,1687,1815) | 각 update body에 version 실림 확인. schedule은 **누락**(아래) |
| 에러 코드 | 프론트 planApi는 `E-COM-004`(미구현 404) 폴백에 의존(planApi.js:36). ErrorResponse는 `E-[A-Z]+-[0-9]{3}`(openapi:2070) | 실서버 구현 후엔 mock 폴백이 실오류를 가리지 않도록 정리(로드맵 "mock 폴백 정리"와 동일) |
| 우선순위 3단계 | BE 확인(2026-07-29): `1=높음 · 2=보통 · 3=낮음`, **4·5는 400** | ✅ 모든 폼은 이미 1~3만 제공. 위험은 **되돌려 보내는 값**(프로젝트 정보 PUT의 priority 재전송·프로젝트 복제·일정 편집 프리필)이라, 읽기 경계(normalize\*)에서 범위 밖 값을 가장 가까운 유효 등급으로 접는다 — `planPlacement.clampPriority` |
| openapi vs 실서버 | `PATCH /tasks/{id}/status`가 실제로는 openapi와 다른 body를 받는다(§3.2) | 이 문서의 "실 계약" 열은 openapi 기준. **BE가 실서버로 확인해 준 항목은 실서버가 정본**이며 그렇게 표기한다 |

---

## 3. 모듈별 상세

### 3.1 planApi.js (🔴 주간 계획·검증·저장)
| 프론트 호출 | 실 계약(openapi) | 미스매치 | 조치 |
|---|---|---|---|
| GET `/weekly-plans?weekStartDate` (js:95) | GET `/weekly-plans`(:1468) → `WeeklyPlanView` | 응답 shape: `weeklyPlanId/status/version`은 `plan.*`, `unplacedCount→unassignedCount`, `validation→validationSummary{blockCount,warningCount}`, blocks는 형제 배열(:2355) | `normalizeWeek`를 `view.plan.*` + 형제 필드로 재작성 |
| (주차 없을 때 생성) | POST `/weekly-plans {weekStartDate}` get-or-create(:1485) | 프론트 getWeek는 GET만; 실서버는 없으면 `plan:null` → **POST로 생성 필요** | getWeek에 null→POST 생성 경로 추가 |
| block 정규화 (js:48) | `PlanBlock`(:2342) | `tone/memo/estimatedMinutes/priority/projectName` 필드 **PlanBlock에 없음**; status enum `SCHEDULED/COMPLETED` | SCHEDULE 편집 프리필은 `/schedules/{id}` 별도 조회 필요할 수 있음 |
| GET `/users/me/availabilities` (js:101) | 동(:408) → `AvailabilityView{patterns,weeklyTotalMinutes}` | 패턴 필드 `startTime/endTime`(time 문자열)인데 프론트는 `startMinutes/endMinutes`(정수)(:84) | normalize에서 time↔분 변환 |
| PUT `/users/me/availabilities {patterns}` (js:127) | 동(:423), `patterns` **정확히 7개**, 항목은 `weekday/startTime/endTime/isActive` | 항목 필드 분→time, minItems/maxItems 7 | body 항목 변환 |
| PATCH `/plan-blocks/{id}` (js:119) | 동(:1639) `{startAt,endAt,targetWeekStartDate}` | 주차 이동 시 실서버는 **`targetWeekStartDate` 명시 필요**. 프론트는 `__targetWeek` 힌트를 지우고 아무것도 안 보냄("start_at으로 추론" 가정) | 주차이동 시 `targetWeekStartDate` 전송 |
| DELETE `/plan-blocks/{id}` (js:139) | 동(:1666) | 일치 | — |
| POST `/weekly-plans/{id}/validation-issues {blocks}` (js:264) | POST `/weekly-plans/{planId}/**validations**`(:1521) body `{virtualBlocks, virtualTaskEdits}` → `ValidationReport{savable,issues[]}` | **경로**(validation-issues→validations), **body 키**(blocks→virtualBlocks, 항목은 `PlanBlockInput`), 응답 `{issues}`→`ValidationReport`. 프론트의 409-변환 로직은 openapi가 200/`savable`로 주므로 재설계 | 경로·body·응답 전면 조정. issue는 `ruleId(V1_OVERLAP…)/severity(BLOCK/WARNING)/reason`(:2390) |
| PUT `/weekly-plans/{id}` status:CONFIRMED (js:291) | **PUT 없음.** POST `/weekly-plans/{planId}/confirmation`(무body, Idempotency-Key)(:1502) | 메서드·경로·body 전면. 409=`E-PLAN-004 details.issues` | `saveWeek`를 confirmation POST로 |

### 3.2 taskApi.js (🟡 미배치·배치)
| 프론트 호출 | 실 계약 | 미스매치 | 조치 |
|---|---|---|---|
| GET `/tasks?status=UNASSIGNED` (js:37) | 동(:1207) → `data:[Task]` | 봉투: `r?.tasks`→벗겨진 배열. Task 필드 `categoryName/wbsRange/version` | ✅ 처리됨 |
| GET `/tasks?projectId=` (프로젝트 스코프) | **`projectId` 쿼리 파라미터 없음** (BE 확인 2026-07-29) | 서버가 바인딩하지 않는 필터를 보내고 있었음 → 프로젝트 스코프가 걸린 적이 없다 | ✅ 파라미터 제거 + 클라이언트 필터(`status`도 방어적으로 재확인) |
| POST `/weekly-plans/{id}/blocks` (js:48) | 동(:1617) `PlanBlockInput{blockType,taskId,startAt,endAt}` | TASK는 `taskId` 필수, `title` 없음(조인 파생) | body를 PlanBlockInput로 |
| POST `/weekly-plans/{id}/auto-placements {priorityType}` (js:60) | 동(:1558) body `{taskIds?}` → `PlacementProposal{proposedBlocks,unplacedTaskIds,reason}` | body(`priorityType`→`taskIds`), 응답(`placements/unplaced`→`proposedBlocks/unplacedTaskIds`) | body·응답 재매핑 |
| POST `/weekly-plans/{id}/block-batches {placements}` (js:73) | 동(:1584) **`{operations:[{op:CREATE/MOVE/DELETE, block, planBlockId}]}` 필수** → `WeeklyPlanView` | body shape 전면 상이 | operations 배열로 재구성 |
| PATCH `/tasks/{id}/status` (js:83) | **실서버는 `{completed:boolean, version:number}`** (BE 확인 2026-07-29). openapi(:1278)의 `status` enum과 **불일치 — 실서버가 정본** | 둘 중 하나라도 빠지면 400. `version`은 태스크 조회 응답의 낙관적 잠금 카운터 | ✅ body 교체. 블록에는 태스크 version이 없어 caller가 못 줄 때는 `GET /tasks/{id}`로 읽어서 그대로 재전송 |
| POST `/tasks/{id}/execution-records` (js:95) | POST `/tasks/{taskId}/**execution-logs**`(:1330) | **경로**(records→logs), body **`result`(COMPLETED/DELAYED/ABORTED) 필수 누락**, `actualMinutes` 5분배수 | 경로+`result` 추가 |

### 3.3 scheduleApi.js (🟡)
| 프론트 호출 | 실 계약 | 미스매치 | 조치 |
|---|---|---|---|
| POST `/weekly-plans/{id}/blocks` SCHEDULE (js:19) | 동(:1617) | SCHEDULE은 `schedule:{title,estimatedMinutes,priority,memo}` **인라인 객체**로, `startAt/endAt`는 형제 | body를 PlanBlockInput 형태로(schedule 중첩) |
| PATCH `/schedules/{id}` (js:30) | 동(:1674) | **`version` 필수 누락**. `startAt/endAt/status`는 **미허용**(허용: title/estimatedMinutes/priority/memo). 시간이동은 plan-blocks PATCH 담당 | version 추가, 시간필드 제거 |

### 3.4 replanApi.js (🔴)
| 프론트 호출 | 실 계약 | 미스매치 | 조치 |
|---|---|---|---|
| POST `/weekly-plans/{id}/replan-options {strategyType}` (js:61) — 전략당 3회 | 동(:1704) **body 없음**, 응답 `{baseline:ReplanOption, options:[3]}` | 프론트는 body에 strategyType, 3회 호출; 실은 무body 1회로 baseline+3전략 반환. 응답 `replanOptions`→`{baseline,options}` | 1회 호출로 변경, 응답 재매핑 |
| PATCH `/replan-options/{id}/selection {isSelected:true}` (js:84) | POST `/replan-options/{optionId}/**application**`(무body)(:1743) → 최신 주간 | **메서드·경로·body 전면 상이** | POST application으로 |
| (list 없음이라 가정, js:16 주석) | GET `/weekly-plans/{planId}/replan-options` **실재**(:1726) | 프론트 가정("list 없음") 오류 — 새로고침 재조회 가능 | 필요 시 list 활용 |

### 3.5 fixedScheduleApi.js (🟡)
| 프론트 호출 | 실 계약 | 미스매치 | 조치 |
|---|---|---|---|
| GET `/fixed-schedules?status&weekStartDate` (js:63) | GET `/fixed-schedules?status`(:1761) → `data:[FixedSchedule]` | 봉투(`r?.fixedSchedules`); **`weekStartDate` 파라미터·`activeThisWeek` 필드는 이 엔드포인트에 없음** — `activeThisWeek`는 `WeeklyPlanView.fixedSchedules[]`에만 존재(:2373). 필드 `startTime/endTime`(time) vs `startMinutes/endMinutes` | 그리드용 주차 상태는 getWeek의 fixedSchedules에서 읽도록 재배선. 분↔time 변환 |
| POST `/fixed-schedules/{id}/week-exceptions {weekStartDate}` (js:78) | 동(:1836) | 일치(멱등 200/201) | — |
| DELETE `.../week-exceptions/{weekStart}` (js:94) | 동(:1868) | 일치(멱등 204) | — |
| GET `/fixed-schedules` (all) (js:108) | 동(:1761) | 봉투만 | 배열 처리 |
| POST `/fixed-schedules` (js:115) | 동(:1780) `FixedScheduleInput{title,weekday,startTime,endTime,startDate?,endDate?}` | 필드 `startTime/endTime`(time) vs 분, `startMinutes` 등 | payload 변환 |
| PATCH `/fixed-schedules/{id}` (js:127) | 동(:1800) `FixedScheduleInput + version 필수` | version 실림 확인 필요(주석엔 있음) | — |
| DELETE `/fixed-schedules/{id}` (js:135) | 동(:1828) | 일치 | — |
| POST `/fixed-schedules/conflict-previews` (js:150) | 동(:1880) body **`{candidate:{...}}` 래핑 필수** | 프론트는 candidate를 **최상위**로 보냄. 응답은 `data:[{weekStartDate, issues[]}]` | body를 `{candidate}`로 래핑 |

### 3.6 projectApi.js (🟢 핵심 CRUD 완료 / 🔴 보조 함수)
| 프론트 호출 | 실 계약 | 미스매치 | 조치 |
|---|---|---|---|
| GET/POST/GET/PATCH/DELETE `/projects…` (js:133~188) | openapi:952~1054 | 이미 연결됨(PR #27). PATCH는 **version 필수**(:1031). status는 `{status,version}` enum IN_PROGRESS/PAUSED/CLOSED(:1070) | 유지 |
| GET `/projects/{id}/tasks` (js:194) | 동(:1131) `data:[Task]` | 봉투 `r?.tasks` | 배열 처리 |
| GET `/tasks/{id}` (js:240) | 동(:1227) `Task` | Task 필드 `categoryName/wbsRange`; 프론트 `category/memo`는 존재 | normalize 맞춤 |
| PATCH `/tasks/{id}` (js:278) | 동(:1243) `TaskInput + version 필수` | **`version` 필수**, `categoryId`(uuid)—프론트 `category`(값). body는 title/memo/estimatedMinutes/priority/dueDate/categoryId | version·categoryId 반영 |
| DELETE `/tasks/{id}` (js:287) | 동(:1270) | 일치 | — |
| POST `/projects/{id}/tasks` (js:203) | 동(:1151) `TaskInput{title,estimatedMinutes 필수,…,categoryId}` | `estimatedMinutes` 필수(5분배수), `categoryId` | body 확인 |
| GET `/categories` (js:253) | GET `/**task-categories**`(:1361) `data:[TaskCategory{taskCategoryId,name,sortOrder}]` | **경로**(categories→task-categories) + 봉투(`r?.categories`) + 항목 필드 | 경로·봉투·필드 |
| PATCH `/tasks/{id}/schedule {plannedStartDate,plannedEndDate}` (js:352) | PUT `/tasks/{taskId}/**wbs-range** {startDate,endDate}`(:1303) | **메서드**(PATCH→PUT), **경로**(schedule→wbs-range), **body 키**(planned*→startDate/endDate) | 전면 조정 |
| GET `/projects/{id}/wbs` (js:335) | 동(:1407) `data:[WbsItem{wbsItemId,taskId,taskTitle,startDate,endDate}]` | 봉투(`r?.nodes`) + 필드(`title→taskTitle`, `plannedStartDate→startDate`) | 배열·필드 |
| GET `/projects/{id}/validation-issues` (js:301) | GET `/projects/{id}/**structure-warnings**`(:1443) `data:[{warningType,reason,action}]` | **경로** + 응답(`r?.issues`→배열, 필드 다름) | 경로·shape |
| POST `/projects/{id}/task-structuring-drafts` (js:312) | POST `/projects/{id}/**structuring-drafts**`(:1425) `data:[StructuringDraft]` | **경로**(task- 없음) + 응답(`{draftId,tasks}`→`[StructuringDraft{draftId,title,proposed*,reason}]`) | 경로·shape |
| POST `.../task-structuring-drafts/{draftId}/apply` (js:324) | **부재.** 채택은 POST `/projects/{id}/tasks/bulk {tasks:[{TaskInput,draftId}]}`(:1172) | 별도 apply 엔드포인트 없음 — bulk로 대체 | bulk 채택 방식으로 재작성 |
| duplicateProject 합성 (js:372) | POST `/projects/{id}/duplications {newName?}`(:1106) + `/duplication-preview`(:1083) **실재** | 프론트는 create+task+schedule 수동 합성. 실 단일 엔드포인트 존재 | 단일 duplications로 교체 가능 |

### 3.7 statsApi.js (🟡 경로 실재, 값·shape 조정)
| 프론트 호출 | 실 계약 | 미스매치 | 조치 |
|---|---|---|---|
| GET `/stats/summaries?period` (js:57) | 동(:1936) `period` **필수 WEEKLY/MONTHLY** → `StatsSummary` | **enum 값**(`week/month/last3months/all` vs `WEEKLY/MONTHLY`) — last3months/all은 서버에 없음. 응답 `completionRate/varianceRate/totalEstimated/Actual/empty`(프론트 `totalTime/avgDeviation/…`와 상이) | period 값 매핑·기간 축소 협의, normalize 재작성. 빈상태는 `empty` 플래그(204 아님) |
| GET `/stats/deviations?groupBy&period` (js:104) | 동(:1954) `period`·`groupBy` **필수 PROJECT/CATEGORY** → `DeviationReport{rows[]}` | enum 대문자(`project`→`PROJECT`), 응답 `r?.groups`→`rows`(필드 `groupId/groupName/estimatedMinutes/actualMinutes/deviationMinutes/deviationRate`) | 값·shape 재매핑 |
| GET `/stats/time-patterns?period` (js:133) | 동(:1973) → `TimePatternReport{slots:[{slot:DAWN/MORNING/AFTERNOON/NIGHT,totalCount,completedCount,completionRate}]}` | 서버가 **이미 4구간 집계 완료**. 프론트는 `efficiencyByHour`(시간별)에서 클라 집계 — 소스 필드·집계 위치 모두 상이 | 클라 집계 제거, slots 직접 소비 |
| GET `/stats/correction-proposals?category` (js:26) | 동(:1991) 파라미터 `categoryId(uuid)/projectId/estimatedMinutes` → `CorrectionProposal{proposedEstimatedMinutes,basis,sampleSize}` | 파라미터명(`category` 값→`categoryId` uuid), 응답(`suggestedMinutes`→`proposedEstimatedMinutes`, `sampleSize` 동일, `basis`) | 파라미터·필드 재매핑 |

### 3.8 dashboardApi.js (🟡 단일 GET 실재)
| 프론트 호출 | 실 계약 | 미스매치 | 조치 |
|---|---|---|---|
| GET `/dashboard` (js:49) | 동(:1919, **단일 GET 확정** — 가정 아님) `?baseDate?` → `DashboardView` | 응답 필드 전면 개명: 프론트 `weeklyStatus/priorityAction/todayExecution/weeklyImpact/risks` ↔ 실 `statusBoard/priorityAction/todayBoard/weeklyImpactProjects/riskIssues`(:2446). priorityAction 하위(`actionType/reason/routePath`) | `normalizeDashboard` 재작성. 부분실패 sentinel 가정은 openapi에 근거 없음 — 협의 |

### 3.9 onboardingApi.js (🟡/🔴)
| 프론트 호출 | 실 계약 | 미스매치 | 조치 |
|---|---|---|---|
| GET `/users/me/onboarding-progress` (js:36) | 동(:349) `OnboardingProgress` | **필드 전면 상이**: 프론트 `onboardingCompleted/introSeen/currentStep/profile/tutorialCompleted/tutorialSkipped/tutorialStep/version` ↔ 실 `introDone/profileDone/availabilityDone/fixedScheduleDone/tutorialDone/calendarSyncDone/tutorialSampleProjectId`(:2101). version 없음 | normalize 전면 재작성 |
| PATCH `/users/me/onboarding-progress` (js:46) | 동(:364) body=OnboardingProgress | 부분 merge vs 전체 스키마 | body 키 맞춤 |
| GET `/onboarding/import-candidates` (js:54) | **부재.** (openapi엔 `/onboarding/contents`, `/external-calendar-connections/{id}/events`(:670)만) | 계약 부재 — 외부캘린더 events가 후보 원천일 가능성 | BE 협의(§4) |
| POST `/onboarding/import-decisions` (js:64) | **부재.** (반영은 `/external-calendar-events/{eventId}/application`(:690) 형태) | 계약 부재 | BE 협의(§4) |

### 3.10 notificationsApi.js (🟡)
| 프론트 호출 | 실 계약 | 미스매치 | 조치 |
|---|---|---|---|
| GET `/notifications` (js:32) | 동(:767) `data:[Notification]`, `meta.unreadCount` | 봉투(`r?.notifications`→배열) + **unreadCount는 meta**(인터셉터가 버림). Notification 필드 `notificationType`(프론트 `type`), `body` 없음 | 배열 처리 + 미읽음수 획득 경로(인터셉터) |
| PATCH `/notifications/{id}/read` (js:41) | 동(:790) 200(멱등, 본문 명세 없음) | 프론트는 응답을 `normalizeNotification` — 서버 본문 미보장 | 응답 소비 방식 확인 |
| (read-all 미구현) | PATCH `/notifications/read-all`(:799) 실재 | 프론트에 함수 없음 | 필요 시 추가 |

### 3.11 helpApi.js (🟠 경로 오타 수준)
| 프론트 호출 | 실 계약 | 미스매치 | 조치 |
|---|---|---|---|
| GET `/support-tickets` (js:44) | GET `/**support/tickets**`(:807) `data:[SupportTicket]` | 경로(`-`→`/`) + 봉투(`r?.tickets`). SupportTicket `supportTicketId/content/hasAnswer`(프론트 `ticketId/body`) | 경로·봉투·필드 |
| GET `/support-tickets/{id}` (js:53) | `/support/tickets/{ticketId}`(:855) | 경로 | — |
| POST `/support-tickets` (js:63) | POST `/support/tickets`(:829) required `[category,title,content]` | 경로 + body(`body`→`content`), **email/attachments 미허용**, category enum `BUG/ACCOUNT/PLAN/ETC` | 경로·body |
| GET `/help-articles?query` (js:73) | GET `/**support/help-articles**?keyword&category`(:872) | 경로 + 파라미터명(`query`→`keyword`) + 봉투(`r?.articles`) | 경로·파라미터 |
| GET `/announcements` (js:83) | 동(:910) `data:[Announcement]` | 봉투(`r?.announcements`). 필드 `announcementId/publishedStartAt`(프론트 `noticeId/publishedAt`) | 봉투·필드 |
| GET `/announcements/{id}` (js:91) | 동(:933) | 필드 개명만 | normalize |

### 3.12 authApi.js (🔴 경로 대량 + 4주차 스텁)
| 프론트 호출 | 실 계약 | 미스매치 | 조치 |
|---|---|---|---|
| POST `/auth/login` (js:45) | POST `/**auth/sessions**`(:25) → `SessionInfo`(쿠키발급, 토큰 body 없음) | 경로. 401/409(비활성)/410(삭제) 분기. **WEEK4-STUB(501)** | 경로+세션 흐름 |
| POST `/auth/signup` (js:53) | POST `/**users**`(:166) required `[email,password,termsAgreed]` | 경로 + `name` 미허용·`termsAgreed` 필수. 응답 `{userId,emailVerificationRequired}` | 경로·body |
| POST `/auth/email-verifications {token}` (js:61) | POST `/auth/email-verifications/**confirmation** {token}`(:217) | verify는 confirmation 경로. `/auth/email-verifications`는 **발송**(body `email`) | 경로 분리 |
| POST `/auth/email-verifications/resend` (js:69) | POST `/auth/email-verifications {email}`(:201, 재발송 겸용) | 경로(resend 없음 — 발송과 동일) | 경로 |
| POST `/auth/password-resets {email}` (js:77) | 동(:235) | 일치 | — |
| PATCH `/auth/password-resets {token,password}` (js:85) | PATCH `/auth/password-resets/**{token}** {newPassword}`(:251) | token은 **경로**, body는 `newPassword` | 경로·body |
| POST `/auth/logout` (js:98) | **DELETE `/auth/session`**(:76) | 메서드·경로 | DELETE session |
| POST `/auth/reactivations {email}` (js:112) | 동(:135) body `{email,password}` 또는 `{reactivationTicket}` | 대체로 일치(자격증명/티켓) | 확인 |
| `client.js` refresh (js:130) | POST `/auth/token-refresh`(:84) | 경로(`/auth/refresh`→`/auth/token-refresh`) | §2 참조 |

### 3.13 settingsApi.js (🔴 경로·메서드 전면)
| 프론트 호출 | 실 계약 | 미스매치 | 조치 |
|---|---|---|---|
| GET/PUT `/users/me/availability-target` (js:31,39) | **부재** | availability 총량 목표치 리소스 없음. openapi `AvailabilityView.weeklyTotalMinutes`는 **파생 계산**(컬럼 아님, :2125) | BE 협의(§4) — 저장 대상인지부터 |
| GET `/users/me/preferences` (js:49) | 동(:451) `Preferences` | 필드 `defaultEstimatedMinutes/defaultReplanStrategy`(:2126) | normalize |
| PATCH `/users/me/preferences` (js:56) | **PUT** `/users/me/preferences`(:466) 전체 Preferences | **메서드**(PATCH→PUT 전체교체) | PUT + 전체 body |
| GET `/users/me/preferences/suggestions` (js:69) | GET `/users/me/**preference-suggestions**`(:485) → `PreferenceSuggestion` or null | **경로**(하위→하이픈) + 필드(`suggestedStrategy`→`suggestedReplanStrategy`,`suggestedEstimatedMinutes`,`reason`) | 경로·필드 |
| GET `/users/me/connections` (js:82) | GET `/**external-calendar-connections**`(:549) `data:[ExternalConnection]` | **경로 전면 상이** + 봉투 + 필드(`connectionId/provider/status(CONNECTED/DISABLED)/selectedCalendars`) | 경로·shape |
| PATCH `/users/me/connections/{provider} {connected}` (js:96) | PATCH `/external-calendar-connections/{connectionId}`(:593) | **경로**(provider→connectionId), body(`connected`→syncMode/status?) | 경로·body — provider→connectionId 조회 필요 |
| PUT `/users/me/connections/{provider}/calendars` (js:108) | PUT `/external-calendar-connections/{connectionId}/**calendar-selections**`(:645) | 경로(provider→connectionId, calendars→calendar-selections) | 경로 |
| GET/PATCH `/users/me/account` (js:118,126) | GET `/users/me`(:272)+PATCH `/users/me/**profile**`(:304) | **경로**(account→me/profile). 이름변경은 profile PATCH `{name}` | 경로 분리 |
| POST `/users/me/deactivation` (js:133) | **DELETE `/users/me`**(:287) → `{recoverableUntil}` | 메서드·경로 | DELETE me |
| POST `/auth/reactivations` (js:141) | 동(:135) | 일치 | — |
| GET `/users/me/notification-settings` (js:151) | 동(:732) `data:[NotificationSetting{notificationType,isEnabled}]` | 봉투(배열) + 필드 | normalize |
| PATCH `/users/me/notification-settings {[key]:enabled}` (js:163) | **PUT** `/users/me/notification-settings {settings:[NotificationSetting]}`(:749) | **메서드**(PATCH 낱개→PUT 전체 `{settings:[]}`), 값 enum `DEADLINE_SOON/TODAY_TASKS/PLAN_UNSAVED/RETROSPECT/SUPPORT_ANSWERED` | PUT 전체교체로. "낱개 즉시저장"은 클라가 전체 재전송 |

---

## 4. 엔드포인트 부재/불명 (BE 협의 필요)
| 프론트 가정 URL | 상태 | 비고 |
|---|---|---|
| `/users/me/availability-target` GET/PUT | **부재** | 주간 가용 총량 "목표치" 저장 리소스 없음. openapi는 파생 `weeklyTotalMinutes`만. 저장 필요성부터 BE 확인(오너 결정 phase1과 연결) |
| `/onboarding/import-candidates` GET | **부재** | 외부캘린더 이벤트 후보 — `/external-calendar-connections/{id}/events`(:670)로 대체 가능성 |
| `/onboarding/import-decisions` POST | **부재** | 반영은 `/external-calendar-events/{eventId}/application`(:690) 형태 — 개별 이벤트 단위 |
| `/projects/{id}/task-structuring-drafts/{draftId}/apply` POST | **부재** | 채택은 `/projects/{id}/tasks/bulk`(draftId 포함) |
| dashboard 부분실패 sentinel(`{error:true}`) | **불명** | 프론트가 만든 섹션 실패 표식 — openapi에 근거 없음. 단일 GET이 부분실패를 어떻게 표현하는지 BE 확인 |
| `/settings` 조립 GET (:503) | **미사용(프론트)** | 실서버는 설정 홈 조립 응답 제공. 프론트는 낱개 호출 — 조립 활용 검토 |

**반대로, 프론트가 "부재"로 가정했으나 실재하는 것**(가정 정정): `/dashboard` 단일 GET(:1919), `/stats/correction-proposals`(:1991), `/projects/{id}/duplications`(:1106), `GET /weekly-plans/{planId}/replan-options`(:1726), `POST /weekly-plans` get-or-create(:1485), `PATCH /notifications/read-all`(:799).

---

## 5. 연결 순서 제안

**전제 작업(코드 붙이기 전, 1회)**
- (S1) `client.js` 401 갱신 경로 `/auth/refresh→/auth/token-refresh` 교정.
- (S2) 목록 봉투 헬퍼 통일(`Array.isArray(r)?r:(r?.KEY??[])`) — 전 목록 함수 일괄.
- (S3) `meta` 소비 정책 결정(인터셉터가 meta를 버리는 문제 — unreadCount/page 필요 여부).

**백엔드 PR 머지 순서에 맞춘 연결(의존성 순)**
1. **projects(완료) → tasks CRUD** (`origin/st-b2-03`,`st-b2-01`): getProjectTasks/getTask/createTask/updateTask(+version,categoryId)/deleteTask. 봉투·version만. → 가장 빠름.
2. **task-categories** (같은 PR): `/categories→/task-categories` 경로·봉투. tasks 편집 화면 카테고리 Select 완성.
3. **weekly-plans 코어** (`rule-validation-v3` + BE-2 plan): getWeek(중첩 재매핑)→ blocks 배치(taskApi: auto-placements/block-batches operations)→ validations(경로·virtualBlocks)→ confirmation(save 교체). replan(application POST). 이 블록이 가장 무겁고 상호의존 — 한 번에.
4. **fixed-schedules** (`st-b2-12`): 경로 전부 일치 상태라 분↔time 변환·conflict-preview `{candidate}` 래핑·activeThisWeek 출처(getWeek)만. plan 코어와 함께.
5. **stats/dashboard** (BE-2 stats): 경로 실재 — enum 값·응답 shape 재매핑만. 독립적이라 병렬 가능.
6. **availability**(`feat/st-b1-09-availability`): getAvailability/putAvailabilities 분↔time + patterns 7개.
7. **onboarding**(`feat/st-b1-08-onboarding`): progress 필드 재매핑(실재). import 짝은 §4 협의 후.
8. **support/announcements**(`st-b1-13/14`): 경로 오타 교정 + 봉투 — 독립·쉬움, 병렬 가능.
9. **settings**(`feat/st-b1-07-profile-settings`): preferences PUT, notification PUT `{settings}`, connections `/external-calendar-connections` 전면, account→me/profile. availability-target 협의 후.
10. **auth**(`WEEK4-STUB`): 4주차 전 501이라 실질 연결은 **맨 마지막**. 경로 교정은 미리 해둘 수 있으나 검증은 스텁 해제 후.

**병렬 가능 묶음**: {stats·dashboard}, {support/announcements}, {settings 정적 부분}은 plan 코어와 독립. auth는 마지막(스텁).
