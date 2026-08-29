import { HOUR_PX_STEPS, DEFAULT_HOUR_PX_INDEX } from '../../features/plan/planGeometry'

/*
  주간 그리드 세로 축척 +/− 컨트롤 (팀장 요청 2026-08-29: "세로 길이는 사용자가
  직접 조절해서 한눈에 보이는 일정 량이 조절 됐으면 좋겠다").

  모양·동작은 WbsTimeline의 WbsZoomControl을 그대로 따랐다 — 이 앱에서 "확대/
  축소"는 이미 그 형태로 한 번 합의됐고(오너 spec: "+/− 버튼으로 확대/축소"),
  화면마다 다른 줌 UI를 두는 것보다 같은 손놀림이 두 곳에서 통하는 편이 낫다.

  다른 점 하나 — 버튼 크기가 44px이 아니라 32px이다. 이 컨트롤은 주간 요약 줄의
  오른쪽 끝, 집중/24h 토글 바로 옆에 앉는다. 그 토글이 28px 남짓이라 44px 버튼을
  나란히 두면 줄 전체가 어긋나 보인다. WBS 쪽은 여백이 넉넉한 툴바라 44px가
  맞았고, 여기는 이웃에 맞추는 편이 맞다.

  읽어 주는 값은 기본 축척(50px/시간) 대비 백분율이다. "몇 시간이 보이는가"가
  사용자에게 더 와닿긴 하지만 그 답은 달력 박스의 실제 높이에 달려 있어 이
  컴포넌트가 알 수 없다 — 알지도 못하는 숫자를 자신 있게 적느니 축척 자체를
  적는다.
*/
const BASE_HOUR_PX = HOUR_PX_STEPS[DEFAULT_HOUR_PX_INDEX]

export function HourScaleControl({ index, onChange, canZoomIn, canZoomOut }) {
  const btn =
    'flex h-8 w-8 items-center justify-center rounded-full border border-border text-label text-text transition-colors hover:bg-surface-sunken disabled:opacity-40 disabled:hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring'
  const percent = Math.round((HOUR_PX_STEPS[index] / BASE_HOUR_PX) * 100)

  return (
    <div className="inline-flex shrink-0 items-center gap-1" role="group" aria-label="시간 간격">
      <button
        type="button"
        // "축소"만으로는 어느 방향인지 모호해서(시간이 줄어드는 걸로 읽힌다)
        // 결과를 그대로 적는다 — 간격이 좁아지면 더 많은 시간이 보인다.
        aria-label="시간 간격 좁게 — 한 화면에 더 많은 시간"
        title="시간 간격 좁게"
        onClick={() => onChange(index - 1)}
        disabled={!canZoomOut}
        className={btn}
      >
        −
      </button>
      <span
        className="min-w-10 text-center text-caption tabular-nums text-text-muted"
        aria-live="polite"
      >
        {percent}%
      </span>
      <button
        type="button"
        aria-label="시간 간격 넓게 — 블록을 크게"
        title="시간 간격 넓게"
        onClick={() => onChange(index + 1)}
        disabled={!canZoomIn}
        className={btn}
      >
        +
      </button>
    </div>
  )
}

export default HourScaleControl
