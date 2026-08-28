import { Banner } from '../common/Banner'
import { AlertTriangleIcon } from '../common/statusIcons'

/*
  RB-PROJ-02 구조 경고 배너 (ui-spec §PROJ.2.2). Exactly ONE banner shows even
  when several issues fire at once — "가장 심한 1건만 노출 + 외 {n}건"
  (banner-stacking is deliberately avoided, same cognitive-load reasoning
  Banner's own header gives for OfflineBanner not being dismissible).

  W6 계약 정합 (2026-08-28, 팀장 실서버 실측): 실서버(및 그 계약,
  openapi-live-*.yaml:1616)는 이 배너가 예전에 가정하던 `{code, severity,
  params}` 모양이 아니라 `{warningType, reason, action}`을 준다 — 그리고
  **`reason`은 서버가 이미 완성한 문장**이다(임계값도 서버가 정한다, 계약
  요약: "임계값은 W3 확정 후 골든 고정"). 그래서 이 컴포넌트는 더 이상 문구를
  코드별로 조립하지 않는다(예전 `MESSAGE_BY_CODE`는 계약에 없는 코드
  P-DEADLINE-LOAD/P-NO-ESTIMATE/P-TASK-COUNT로 분기하며 직접 문장을
  짓고 있었다 — 실서버가 절대 그 코드를 주지 않으므로 배너가 항상
  빈 화면이었다). 서버의 `reason`을 그대로 렌더링만 한다.

  severity 필드는 계약에 없다 — "가장 심한 1건" 선정은 여전히 이
  컴포넌트만의 판단(WARNING_TYPE_ORDER)이고, 근거는 그 상수 자신의 주석에
  있다. 알 수 없는 warningType(계약에 새 값이 추가되거나 서버가 변경돼도)
  배너를 깨뜨리지 않는다 — 정렬에서 가장 뒤로 밀리고, `reason`은 여전히
  서버 문장을 그대로 보여주며, 행동 버튼만 안전하게 생략한다(모르는 action이
  뭘 하는지 클라이언트가 지어낼 수 없기 때문).
*/

// 심각도 순서(내림차순, 앞에 올수록 우선 노출). 계약엔 severity가 없어 이
// 컴포넌트가 직접 판단한다 — 원래 코드가 P-DEADLINE-LOAD > P-NO-ESTIMATE >
// P-TASK-COUNT 순으로 매겼던 것과 같은 상대 순위를 실계약의 warningType
// 이름으로 그대로 옮긴 것뿐이다(§보고):
//   1) DEADLINE_PRESSURE — 마감이 임박했는데 남은 태스크가 안 끝날 수
//      있다는 시간 압박은 미루면 되돌릴 수 없어 가장 급하다.
//   2) MISSING_ESTIMATES — 예상시간이 없으면 배치 검증 자체가 부정확해져
//      계획을 세워도 신뢰할 수 없다.
//   3) TOO_FEW_TASKS — 아직 태스크가 적은 것은 계획 착수 단계에서 흔하고
//      가장 되돌리기 쉬운 문제라 셋 중 가장 여유 있게 다뤄도 된다.
const WARNING_TYPE_ORDER = ['DEADLINE_PRESSURE', 'MISSING_ESTIMATES', 'TOO_FEW_TASKS']

// 정렬 인덱스: 모르는 warningType은 목록 끝으로 보낸다(-1이 배열 첫머리로
// 오정렬되는 것을 막기 위해 length를 대신 준다) — "모르면 가장 안 급한 것"
// 취급이 "모르면 안 보여준다"보다 안전하다(§보고 규칙).
const orderIndex = (warningType) => {
  const idx = WARNING_TYPE_ORDER.indexOf(warningType)
  return idx === -1 ? WARNING_TYPE_ORDER.length : idx
}

// action → (버튼 문구, 클릭 핸들러 선택). 계약 값은 ADD_TASK/EDIT_TASK
// 둘뿐이고, 예전 P-DEADLINE-LOAD가 쓰던 "계획 탭 열기"(open-plan-tab)는
// 계약에 대응하는 action이 없어 더 이상 어떤 warningType에서도 나오지
// 않는다 — onOpenPlanTab prop은 향후 계약이 그 action을 추가할 때를 대비해
// 시그니처만 남겨 둔다.
const ACTION_META = {
  ADD_TASK: { label: '태스크 추가', kind: 'add-task' },
  EDIT_TASK: { label: '태스크 편집', kind: 'edit-task' },
}

export function StructureWarningBanner({ issues, onAddTask, onOpenPlanTab, sticky = false }) {
  if (!issues || issues.length === 0) return null

  const ordered = [...issues].sort((a, b) => orderIndex(a.warningType) - orderIndex(b.warningType))
  const [primary, ...rest] = ordered

  // `reason`은 서버가 준 완성 문장이다 — 클라이언트가 다시 짓지 않는다.
  // 계약이 이 필드를 항상 채운다고 보장하므로 primary.reason이 비어 있는
  // 경우까지 목이 발명한 대체 문구를 새로 짓지는 않는다(그 자체가 예전
  // 결함의 재발이므로).
  const message = primary.reason + (rest.length > 0 ? ` 외 ${rest.length}건` : '')

  // 모르는 action은 버튼을 생략한다 — 뭘 하는 버튼인지 클라이언트가 지어낼
  // 수 없기 때문에, 문구(reason)는 그대로 보여주되 행동만 안전하게 뺀다.
  const action = ACTION_META[primary.action]

  const handleAction = () => {
    if (action?.kind === 'open-plan-tab') onOpenPlanTab?.()
    else onAddTask?.() // ADD_TASK/EDIT_TASK both land on the task tab for now
  }

  return (
    <Banner
      tone="warning"
      // `sticky` (accordion restructure): this banner used to live at the top
      // of its OWN dedicated page (ProjectWorkspacePage), where `sticky
      // top-0` pinned it under TopNav as the page scrolled — correct there.
      // It now renders INSIDE an accordion row's expanded panel, one of
      // several on /projects; the nearest scrolling ancestor is the whole
      // page, so a sticky banner here would detach from its own card and
      // pin itself under TopNav regardless of which row it belongs to.
      // Defaults to non-sticky (plain in-flow content) for that reason; the
      // prop stays available rather than hardcoding false, in case a future
      // caller reintroduces a dedicated-page host.
      sticky={sticky}
      icon={<AlertTriangleIcon size={18} />}
      message={
        <span className="flex flex-wrap items-center gap-2">
          <span>{message}</span>
          {action && (
            <button
              type="button"
              onClick={handleAction}
              className="rounded-control px-1.5 py-0.5 text-label font-semibold text-warning-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              {action.label}
            </button>
          )}
        </span>
      }
    />
  )
}

export default StructureWarningBanner
