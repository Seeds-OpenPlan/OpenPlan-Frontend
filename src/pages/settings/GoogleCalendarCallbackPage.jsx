import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton'
import { ErrorState } from '../../components/common/ErrorState'
import { GOOGLE_CALENDAR_REDIRECT_URI } from '../../features/settings/settingsApi'
import { useCreateGoogleConnection } from '../../features/settings/useSettings'

/*
  GoogleCalendarCallbackPage — FIX-14 구글 경로의 착지점. 서버가 구글 인가를
  마치고 여기(`GOOGLE_CALENDAR_REDIRECT_URI`가 가리키는 라우트, settingsApi.js
  참조)로 302 리다이렉트하면서 실어 보내는 `authCode`·`state` 쿼리스트링을
  그대로 읽어 POST /external-calendar-connections로 넘긴다(6주차 문서 근거 —
  로컬 openapi.yaml엔 아직 이 필드가 없다).

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

  const authCode = searchParams.get('authCode')
  const state = searchParams.get('state')

  useEffect(() => {
    if (firedRef.current) return
    if (!authCode || !state) return
    firedRef.current = true
    createConnection.mutate(
      { authCode, state, redirectUri: GOOGLE_CALENDAR_REDIRECT_URI },
      { onSuccess: () => navigate('/settings/calendar', { replace: true }) },
    )
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
        onAction={
          isDuplicate
            ? () => navigate('/settings/calendar', { replace: true })
            : () => createConnection.mutate({ authCode, state, redirectUri: GOOGLE_CALENDAR_REDIRECT_URI })
        }
      />
    )
  }

  return <LoadingSkeleton preset="card" />
}

export default GoogleCalendarCallbackPage
