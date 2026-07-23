/*
  §DASH.2 행동→화면 매핑 표. 우선 행동 카드(S2)와 위험 카드(S5)가 함께 소비하는
  단일 라우팅 테이블이다 — 두 표면이 각자 라우팅을 하드코딩하면 문구·경로가
  갈라질 수 있어서 한 곳에 둔다(P4 취지를 라우팅에도 확장, ui-spec-dash.md §DASH.2).

  결정문(`us-decisions-kr.md`) §3.2가 저장소에 없어 서버의 실제 actionType 값을
  알 수 없다 — 이 파일의 키(ACTION_ROUTES)는 리드 확인 전까지의 임시 계약이다
  [미정→리드]. 서버가 다른 이름을 보내면 이 표의 키만 맞추면 된다.
*/

export const ACTION_ROUTES = {
  // 고정 일정 충돌 해소 → 검토 패널이 안내하는 이번 주로.
  FIXED_CONFLICT_RESOLVE: { label: '충돌 확인하기', to: () => '/weekly' },
  // 미배치 태스크 배치 → ST-F1-08과 공유하는 신규 seam.
  UNPLACED_TASK_PLACE: { label: '지금 배치하기', to: () => '/weekly?openUnplaced=1' },
  // 당일 미완료 발생 재배치 → ST-F1-07이 이미 마련해 둔 seam.
  INCOMPLETE_REPLAN: { label: '다시 계획하기', to: () => '/weekly?openReplan=1' },
  // WBS 기간 밖 배치 → 해당 프로젝트의 계획 탭으로.
  WBS_RANGE_ADJUST: {
    label: '범위 조정하기',
    to: (params) => `/projects/${params?.projectId ?? ''}?tab=plan`,
  },
  // 마감 임박 태스크 → 이번 주로.
  DEADLINE_TODAY: { label: '오늘 처리하기', to: () => '/weekly' },
}

/**
 * Resolve one action into `{ label, to }`, or `null` when the server sends an
 * actionType this build doesn't recognize yet — the caller then renders the
 * card/row WITHOUT a button rather than a broken one (a card that only states
 * the problem, with no way forward, is still better than a dead link).
 */
export function resolveAction(actionType, params) {
  const route = ACTION_ROUTES[actionType]
  if (!route) return null
  return { label: route.label, to: route.to(params) }
}

export default ACTION_ROUTES
