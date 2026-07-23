/*
  THE single catalog of replan-alternative NAMES and descriptions (PLAN-29 · P3
  "명칭은 결정문 §1.1 정본 4종만"). Every place the modal shows a strategy's label
  or one-line description reads it from HERE, so a copy change is a one-file
  change — same rule as violationMessages.js (J1), just for a different surface.

  결정문 (the naming decision doc) is not in this repository. In its absence, the
  four names below are the ones TWO independent user stories agree on verbatim:
  PLAN-29 ("기존 계획 유지안, 최소 변경안, 마감 우선안, 작업 분산안") and FIX-12's
  기본값 picker (same four words). RB-PLAN-04's "마감일 우선안" and RB-PLAN-05's
  "가용 시간 초과 완화안" are NOT used here — those are the RULE's own description
  of what it does, not the label PLAN-29/FIX-12 name the alternative by.

  strategy_type keys (MINIMAL_CHANGE / DEADLINE_FIRST / WORKLOAD_BALANCE) come
  from the ERD (12. 상세 ERD.md, replan_options.strategy_type), not invented here.
*/

// BASELINE never reaches the server: it IS the current, already-saved-as-draft
// plan, so "generating" it would just be asking the server to hand back what it
// already has. See replanApi.js's GENERATED_STRATEGY_TYPES for the three that do.
export const BASELINE_STRATEGY_TYPE = 'BASELINE'

export const replanStrategyCatalog = {
  BASELINE: {
    type: 'BASELINE',
    label: '기존 계획 유지안',
    blurb: '지금 계획을 바꾸지 않습니다',
  },
  // RB-PLAN-03 — moves ONLY the blocks that are currently in a 차단 violation
  // (V1/V2) to the nearest later free slot; everything else stays put.
  MINIMAL_CHANGE: {
    type: 'MINIMAL_CHANGE',
    label: '최소 변경안',
    blurb: '충돌하는 항목만 인접한 가용 시간으로 옮깁니다',
  },
  // RB-PLAN-04 — re-lays every TASK block out, earliest due date first.
  DEADLINE_FIRST: {
    type: 'DEADLINE_FIRST',
    label: '마감 우선안',
    blurb: '마감일이 가까운 태스크를 앞쪽 가용 슬롯으로 우선 배치합니다',
  },
  // RB-PLAN-05 — moves load off the most over-capacity day(s) onto days with
  // spare room, one block at a time, until nothing is over (or nothing more fits).
  WORKLOAD_BALANCE: {
    type: 'WORKLOAD_BALANCE',
    label: '작업 분산안',
    blurb: '초과분이 큰 날짜의 항목을 여유 있는 날짜로 분산합니다',
  },
}

// Fixed comparison order everywhere the four cards render (AC-1: 기준선 + 3안).
export const GENERATED_STRATEGY_TYPES = ['MINIMAL_CHANGE', 'DEADLINE_FIRST', 'WORKLOAD_BALANCE']

// The baseline "option" object, shaped like a server replan option so the modal
// can treat all four cards uniformly. `replanOptionId: null` is what tells
// ReplanOptionsModal's apply handler this one never calls the API (see
// usePlanData.js's useReplanOptions header for the ST-F1-12 default-value note).
export const BASELINE_OPTION = {
  replanOptionId: null,
  strategyType: BASELINE_STRATEGY_TYPE,
  changeSummary: '없음',
  recommendationReason: '현재 배치를 그대로 유지합니다',
  proposedBlocks: null,
}
