import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton'
import { ErrorState } from '../../components/common/ErrorState'
import { googleCalendarRedirectUri } from '../../features/settings/settingsApi'
import { useCreateGoogleConnection } from '../../features/settings/useSettings'

/*
  GoogleCalendarCallbackPage — FIX-14 구글 경로의 착지점. **구글이** 인가를
  마치고 여기로 직접 돌려보내면서 붙이는 `code`·`state` 쿼리스트링을 읽어
  POST /external-calendar-connections로 넘긴다.

  🔴 이전 주석은 "서버가 302로 `authCode`를 실어 보낸다"고 적고 코드도 그렇게
  읽고 있었는데, 그 경로에 서버는 없다. 서버가 구글에 넘기는 `redirect_uri`가
  바로 이 페이지 주소이기 때문에(ExternalCalendarAuthorization.authorizationUrl —
  `googleCalendarRedirectUri()`가 만든 값을 그대로 실어 보낸다), 구글은 서버를
  거치지 않고 브라우저를 여기로 보낸다. 그리고 구글은 인가 코드를 OAuth 2.0
  규격대로 **`code`**라는 이름으로 붙인다 — `authCode`라는 파라미터는 오지 않는다.
  그래서 이 페이지는 항상 `authCode === null`이 되어 "연동 정보를 확인하지
  못했습니다"만 띄웠고, 구글 연동이 끝까지 성공한 적이 없다.

  `authCode`도 폴백으로 남겨 둔다 — 서버가 나중에 중간에서 받아 이름을 바꿔
  넘기는 구조로 가더라도 이 페이지가 다시 깨지지 않게. 다만 지금 실제로 오는
  것은 `code`다.

  POST 본문의 필드명이 `authCode`인 것은 맞다(계약 `CreateConnectionRequest`) —
  틀렸던 것은 **URL에서 읽는 이름**뿐이다.

  authCode/state 자체의 유효성(서명·만료)은 서버 몫이라 여기서 검증하지 않는다
  — 파라미터 누락(콜백이 아예 실패해 아무것도 안 실려온 경우)만 화면에서
  걸러낸다. `firedRef`는 React 18+ StrictMode의 effect 이중 실행이나 이
  페이지의 재렌더로 같은 authCode를 두 번 POST하는 것을 막는다 — authCode는
  보통 1회용이라 두 번째 호출은 서버에서 실패할 뿐 아니라, 사용자가 화면을
  보기도 전에 상태가 꼬일 수 있다.
*/
export function GoogleCalendarCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const createConnection = useCreateGoogleConnection()
  const firedRef = useRef(false)

  const authCode = searchParams.get('code') ?? searchParams.get('authCode')
  const state = searchParams.get('state')

  // 최초 시도(effect)와 502 뒤 [다시 시도] 버튼이 같은 mutate 호출을 공유한다
  // (Thomas 리뷰 MAJOR fix — 이전엔 재시도 쪽에만 onSuccess가 빠져 있어, 재시도가
  // 성공해도 이동하지 않고 화면이 영영 스켈레톤에 갇혔다). 한 함수로 묶어 두 곳이
  // 다시 갈라지지 않게 한다.
  // redirectUri는 여기서도 googleCalendarRedirectUri()로 다시 조립한다(상수를
  // props/캐시로 물려받지 않는다) — 인가 요청 쪽(CalendarConnectionSection)과
  // 완전히 같은 함수를 호출해야 두 값이 한 글자도 어긋나지 않는다(settingsApi.js
  // 헤더 참조). 이 페이지 자체가 그 origin에서 열려 있으므로 값도 동일하게 나온다.
  const attemptConnect = () =>
    createConnection.mutate(
      { authCode, state, redirectUri: googleCalendarRedirectUri() },
      { onSuccess: () => navigate('/settings/calendar', { replace: true }) },
    )

  useEffect(() => {
    if (firedRef.current) return
    if (!authCode || !state) return
    firedRef.current = true
    attemptConnect()
    // authCode/state는 URL이 이미 결정한 값 — 매 렌더 재계산해도 같은 값이라
    // deps에서 의도적으로 뺀다(firedRef가 실제 1회 실행을 보장).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!authCode || !state) {
    return (
      <ErrorState
        variant="page"
        title="연동 정보를 확인하지 못했습니다"
        description="Google에서 필요한 정보를 받지 못했습니다. 설정 화면에서 다시 시도해 주세요."
        actionLabel="설정으로 돌아가기"
        onAction={() => navigate('/settings/calendar', { replace: true })}
      />
    )
  }

  if (createConnection.isError) {
    const isDuplicate = createConnection.error?.status === 409
    return (
      <ErrorState
        variant="page"
        title={isDuplicate ? '이미 연결된 계정입니다' : '연동하지 못했습니다'}
        description={
          isDuplicate ? '다른 Google 계정으로 다시 시도해 주세요.' : '잠시 후 다시 시도해 주세요.'
        }
        actionLabel={isDuplicate ? '설정으로 돌아가기' : '다시 시도'}
        onAction={isDuplicate ? () => navigate('/settings/calendar', { replace: true }) : attemptConnect}
      />
    )
  }

  return <LoadingSkeleton preset="card" />
}

export default GoogleCalendarCallbackPage
