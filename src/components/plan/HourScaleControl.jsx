/*
  주간 그리드 세로 축척 컨트롤 (2026-08-29 요구: "세로 길이는 사용자가
  직접 조절해서 한눈에 보이는 일정 량이 조절 됐으면 좋겠다").

  모양·동작은 WbsTimeline의 WbsZoomControl을 그대로 따랐다 — 이 앱에서 "확대/
  축소"는 이미 그 형태로 한 번 합의됐고(spec: "+/− 버튼으로 확대/축소"),
  화면마다 다른 줌 UI를 두는 것보다 같은 손놀림이 두 곳에서 통하는 편이 낫다.

  다른 점 하나 — 버튼 크기가 44px이 아니라 32px이다. 이 컨트롤은 주간 요약 줄의
  오른쪽 끝, 집중/24h 토글 바로 옆에 앉는다. 그 토글이 28px 남짓이라 44px 버튼을
  나란히 두면 줄 전체가 어긋나 보인다. WBS 쪽은 여백이 넉넉한 툴바라 44px가
  맞았고, 여기는 이웃에 맞추는 편이 맞다.

  2026-08-31 ("스크롤해야 일정이 보여서 불편하다") — 가운데 읽어 주던 자리가
  이제 **[맞춤] 토글**이다. 눌린 상태(기본값)면 축척을 화면이 정해 가시 범위가
  통째로 들어오고, +/− 를 누르면 그 자리에서 수동 단계로 빠지며 토글이 풀린다.
  다시 누르면 맞춤으로 돌아온다.

  왜 읽어 주는 숫자(%)를 토글 아래 캡션이 아니라 title/aria에 넣었나 — 한 줄에
  세 컨트롤(맞춤·+/−·집중/24h)이 이미 들어차 있어 폭이 없다. 그리고 맞춤이
  기본인 이상 사용자가 알고 싶은 것은 "몇 %인가"가 아니라 "지금 화면이 맞춰
  주고 있는가"다 — 그 답을 버튼의 눌림 상태가 직접 보여 준다. 정확한 값은 여전히
  스크린리더와 툴팁으로 읽을 수 있다.
*/
import { HOUR_PX_STEPS, DEFAULT_HOUR_PX_INDEX } from '../../features/plan/planGeometry'

const BASE_HOUR_PX = HOUR_PX_STEPS[DEFAULT_HOUR_PX_INDEX]

export function HourScaleControl({ isFit, hourPx, onFit, onZoomIn, onZoomOut, canZoomIn, canZoomOut }) {
  const btn =
    'flex h-8 w-8 items-center justify-center rounded-full border border-border text-label text-text transition-colors hover:bg-surface-sunken disabled:opacity-40 disabled:hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring'
  const percent = Math.round((hourPx / BASE_HOUR_PX) * 100)

  return (
    <div className="inline-flex shrink-0 items-center gap-1" role="group" aria-label="시간 간격">
      <button
        type="button"
        // "축소"만으로는 어느 방향인지 모호해서(시간이 줄어드는 걸로 읽힌다)
        // 결과를 그대로 적는다 — 간격이 좁아지면 더 많은 시간이 보인다.
        aria-label="시간 간격 좁게 — 한 화면에 더 많은 시간"
        title="시간 간격 좁게"
        onClick={onZoomOut}
        disabled={!canZoomOut}
        className={btn}
      >
        −
      </button>
      <button
        type="button"
        aria-pressed={isFit}
        aria-label={`화면에 맞추기 — 가용 시간대가 스크롤 없이 다 보이게 (현재 ${percent}%)`}
        title={`화면에 맞추기 (현재 ${percent}%)`}
        onClick={onFit}
        className={[
          'h-8 rounded-full border px-2.5 text-caption font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
          isFit
            ? 'border-brand-600 bg-brand-600 text-white'
            : 'border-border text-text-muted hover:bg-surface-sunken',
        ].join(' ')}
      >
        맞춤
      </button>
      <button
        type="button"
        aria-label="시간 간격 넓게 — 블록을 크게"
        title="시간 간격 넓게"
        onClick={onZoomIn}
        disabled={!canZoomIn}
        className={btn}
      >
        +
      </button>
    </div>
  )
}

export default HourScaleControl
