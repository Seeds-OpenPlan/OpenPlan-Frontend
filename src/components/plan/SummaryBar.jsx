import { ModeToggle } from './ModeToggle'
import { HourScaleControl } from './HourScaleControl'
import { formatDurationKO } from '../../features/plan/planTime'

/*
  Weekly summary (PLAN-01): planned vs available time with a progress bar, plus
  the view-mode toggle on the right. The ratio is shown as text ("6시간 40분 /
  45시간") and mirrored by the bar; the bar turns to a warning tone past 100% but
  the numbers remain the source of truth (color is never the only signal).
*/
/*
  블록 색 범례 (2026-08-29). 세 종류의 색을 글자로 풀어 주는 자리 —
  색이 유일한 단서가 되지 않게 하는 쪽(NFR-017)이자, 새 색 규칙을 처음 보는
  사람이 추측하지 않아도 되게 하는 쪽이다. 색 값은 PlanBlock의 TYPE_CLASSES /
  FixedScheduleBlock의 회색과 짝을 이룬다 — 한쪽만 바뀌면 범례가 거짓말이 되니
  둘을 같이 고쳐야 한다.

  세로 공간을 새로 먹지 않도록 이미 있던 요약 줄의 빈 왼쪽에 얹었다("화면이
  너무 작다"는 마당에 범례가 한 줄을 더 차지하면 앞뒤가 안 맞는다).
  좁은 화면에서는 요약 텍스트와 겹치므로 감춘다.
*/
const LEGEND = [
  { label: '태스크', dot: 'bg-brand-200 border-brand-500' },
  { label: '일정', dot: 'bg-success-50 border-success-500' },
  { label: '고정', dot: 'bg-neutral-100 border-neutral-400' },
]

function BlockLegend() {
  return (
    <ul className="hidden items-center gap-2.5 text-caption text-text-muted md:flex">
      {LEGEND.map((item) => (
        <li key={item.label} className="flex items-center gap-1">
          <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm border ${item.dot}`} />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

export function SummaryBar({
  usedMinutes,
  availableMinutes,
  mode,
  onModeChange,
  // 세로 축척 조절 — 상태는 페이지가 소유하고 여기선 표시만 한다.
  // `isFit`/`hourPx`는 useHourScale이 계산한 현재 상태 그대로다.
  isFit,
  hourPx,
  fitHourPx,
  onFit,
  onZoomIn,
  onZoomOut,
  canZoomIn,
  canZoomOut,
}) {
  const ratio = availableMinutes > 0 ? usedMinutes / availableMinutes : 0
  const pct = Math.min(100, Math.round(ratio * 100))
  const over = usedMinutes > availableMinutes && availableMinutes > 0

  return (
    <div>
      {/* Time text centered; the mode toggle floats at the right edge (design). */}
      <div className="relative flex items-center justify-center">
        <div className="absolute left-0">
          <BlockLegend />
        </div>
        <p className="text-body text-center">
          <span className="font-bold text-text">{formatDurationKO(usedMinutes)}</span>
          <span className="text-text-muted"> / {formatDurationKO(availableMinutes)}</span>
          {over && <span className="ml-2 text-caption font-medium text-warning-700">초과</span>}
        </p>
        <div className="absolute right-0 flex items-center gap-2">
          <HourScaleControl
            isFit={isFit}
            hourPx={hourPx}
            fitHourPx={fitHourPx}
            onFit={onFit}
            onZoomIn={onZoomIn}
            onZoomOut={onZoomOut}
            canZoomIn={canZoomIn}
            canZoomOut={canZoomOut}
          />
          <ModeToggle mode={mode} onChange={onModeChange} />
        </div>
      </div>

      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="가용 시간 대비 계획 시간"
      >
        <div
          className={`h-full rounded-full ${over ? 'bg-warning-500' : 'bg-brand-600'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export default SummaryBar
