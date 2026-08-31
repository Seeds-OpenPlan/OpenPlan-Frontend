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

  ## 100%의 기준 (2026-08-31 요구: "100 = 맞춤 사이즈면 안 돼?")

  가운데 버튼이 읽어 주는 %는 **화면에 딱 들어차는 축척(fitHourPx)을 100%로**
  놓고 잰 값이다. 고정 상수(50px/시간)를 기준으로 삼던 것을 바꿨다.

  이 기준을 고른 덕에 컨트롤이 훨씬 단순해졌다. 예전에는 "누르면 100%로"와
  "맞춤으로 돌아가기"가 서로 다른 동작이라, 100%에서 한 번 더 누르면 맞춤으로
  간다는 숨은 갈래가 필요했다. 이제 **100% 자체가 맞춤 크기**이므로 누르면
  하는 일은 언제나 하나다 — 100%로 간다. 사용자가 외울 규칙이 하나 줄었다.

  대신 감수하는 것: 창 높이가 바뀌면 맞춤 축척이 따라 바뀌므로, 수동 단계에
  머무는 동안에는 사용자가 아무것도 안 눌러도 %가 달라진다. 그래도 그 숫자가
  말하는 바("지금 한 화면에 들어차는 크기의 몇 %인가")는 늘 참이다.

  화면에 "맞춤"이라는 낱말은 쓰지 않는다(오너 요구). 색으로도 구분하지 않는다 —
  한때 이 버튼만 파랗게 칠해 상태를 보였는데, 그것도 뺐다(오너 요구: "100%도
  파란색 말고 그냥 하얀색으로"). **숫자 자체가 상태다**: 100%면 한 화면에
  들어차는 크기이고, 그 값에 서면 훅이 언제나 화면 추종 모드를 고르므로
  "100%인데 화면을 안 따라간다"는 어긋난 상태가 존재하지 않는다. 스크린리더에는
  `aria-pressed`와 풀어 쓴 이름으로 같은 사실을 전한다.
*/

export function HourScaleControl({
  isFit,
  hourPx,
  fitHourPx,
  onFit,
  onZoomIn,
  onZoomOut,
  canZoomIn,
  canZoomOut,
}) {
  const btn =
    'flex h-8 w-8 items-center justify-center rounded-full border border-border text-label text-text transition-colors hover:bg-surface-sunken disabled:opacity-40 disabled:hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring'

  // 아직 측정 전이면 기준이 없다 — 그때는 지금 축척 자신을 기준으로 삼아 100%로
  // 읽는다(NaN이나 Infinity를 화면에 내보내지 않기 위한 방어이자, 측정이 끝나면
  // 곧바로 진짜 값으로 바뀐다).
  const reference = fitHourPx || hourPx || 1
  const percent = Math.round((hourPx / reference) * 100)
  const atFullSize = percent === 100

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
        지금 배율을 늘 보여 주고, 누르면 100%(=한 화면에 들어차는 크기)로 간다.
        100%가 곧 그 크기라 갈래가 없다 — 이미 100%여도 같은 동작이고, 그때는
        보이는 결과가 그대로라 무해하다(수동으로 우연히 100%에 와 있는 경우에는
        상태만 화면 추종으로 바뀌어, 이후 창 크기 변화를 따라가게 된다).
      */}
      <button
        type="button"
        aria-pressed={isFit}
        aria-label={
          atFullSize
            ? `세로 축척 ${percent}% — 한 화면에 들어차는 크기`
            : `세로 축척 ${percent}% — 눌러서 100%(한 화면에 들어차는 크기)로`
        }
        title={atFullSize ? '한 화면에 들어차는 크기' : '100%로 되돌리기'}
        onClick={onFit}
        className="h-8 min-w-14 rounded-full border border-border px-2 text-caption font-medium tabular-nums text-text transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        {percent}%
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
        축척이 바뀐 결과를 스크린리더에 알리는 자리. 값은 위 버튼의 aria-label에도
        실려 있지만 그것만으로는 부족하다 — 포커스가 그 버튼에 없을 때(+/− 를 누른
        직후가 바로 그렇다) label 변경은 다시 읽히지 않기 때문이다. 눈으로는 버튼의
        숫자와 눌림 상태가 같은 정보를 이미 보여 준다.
      */}
      <span className="sr-only" aria-live="polite">
        시간 간격 {percent}%
      </span>
    </div>
  )
}

export default HourScaleControl
