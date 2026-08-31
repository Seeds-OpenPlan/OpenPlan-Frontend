/*
  주간 그리드의 세로 축척(1시간이 몇 픽셀인가)을 사용자 설정으로 들고 있는 훅
  — 2026-08-29 요구: "세로 길이는 사용자가 직접 조절해서 한눈에 보이는
  일정 량이 조절 됐으면 좋겠다."

  2026-08-31 요구: "지금은 스크롤해야 일정이 보여서 불편하다. 집중 모드일 때
  가용시간 범위가 한 화면에 바로 들어오도록 해 달라." 그래서 이 훅은 이제 두
  가지 상태를 오간다 —

    '맞춤'  : 축척을 화면이 정한다. 페이지가 실제로 측정한 달력 높이로
              planGeometry.fitHourPx가 계산한 값을 그대로 쓴다. **기본값**이다.
    수동단계: 예전과 같은 HOUR_PX_STEPS 인덱스. 사용자가 +/− 를 누른 순간부터.

  맞춤을 기본으로 둔 이유: "스크롤 없이 보이는 것"은 사용자가 매번 창 크기에
  맞춰 +/− 를 눌러 맞춰야 할 종류의 일이 아니다. 반대로 "블록 글씨를 크게 보고
  싶다"는 취향이므로 그건 수동으로 남는다. 한 번 수동으로 내려오면 다시 맞춤을
  누르기 전까지는 화면이 축척을 건드리지 않는다 — 사용자가 고른 크기를 창 크기
  변화가 조용히 덮어쓰면 그게 더 나쁘다.

  왜 planGeometry가 아니라 여기인가: planGeometry는 React도 I/O도 없는 순수
  기하 모듈이다(그 파일 자체 헤더). 단계 표·클램프·맞춤 계산 같은 순수한 부분은
  거기 두고, "고른 값을 기억한다"는 부수효과만 이 훅이 맡는다.

  기억은 localStorage다. 서버에 사용자 설정으로 저장할 수도 있지만, 계약에
  그런 필드가 없고(설정 API는 기본값/가용시간 계열만 다룬다) 이건 기기마다
  달라도 자연스러운 종류의 취향이다 — 27인치 모니터와 노트북에서 같은 축척을
  강요할 이유가 없다.
*/

import { useCallback, useEffect, useState } from 'react'
import { clampHourPxIndex, DEFAULT_HOUR_PX_INDEX, HOUR_PX_STEPS } from './planGeometry'

/*
  키를 예전 `...hourScaleIndex`에서 바꿨다. 이 훅은 값을 쓰는 쪽이라, 한 번이라도
  이 화면을 열어 본 사람은 예전 키에 이미 숫자 단계가 적혀 있다 — 그 값을 그대로
  이어받으면 새 기본값(맞춤)은 신규 사용자에게만 적용되고, 정작 "스크롤해야
  보인다"고 겪은 사람들 화면은 하나도 안 바뀐다. 키를 갈아 모두가 맞춤에서
  시작하게 하고, 거기서 원하면 예전처럼 +/− 로 내려오게 한다. 예전 키는 읽지
  않고 버린다(지우지도 않는다 — 남은 몇 바이트를 청소하자고 마이그레이션
  코드를 들일 값어치가 없다).
*/
const STORAGE_KEY = 'openplan.plan.hourScale'

/* HOUR_PX_STEPS는 오름차순이라 앞/뒤에서 처음 만나는 것이 곧 가장 가까운 이웃이다. */
const lastIndexWhere = (pred) => {
  for (let i = HOUR_PX_STEPS.length - 1; i >= 0; i -= 1) if (pred(HOUR_PX_STEPS[i])) return i
  return -1
}
const firstIndexWhere = (pred) => {
  for (let i = 0; i < HOUR_PX_STEPS.length; i += 1) if (pred(HOUR_PX_STEPS[i])) return i
  return -1
}

/* 저장값이 이 문자열이면 맞춤 모드. 숫자 인덱스와 한 칸을 나눠 쓰므로 예전
   빌드가 남긴 "2" 같은 값도 그대로 수동 단계로 읽힌다(마이그레이션 불필요). */
export const FIT = 'fit'

