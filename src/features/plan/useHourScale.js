/*
  주간 그리드의 세로 축척(1시간이 몇 픽셀인가)을 사용자 설정으로 들고 있는 훅
  — 팀장 요청 2026-08-29: "세로 길이는 사용자가 직접 조절해서 한눈에 보이는
  일정 량이 조절 됐으면 좋겠다."

  왜 planGeometry가 아니라 여기인가: planGeometry는 React도 I/O도 없는 순수
  기하 모듈이다(그 파일 자체 헤더). 단계 표·클램프 같은 순수한 부분은 거기
  두고, "고른 값을 기억한다"는 부수효과만 이 훅이 맡는다.

  기억은 localStorage다. 서버에 사용자 설정으로 저장할 수도 있지만, 계약에
  그런 필드가 없고(설정 API는 기본값/가용시간 계열만 다룬다) 이건 기기마다
  달라도 자연스러운 종류의 취향이다 — 27인치 모니터와 노트북에서 같은 축척을
  강요할 이유가 없다.
*/

import { useCallback, useEffect, useState } from 'react'
import { clampHourPxIndex, DEFAULT_HOUR_PX_INDEX, HOUR_PX_STEPS, pxPerMinAt } from './planGeometry'

const STORAGE_KEY = 'openplan.plan.hourScaleIndex'

/*
  Defensive — localStorage can throw (privacy mode, quota, embedded webviews)
  or simply hold junk from an older build. 어느 쪽이든 기본 축척으로 조용히
  돌아가면 될 뿐, 화면이 깨질 일은 아니다. (onboardingFixtures.js가 같은
  이유로 쓰는 방어 형태를 그대로 따랐다.)
*/
function readStoredIndex() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw == null) return DEFAULT_HOUR_PX_INDEX
    return clampHourPxIndex(Number.parseInt(raw, 10))
  } catch {
    return DEFAULT_HOUR_PX_INDEX
  }
}

/**
 * @returns {{
 *   index: number,          // HOUR_PX_STEPS 안의 현재 단계
 *   setIndex: (i:number)=>void,
 *   pxPerMin: number,       // 그리드·드래그·블록에 그대로 넘기는 축척
 *   canZoomOut: boolean,
 *   canZoomIn: boolean,
 * }}
 */
export function useHourScale() {
  // 초기값은 lazy initializer로 — 매 렌더마다 localStorage를 읽을 이유가 없다.
  const [index, setIndexState] = useState(readStoredIndex)

  const setIndex = useCallback((next) => {
    setIndexState(clampHourPxIndex(next))
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(index))
    } catch {
      // 저장이 안 되면 이번 세션에만 적용된다 — 조절 자체는 계속 동작한다.
    }
  }, [index])

  return {
    index,
    setIndex,
    pxPerMin: pxPerMinAt(index),
    canZoomOut: index > 0,
    canZoomIn: index < HOUR_PX_STEPS.length - 1,
  }
}

export default useHourScale
