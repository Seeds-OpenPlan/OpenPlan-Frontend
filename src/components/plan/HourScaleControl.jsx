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

  가운데 버튼이 읽어 주는 %는 **가용 시간대가 화면에 딱 들어차는 축척(fitHourPx)을
  100%로** 놓고 잰 값이다. 고정 상수(50px/시간)를 기준으로 삼던 것을 바꿨다.

  그 기준 창은 **모드와 무관하게 집중 모드의 창**이다(2026-09-01 요구:
  "집중/24시 전환했을 때 100% 크기가 동일했으면 좋겠어"). 그래서 24시간 모드로
  넘어가도 블록 크기가 그대로이고, 달라지는 것은 "몇 시간을 펼쳐 보이느냐"뿐이다 —
  24시간 모드에서 100%가 화면을 넘치는 것은 축척이 달라져서가 아니라 그 크기로
  하루 전체를 편 결과다. 자세한 근거는 WeeklyPage의 `focusRange` 주석.

  이 기준을 고른 덕에 컨트롤이 훨씬 단순해졌다. 예전에는 "누르면 100%로"와
  "맞춤으로 돌아가기"가 서로 다른 동작이라, 100%에서 한 번 더 누르면 맞춤으로
  간다는 숨은 갈래가 필요했다. 이제 **100% 자체가 맞춤 크기**이므로 누르면
  하는 일은 언제나 하나다 — 100%로 간다. 사용자가 외울 규칙이 하나 줄었다.

  대신 감수하는 것: 창 높이가 바뀌면 맞춤 축척이 따라 바뀌므로, 수동 단계에
  머무는 동안에는 사용자가 아무것도 안 눌러도 %가 달라진다. 그래도 그 숫자가
  말하는 바("가용 시간대가 한 화면에 들어차는 크기의 몇 %인가")는 늘 참이다.

  화면에 "맞춤"이라는 낱말은 쓰지 않는다(오너 요구). 색으로도 구분하지 않는다 —
  한때 이 버튼만 파랗게 칠해 상태를 보였는데, 그것도 뺐다(오너 요구: "100%도
  파란색 말고 그냥 하얀색으로").

  ## 100%와 "화면 추종"은 같은 말이 아니다 (리뷰 지적, 2026-09-01)

  한때 이 자리에 "100%면 곧 화면 추종 모드이므로 어긋난 상태가 없다"고 적었는데
  **거짓이었다.** 수동 단계에 머문 채 창을 리사이즈해 기준 축척이 우연히 지금
  단계값과 같아지면(예: 둘 다 50px) 표시는 100%인데 모드는 수동이다. 그 상태는
  "지금은 꽉 차 보이지만 창을 다시 줄이면 안 따라간다"는 뜻이라, 100%라는 숫자만
  보고 "화면이 맞춰 주고 있다"고 읽으면 틀린다.

  그래서 **말로 설명하는 자리(접근성 이름·툴팁)는 숫자가 아니라 모드(`isFit`)를
  따른다.** 숫자는 지금 배율을 정직하게 보여 주고, "화면에 들어차는 크기인가"는
  모드가 답한다. 이 둘을 서로 다른 값으로 갈라 쓰면 위와 같이 표시가 스스로를
  부정하게 된다.

  `aria-pressed`도 뺐다. 이 버튼은 눌러도 되돌아오지 않는 **단방향 동작**이지
  토글이 아니다(눌리면 언제나 100%로 갈 뿐, 다시 눌러 수동으로 빠지지 않는다).
  시각적 눌림 상태도 없앤 마당에 토글용 속성만 남기면 스크린리더 사용자에게
  없는 토글을 약속하는 셈이라, 상태는 이름으로 풀어 말한다.
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
        지금 배율을 늘 보여 주고, 누르면 100%(= 가용 시간대가 한 화면에 들어차는
        크기)로 간다.
        갈래가 없다 — 이미 화면 추종 중이어도 같은 동작이고 보이는 결과가 그대로라
        무해하다. 수동으로 우연히 100%에 와 있는 경우에는 눈에 보이는 변화 없이
        모드만 화면 추종으로 바뀌어, 그때부터 창 크기 변화를 따라가게 된다 —
        이 버튼이 그 상태를 고쳐 주는 유일한 길이다(파일 헤더 참고).
      */}
      <button
        type="button"
        aria-label={
          isFit
            ? `세로 축척 ${percent}% — 가용 시간대가 한 화면에 들어차는 크기`
            : `세로 축척 ${percent}% — 눌러서 100%(가용 시간대가 한 화면에 들어차는 크기)로`
        }
        title={isFit ? '가용 시간대가 한 화면에 들어차는 크기' : '100%로 되돌리기'}
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
        직후가 바로 그렇다) label 변경은 다시 읽히지 않기 때문이다. 눈으로는 버튼에
        찍힌 숫자가 같은 정보를 이미 보여 준다.
      */}
      <span className="sr-only" aria-live="polite">
        시간 간격 {percent}%
      </span>
    </div>
  )
}

export default HourScaleControl