/*
  Defensive — localStorage can throw (privacy mode, quota, embedded webviews)
  or simply hold junk from an older build. 어느 쪽이든 기본값(맞춤)으로 조용히
  돌아가면 될 뿐, 화면이 깨질 일은 아니다. (onboardingFixtures.js가 같은
  이유로 쓰는 방어 형태를 그대로 따랐다.)
*/
function readStored() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw == null || raw === FIT) return FIT
    const parsed = Number.parseInt(raw, 10)
    return Number.isNaN(parsed) ? FIT : clampHourPxIndex(parsed)
  } catch {
    return FIT
  }
}

/**
 * @param {{ fitHourPx?: number|null }} [options]
 *   `fitHourPx` — 페이지가 측정한 달력 높이로 계산한 "딱 맞는" px/시간.
 *   아직 측정 전이면 null을 넘기면 된다(그동안은 기본 단계로 그린다).
 * @returns {{
 *   value: number|'fit',     // 저장되는 상태 그 자체
 *   isFit: boolean,
 *   hourPx: number,          // 지금 실제로 쓰이는 1시간당 픽셀
 *   pxPerMin: number,        // 그리드·드래그·블록에 그대로 넘기는 축척
 *   setIndex: (i:number)=>void,
 *   setFit: ()=>void,
 *   zoomIn: ()=>void,
 *   zoomOut: ()=>void,
 *   canZoomOut: boolean,
 *   canZoomIn: boolean,
 * }}
 */
export function useHourScale({ fitHourPx = null } = {}) {
  // 초기값은 lazy initializer로 — 매 렌더마다 localStorage를 읽을 이유가 없다.
  const [value, setValue] = useState(readStored)

  const setIndex = useCallback((next) => {
    setValue(clampHourPxIndex(next))
  }, [])

  const setFit = useCallback(() => setValue(FIT), [])

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value))
    } catch {
      // 저장이 안 되면 이번 세션에만 적용된다 — 조절 자체는 계속 동작한다.
    }
  }, [value])

  const isFit = value === FIT
  // 맞춤인데 아직 측정 전이면 기본 단계로 그린다 — 첫 페인트에서 0이나 NaN을
  // 축척으로 쓰면 모든 블록이 한 줄에 겹쳐 보인다.
  const hourPx = isFit
    ? (fitHourPx ?? HOUR_PX_STEPS[DEFAULT_HOUR_PX_INDEX])
    : HOUR_PX_STEPS[clampHourPxIndex(value)]

  /*
    맞춤에서 +/− 를 누르면 "지금 보이는 크기" 바로 옆 단계로 간다 — 지금 축척
    **보다 작은 것 중 가장 큰** 단계(좁게), **보다 큰 것 중 가장 작은**
    단계(넓게). 저장해 둔 옛 인덱스로 돌아가면 화면이 크게 튀어 "한 칸 조절"이
    아니게 된다.

    "가장 가까운 단계 ±1"이 아니라 굳이 부등호로 고른 이유: 맞춤 축척은 단계표
    밖(예: 28 또는 73)일 수 있다. 가장 가까운 단계를 거쳐 가면 28에서 [좁게]가
    30을 골라 오히려 넓어지는 일이 생긴다. 부등호로 고르면 그 방향으로 갈 곳이
    없다는 사실이 그대로 -1이 되어, 아래 canZoom*이 버튼을 정확히 잠근다.
  */
  const below = isFit ? lastIndexWhere((px) => px < hourPx) : clampHourPxIndex(value) - 1
  const above = isFit ? firstIndexWhere((px) => px > hourPx) : clampHourPxIndex(value) + 1
  const canZoomOut = below >= 0
  const canZoomIn = above >= 0 && above < HOUR_PX_STEPS.length
  const zoomOut = useCallback(() => {
    if (below >= 0) setIndex(below)
  }, [setIndex, below])
  const zoomIn = useCallback(() => {
    if (above >= 0 && above < HOUR_PX_STEPS.length) setIndex(above)
  }, [setIndex, above])

  return {
    value,
    isFit,
    hourPx,
    pxPerMin: hourPx / 60,
    setIndex,
    setFit,
    zoomIn,
    zoomOut,
    canZoomOut,
    canZoomIn,
  }
}

export default useHourScale
