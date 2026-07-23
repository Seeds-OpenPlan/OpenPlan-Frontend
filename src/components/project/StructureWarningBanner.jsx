import { Banner } from '../common/Banner'
import { AlertTriangleIcon } from '../common/statusIcons'

/*
  RB-PROJ-02 구조 경고 배너 (ui-spec §PROJ.2.2). Exactly ONE banner shows even
  when several issue codes fire at once — "가장 심한 1건만 노출 + 외 {n}건"
  (banner-stacking is deliberately avoided, same cognitive-load reasoning
  Banner's own header gives for OfflineBanner not being dismissible). Severity
  order here (fewest tasks to plan first, most urgent last) is this
  component's own judgment call — the mock's own severities are all
  "warning", so ORDER is what picks the one shown, not a severity compare.
*/

const CODE_ORDER = ['P-DEADLINE-LOAD', 'P-NO-ESTIMATE', 'P-TASK-COUNT']

const MESSAGE_BY_CODE = {
  'P-TASK-COUNT': (p) => `태스크가 ${p.count}개뿐입니다. 계획 전에 작업을 더 나눠 주세요.`,
  'P-NO-ESTIMATE': (p) => `예상시간이 비어 있는 태스크가 ${p.count}개 있습니다. 입력해야 배치 검증이 정확해집니다.`,
  'P-DEADLINE-LOAD': (p) => `마감 ${p.dueDate}까지 남은 태스크가 ${p.count}개입니다. 기간 안에 끝내기 어려울 수 있습니다.`,
}

const ACTION_BY_CODE = {
  'P-TASK-COUNT': { label: '태스크 추가', kind: 'add-task' },
  'P-NO-ESTIMATE': { label: '태스크 편집', kind: 'edit-task' },
  'P-DEADLINE-LOAD': { label: '계획 탭 열기', kind: 'open-plan-tab' },
}

export function StructureWarningBanner({ issues, onAddTask, onOpenPlanTab }) {
  if (!issues || issues.length === 0) return null

  const ordered = [...issues].sort((a, b) => CODE_ORDER.indexOf(a.code) - CODE_ORDER.indexOf(b.code))
  const [primary, ...rest] = ordered
  const buildMessage = MESSAGE_BY_CODE[primary.code]
  if (!buildMessage) return null // an unknown code: nothing safe to render (no guessed copy)

  const action = ACTION_BY_CODE[primary.code]
  const message = buildMessage(primary.params ?? {}) + (rest.length > 0 ? ` 외 ${rest.length}건` : '')

  const handleAction = () => {
    if (action.kind === 'open-plan-tab') onOpenPlanTab?.()
    else onAddTask?.() // both "태스크 추가"/"태스크 편집" land on the task tab for now
  }

  return (
    <Banner
      tone="warning"
      icon={<AlertTriangleIcon size={18} />}
      message={
        <span className="flex flex-wrap items-center gap-2">
          <span>{message}</span>
          <button
            type="button"
            onClick={handleAction}
            className="rounded-control px-1.5 py-0.5 text-label font-semibold text-warning-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            {action.label}
          </button>
        </span>
      }
    />
  )
}

export default StructureWarningBanner
