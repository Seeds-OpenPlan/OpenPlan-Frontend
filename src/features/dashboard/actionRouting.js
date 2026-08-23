/*
  §DASH.2 우선 행동 라벨 카탈로그. 예전엔 actionType→경로를 이 파일이 직접
  조립했다(결정문 §3.2가 저장소에 없어 서버 actionType 값을 몰랐던 시절의
  임시 계약, [미정→리드]). 실제 `DashboardView` 계약(W6, 2026-08-23 —
  openapi-live-76c7009.yaml)이 오면서 그 전제가 둘 다 바뀌었다:
   1) `priorityAction.actionType`은 이 파일이 예전에 쓰던 이름
      (FIXED_CONFLICT_RESOLVE 등)이 아니라 서버 enum(RESOLVE_FIXED_CONFLICT
      등)이다 — 키를 이 enum에 맞춰 다시 지었다.
   2) `priorityAction`도 `riskIssues[]` 행도 이제 `routePath`를 서버가 직접
      준다 — actionType→URL을 FE가 다시 조립할 이유가 없어졌다(오히려 서버가
      준 실제 경로보다 부정확할 위험만 있다). 그래서 이 파일은 이제 `to()`
      빌더 없이 라벨(사람이 읽는 짧은 이름)만 갖는다 — RiskList.jsx가
      priorityAction 행의 스크린리더 보조 텍스트에 쓴다(그 파일 참고).
      리스크 목록 자체는 `riskType`만 있고 `actionType`이 없어(계약에 없음)
      이 카탈로그를 거치지 않고 서버의 `routePath`만으로 바로 이동한다.
*/

export const ACTION_ROUTES = {
  RESOLVE_FIXED_CONFLICT: { label: '고정 일정 충돌 확인하기' },
  RESOLVE_OVERLAP: { label: '겹치는 일정 확인하기' },
  PLACE_UNASSIGNED: { label: '미배치 태스크 배치하기' },
  REPLACE_TODAY_INCOMPLETE: { label: '오늘 미완료 다시 계획하기' },
  FIX_OUT_OF_WBS: { label: 'WBS 기간 밖 배치 조정하기' },
  RESOLVE_CAPACITY: { label: '가용 시간 초과 확인하기' },
  HANDLE_DEADLINE: { label: '마감 임박 태스크 처리하기' },
}

/**
 * `actionType`의 사람이 읽는 라벨, 또는 이 build가 모르는 값이면 `null`.
 * routePath는 이제 항상 서버가 직접 주므로(DashboardView 계약) 여기서
 * 만들지 않는다 — 호출부가 `priorityAction.routePath`/`risk.routePath`를
 * 그대로 쓰면 된다.
 */
export function resolveActionLabel(actionType) {
  return ACTION_ROUTES[actionType]?.label ?? null
}

export default ACTION_ROUTES
