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

  2026-08-31 (2차) — %를 다시 눈에 보이게 되돌렸다. 한때 "맞춤이 기본이면
  사용자가 알고 싶은 건 몇 %인가가 아니라 화면이 맞춰 주고 있는가"라고 보고
  숫자를 title/aria로만 뺐는데, 실제로 써 보니 지금 배율이 얼마인지가 여전히
  궁금하다는 요구가 왔다. 그래서 가운데 버튼이 **상태(맞춤/수동)와 숫자(%)를
  한꺼번에** 지고, 누르면 100%로 되돌리는 동작까지 맡는다. 자세한 갈래는 그
  버튼 바로 위 주석에 있다. 정확한 값은 여전히
  스크린리더와 툴팁으로 읽을 수 있다.
*/
import { HOUR_PX_STEPS, DEFAULT_HOUR_PX_INDEX } from '../../features/plan/planGeometry'

const BASE_HOUR_PX = HOUR_PX_STEPS[DEFAULT_HOUR_PX_INDEX]

export function HourScaleControl({
  isFit,
  hourPx,
  onFit,
  onReset,
  onZoomIn,
  onZoomOut,
  canZoomIn,
  canZoomOut,
}) {
  const btn =
    'flex h-8 w-8 items-center justify-center rounded-full border border-border text-label text-text transition-colors hover:bg-surface-sunken disabled:opacity-40 disabled:hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring'
  const percent = Math.round((hourPx / BASE_HOUR_PX) * 100)
  // 기본 축척에 정확히 와 있는가 — 표시가 100%인 상태. 맞춤이 우연히 100%를
  // 가리킬 수도 있으므로(창 높이가 딱 맞을 때) 맞춤 여부는 따로 본다.
  const atBase = hourPx === BASE_HOUR_PX

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
      {/*
        가운데 버튼은 **지금 몇 %인지를 늘 보여 준다**(2026-08-31 요구: "맞춤
        버튼에 지금 몇%인지 떴으면 좋겠어, % 뜨는 걸 누르면 100으로 돌아가도록").

        누르면 하는 일이 상태에 따라 갈린다 — 브라우저 확대/축소 컨트롤과 같은
        손놀림이다:
          100%가 아니면  → 100%로 되돌린다(요구 그대로).
          이미 100%면    → 맞춤으로 돌아간다.
        마지막 갈래가 필요한 이유: 100%로만 되돌리는 버튼이면 한 번 누른 뒤
        맞춤으로 돌아올 길이 화면에서 사라진다(축척은 localStorage에 남으므로
        영영 못 돌아온다). 100%에 있을 때는 "되돌릴 곳"이 없으니 그 자리를
        맞춤 복귀에 내주는 것이 자연스럽다.

        맞춤 상태는 눌린 스타일 + `aria-pressed`로 보여 주고, 라벨에 "맞춤"을
        함께 적어 색에만 기대지 않는다(NFR-017).
      */}
      <button
        type="button"
        aria-pressed={isFit}
        aria-label={
          isFit
            ? `세로 축척 ${percent}%, 화면에 맞춤 — 눌러서 100%로`
            : atBase
              ? `세로 축척 ${percent}% — 눌러서 화면에 맞춤`
              : `세로 축척 ${percent}% — 눌러서 100%로`
        }
        title={atBase && !isFit ? '화면에 맞추기' : '100%로 되돌리기'}
        onClick={atBase && !isFit ? onFit : onReset}
        className={[
          'h-8 min-w-16 rounded-full border px-2 text-caption font-medium tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
          isFit
            ? 'border-brand-600 bg-brand-600 text-white'
            : 'border-border text-text hover:bg-surface-sunken',
        ].join(' ')}
      >
        {isFit ? `맞춤 ${percent}%` : `${percent}%`}
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
      {/*
        축척이 바뀐 결과를 스크린리더에 알리는 자리. 예전에는 가운데 %표시가
        `aria-live`를 달고 이 역할을 했는데, 그 자리를 [맞춤] 토글이 가져가면서
        알림이 사라졌다. 값은 [맞춤] 버튼의 aria-label에도 실려 있지만 그것만으로는
        부족하다 — 포커스가 그 버튼에 없을 때(+/− 를 누른 직후가 바로 그렇다)
        label 변경은 다시 읽히지 않기 때문이다. 그래서 결과를 말해 주는 라이브
        리전을 따로 둔다. 눈으로는 버튼의 눌림 상태가 같은 정보를 이미 보여 준다.
      */}
      <span className="sr-only" aria-live="polite">
        시간 간격 {percent}%{isFit ? ', 화면에 맞춤' : ''}
      </span>
    </div>
  )
}

export default HourScaleControl
