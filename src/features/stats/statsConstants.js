/*
  Shared enums for the 통계 screen (ST-F1-11). Kept in one file so the period
  toggle (AC-1), the time-band aggregation (AC-3), and the deviation grouping
  toggle (AC-2) all read from the same source instead of each screen/component
  re-declaring its own copy of "what a period/band/group IS".
*/

// AC-1 기간 토글. `value`는 그대로 `?period=` 쿼리값으로 나가는 wire enum이다
// (정본 openapi-live-76c7009.yaml의 `period: WEEKLY|MONTHLY`). `label`은
// Desktop.Status.png의 버튼 문구 — 순서가 곧 토글의 좌→우 버튼 순서다.
//
// [버그 수정 2026-08] 원래 4개(이번 주/이번 달/최근 3개월/전체)였으나 실 계약은
// WEEKLY/MONTHLY 두 값만 받는다(그 외 값은 422 E-COM-009). '최근 3개월'·'전체'는
// 서버가 낼 방법이 없는 기간이라 버튼 자체를 없앴다 — 버튼을 남겨 두면 누르는
// 순간 요청이 실패한다. 백엔드가 나중에 두 기간을 추가 지원하면 이 배열에 항목만
// 되돌리면 된다(statsApi.js/statsFixtures.js는 이미 WEEKLY/MONTHLY 값을 그대로
// wire 파라미터로 쓰므로 이 배열 밖은 손댈 필요 없음).
export const STATS_PERIODS = [
  { value: 'WEEKLY', label: '이번 주' },
  { value: 'MONTHLY', label: '이번 달' },
]
export const DEFAULT_STATS_PERIOD = 'WEEKLY'

// AC-2 편차 토글 (프로젝트별/카테고리별). value는 `?groupBy=`로 나가는 wire enum
// (계약: PROJECT|CATEGORY, 전부 대문자 — 소문자로 보내면 422).
export const DEVIATION_GROUP_BYS = [
  { value: 'PROJECT', label: '프로젝트별' },
  { value: 'CATEGORY', label: '카테고리별' },
]
export const DEFAULT_DEVIATION_GROUP_BY = 'PROJECT'

// AC-3 4구간 (RB-STAT-03 원문 정의: 새벽 00~05:59 · 오전 06~11:59 · 오후
// 12~17:59 · 야간 18~23:59). `slot`은 TimePatternReport.slots[].slot의 wire enum
// (DAWN/MORNING/AFTERNOON/NIGHT) — 실 서버가 이미 이 4구간으로 집계해서 보내주므로
// (statsApi.js의 예전 주석과 달리, per-hour 원자료를 FE가 직접 합산하지 않는다),
// 여기 남은 역할은 그 enum 값을 화면 라벨/렌더 순서에 매핑하는 것뿐이다. 경계
// 자체를 바꾸는 건 이제 백엔드 쪽 변경이라 이 파일만 고쳐서는 안 된다.
export const TIME_BANDS = [
  { key: 'dawn', label: '새벽', slot: 'DAWN' },
  { key: 'morning', label: '오전', slot: 'MORNING' },
  { key: 'afternoon', label: '오후', slot: 'AFTERNOON' },
  { key: 'night', label: '야간', slot: 'NIGHT' },
]
