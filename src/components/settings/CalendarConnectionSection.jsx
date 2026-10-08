import { useId, useRef, useState } from 'react'
import { Dialog } from '../common/Dialog'
import { BottomSheet } from '../common/BottomSheet'
import { Button } from '../common/Button'
import { Toggle } from '../common/Toggle'
import { LoadingSkeleton } from '../common/LoadingSkeleton'
import { ErrorState } from '../common/ErrorState'
import { GoogleGIcon, AppleGlyphIcon } from './settingsIcons'
import { AppleConnectDialog } from './AppleConnectDialog'
import { useLockedIsDesktop } from '../../hooks/useMediaQuery'
import { isAndroidAppShell } from '../../utils/appShell'
import {
  useConnections,
  useAvailableCalendars,
  useSetConnectionStatus,
  useReplaceSelectedCalendars,
  useSetWriteCalendar,
  useDisconnectConnection,
  useApplyCandidateEvents,
} from '../../features/settings/useSettings'
import {
  CONNECTION_STATUS,
  googleCalendarRedirectUri,
  googleCalendarAuthorizationUrl,
} from '../../features/settings/settingsApi'

// PROVIDER_ICON — 이미 정본(서버가 화면에 맞춰졌다, 6주차 문서 §0). 이 상수
// 자체는 W6 connectionId 전환과 무관하게 그대로 둔다.
const PROVIDER_ICON = { GOOGLE: GoogleGIcon, APPLE: AppleGlyphIcon }
const ALL_PROVIDERS = [
  { provider: 'GOOGLE', label: 'Google 캘린더' },
  { provider: 'APPLE', label: 'Apple 캘린더' },
]

/*
  안드로이드 앱(TWA)에서는 애플 캘린더 행을 그리지 않는다.

  이 배열이 제공자 행을 그리는 유일한 곳이라, 여기서 빠지면 **애플 연동을 만들 경로가
  사라진다**(온보딩 캘린더 단계도 이 컴포넌트를 그대로 재사용한다). 서버·계약·기존 연동은
  그대로 두므로, 웹에서는 지금과 똑같이 동작하고 나중에 되살리는 것도 이 한 줄이다.

  🔴 **코드를 지우는 것이 아니라 숨기는 것이다.** 애플 CalDAV 어댑터는 BE 에 그대로 있고
  이미 연동해 둔 이용자의 데이터도 건드리지 않는다 — 앱에서 제공자 «추가» 입구만 닫는다.
  (이미 애플을 연동한 이용자가 앱으로 들어오면 그 행이 안 보이는데, 연동 자체는 서버에
  살아 있어 가져오기는 계속 돈다. 해제하려면 웹에서 하면 된다.)

  왜 앱에서만인가 — 안드로이드 앱 이용자에게 Apple ID 앱 암호 발급을 요구하는 것은
  현실적이지 않은데(appleid.apple.com 에서 직접 발급해야 한다), 웹에는 맥·아이폰에서
  쓰는 이용자가 있다. 그래서 웹에서는 그대로 둔다.
*/
function visibleProviders() {
  return isAndroidAppShell()
    ? ALL_PROVIDERS.filter(({ provider }) => provider !== 'APPLE')
    : ALL_PROVIDERS
}

function CalendarSelectDialog({ connection, onClose, onSubmit, submitting }) {
  // D1: 부모가 열릴 때만 새로 마운트(fresh per open) — 마운트 시점에 고정.
  const isDesktop = useLockedIsDesktop()
  const titleId = useId()
  const firstCheckboxRef = useRef(null)
  // W6: 선택 가능한 캘린더는 connections 응답에 얹혀 오지 않는다 — 다이얼로그가
  // 열릴 때 그 자리에서 GET .../{connectionId}/calendars로 따로 불러온다
  // (settingsApi.js getAvailableCalendars 헤더 참조). 이 목록의 각 항목이
  // `{externalCalendarId, name, selected}`다(계약 원문, Thomas 리뷰 BLOCKER) —
  // `id`가 아니다. 초기 선택 상태는 `connection.selectedCalendars`(connections
  // 목록에서 이미 받아 온 값, 이 다이얼로그가 열리는 시점엔 항상 로드돼 있다)
  // 에서 즉시 시드한다 — calendarsQuery가 아직 로딩 중이어도 체크박스가 빈
  // 채로 깜빡였다가 채워지지 않는다.
  const calendarsQuery = useAvailableCalendars(connection.connectionId)
  const [selected, setSelected] = useState(
    () => new Set(connection.selectedCalendars.map((c) => c.externalCalendarId)),
  )

  const toggle = (externalCalendarId) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(externalCalendarId)) next.delete(externalCalendarId)
      else next.add(externalCalendarId)
      return next
    })
  }

  const listBody = calendarsQuery.isLoading ? (
    <LoadingSkeleton preset="listRow" count={2} />
  ) : calendarsQuery.isError ? (
    <ErrorState variant="inline" onAction={() => calendarsQuery.refetch()} />
  ) : (
    <ul className="flex flex-col gap-1">
      {(calendarsQuery.data ?? []).map((cal, i) => (
        <li key={cal.externalCalendarId}>
          <label className="flex items-center gap-3 rounded-control px-2 py-2 hover:bg-surface-sunken">
            <input
              ref={i === 0 ? firstCheckboxRef : undefined}
              type="checkbox"
              checked={selected.has(cal.externalCalendarId)}
              onChange={() => toggle(cal.externalCalendarId)}
            />
            <span className="text-label text-text">{cal.name}</span>
          </label>
        </li>
      ))}
    </ul>
  )

  const body = (
    <div className="flex flex-col gap-4">
      <h2 id={titleId} className="text-title font-semibold text-text">
        {connection.label} 캘린더 선택
      </h2>
      <p className="text-caption text-text-muted">
        선택한 캘린더의 일정만 이번 주 계획에 반영됩니다. 저장하면 전체 목록이 지금 선택으로 교체됩니다.
        선택한 캘린더가 없으면 일정을 가져오지 않습니다.
      </p>
      {listBody}
      <div className="mt-1 flex justify-end gap-2">
        <Button variant="secondary" size="md" onClick={onClose}>
          취소
        </Button>
        <Button
          variant="primary"
          size="md"
          loading={submitting}
          disabled={calendarsQuery.isLoading}
          // PUT body는 id뿐 아니라 name도 요구한다(계약 원문, replaceSelectedCalendars
          // 헤더 참고) — id만 들고 있던 `selected` Set으로는 그 body를 만들 수
          // 없어, 지금 로드돼 있는 calendarsQuery.data에서 선택된 항목의
          // {externalCalendarId, name}을 그대로 뽑아 넘긴다.
          onClick={() =>
            onSubmit(
              (calendarsQuery.data ?? [])
                .filter((cal) => selected.has(cal.externalCalendarId))
                .map((cal) => ({ externalCalendarId: cal.externalCalendarId, name: cal.name })),
            )
          }
        >
          저장
        </Button>
      </div>
    </div>
  )

  if (isDesktop) {
    return (
      <Dialog open onClose={onClose} labelledById={titleId} initialFocusRef={firstCheckboxRef}>
        {body}
      </Dialog>
    )
  }
  return (
    <BottomSheet open onClose={onClose} labelledById={titleId} initialFocusRef={firstCheckboxRef}>
      {body}
    </BottomSheet>
  )
}

/*
  WriteCalendarDialog — 내보낼 대상 캘린더 하나 (이슈 #69).

  CalendarSelectDialog(가져올 캘린더)와 방향이 반대다: 그쪽은 여러 개를 체크해
  외부→OpenPlan 으로 읽어오고, 이쪽은 **하나만** 골라 OpenPlan→외부로 내보낸다.
  그래서 체크박스가 아니라 라디오이고, "내보내지 않음"이 목록의 첫 항목으로 늘
  있다 — 해제가 설정 해제 버튼이 아니라 하나의 선택지여야 되돌리기가 쉽다.

  목록을 다이얼로그가 열릴 때 그 자리에서 불러오는 이유는 CalendarSelectDialog
  와 같다(settingsApi.getAvailableCalendars 헤더): 이 조회가 제공자를 실제로
  호출하므로 설정 화면을 여는 것만으로 두 번 부르게 만들지 않는다.
*/
function WriteCalendarDialog({ connection, onClose, onSubmit, submitting }) {
  // D1: 부모가 열릴 때만 새로 마운트(fresh per open) — 마운트 시점에 고정.
  const isDesktop = useLockedIsDesktop()
  const titleId = useId()
  const firstOptionRef = useRef(null)
  const calendarsQuery = useAvailableCalendars(connection.connectionId)
  // 서버가 돌려준 현재 대상으로 시드한다. null(미지정)이면 "내보내지 않음"이 선택된다.
  const [picked, setPicked] = useState(() => connection.writeCalendarId ?? null)

  const options = [
    { externalCalendarId: null, name: '내보내지 않음' },
    ...(calendarsQuery.data ?? []),
  ]

  const listBody = calendarsQuery.isLoading ? (
    <LoadingSkeleton preset="listRow" count={2} />
  ) : calendarsQuery.isError ? (
    <ErrorState variant="inline" onAction={() => calendarsQuery.refetch()} />
  ) : (
    <ul className="flex flex-col gap-1">
      {options.map((cal, i) => (
        <li key={cal.externalCalendarId ?? '__none__'}>
          <label className="flex items-center gap-3 rounded-control px-2 py-2 hover:bg-surface-sunken">
            <input
              ref={i === 0 ? firstOptionRef : undefined}
              type="radio"
              name={`write-calendar-${connection.connectionId}`}
              checked={picked === cal.externalCalendarId}
              onChange={() => setPicked(cal.externalCalendarId)}
            />
            <span className="text-label text-text">{cal.name}</span>
          </label>
        </li>
      ))}
    </ul>
  )

  const body = (
    <div className="flex flex-col gap-4">
      <h2 id={titleId} className="text-title font-semibold text-text">
        {connection.label}에 내보낼 캘린더
      </h2>
      <p className="text-caption text-text-muted">
        OpenPlan 에서 만들거나 고친 일정·태스크가 여기 고른 캘린더에 반영됩니다. 고르지 않으면 아무것도
        내보내지 않습니다. 이미 내보낸 일정은 대상을 바꿔도 외부에 그대로 남습니다.
      </p>
      {listBody}
      <div className="mt-1 flex justify-end gap-2">
        <Button variant="secondary" size="md" onClick={onClose}>
          취소
        </Button>
        <Button
          variant="primary"
          size="md"
          loading={submitting}
          disabled={calendarsQuery.isLoading}
          onClick={() => onSubmit(picked)}
        >
          저장
        </Button>
      </div>
    </div>
  )

  if (isDesktop) {
    return (
      <Dialog open onClose={onClose} labelledById={titleId} initialFocusRef={firstOptionRef}>
        {body}
      </Dialog>
    )
  }
  return (
    <BottomSheet open onClose={onClose} labelledById={titleId} initialFocusRef={firstOptionRef}>
      {body}
    </BottomSheet>
  )
}

function DisconnectConfirmDialog({ connection, onClose, onConfirm, submitting }) {
  // D1: 부모가 열릴 때만 새로 마운트(fresh per open) — 마운트 시점에 고정.
  const isDesktop = useLockedIsDesktop()
  const titleId = useId()
  const confirmRef = useRef(null)

  const body = (
    <div className="flex flex-col gap-4">
      <h2 id={titleId} className="text-title font-semibold text-text">
        {connection.label} 연동을 해제할까요?
      </h2>
      {/*
        🔴 아웃바운드 문구는 **실제로 내보내고 있을 때만** 보여 준다.

        이 문구를 조건 없이 띄우면, 아웃바운드가 배포되기 전이거나 사용자가 대상
        캘린더를 고르지 않은 연동에서도 "이미 외부 캘린더에 만들어진 일정" 이 있는 것처럼
        안내하게 된다 — 한 번도 만들어진 적 없는 것을 두고.

        판정은 피처 플래그가 아니라 서버가 주는 사실로 한다: writeCalendarId 가 비어 있으면
        큐가 아무것도 적지 않으므로(= 내보낸 것이 없다) 가져오기 전용 문구가 맞다.

        🔴 이 필드는 아직 main 의 계약에 없다 — BE #85(`setWriteCalendar`)가 머지되면서
        ExternalConnection 스키마에 writeCalendarId·canWrite 가 추가된다. 그전까지 서버는
        이 필드를 보내지 않아 undefined 이고, **그때는 가져오기 전용 문구가 사실이므로
        그대로가 맞다.** 즉 이 분기는 BE #85 배포 전에는 «항상 가져오기 전용», 배포 뒤에는
        «사용자가 대상을 고른 연동만 양방향» 으로 동작한다. 의도한 순서다.
      */}
      {connection.writeCalendarId ? (
        <p className="text-body text-text-muted">
          연동을 해제하면 이후 양방향 반영이 멈춥니다. 이미 계획에 반영된 일정과, 이미 외부 캘린더에
          만들어진 일정은 <b>양쪽 모두 그대로 남습니다</b> — 어느 쪽도 임의로 지우지 않습니다.
        </p>
      ) : (
        <p className="text-body text-text-muted">
          연동을 해제하면 이후 반영되지 않습니다. 이미 계획에 반영된 일정은 그대로 남습니다.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="md" onClick={onClose}>
          취소
        </Button>
        <Button ref={confirmRef} variant="danger" size="md" loading={submitting} onClick={onConfirm}>
          연동 해제
        </Button>
      </div>
    </div>
  )

  if (isDesktop) {
    return (
      <Dialog open onClose={onClose} labelledById={titleId} initialFocusRef={confirmRef}>
        {body}
      </Dialog>
    )
  }
  return (
    <BottomSheet open onClose={onClose} labelledById={titleId} initialFocusRef={confirmRef}>
      {body}
    </BottomSheet>
  )
}

/*
  CalendarConnectionSection — 연동 (FIX-13~17 + 신규 연동 생성). 독립 하위
  화면(SettingsCalendarPage)의 본문이자 온보딩 캘린더 단계(OnboardingCalendarStep)
  가 그대로 재사용하는 컴포넌트 — 두 화면이 같은 연동 상태를 공유한다.

  W6 재설계 (팀장 지시, 근거: 6주차 작업내용 문서 §0): 서버는 이제 "이미
  수립된 연동"만 돌려준다(0~2개, connectionId 키). 화면은 여전히 provider별
  2행 고정을 보여줘야 하므로(디자인 목업 §SET.5), 고정된 PROVIDERS 목록과
  서버 응답을 이 컴포넌트가 직접 대조해 "미연결" 행을 합성한다 — 미연결 행은
  [연동하기] 버튼 하나만 갖고, 연결된 행은 기존과 같은 Toggle + 캘린더 선택 +
  연동 해제를 갖는다.

  Toggle과 [연동 해제]가 이제 분리된 두 동작이다(이전엔 Toggle을 끄는 것 자체가
  해제 확인창을 띄웠다): 계약이 PATCH status(일시 정지/재개, 비파괴적)와
  DELETE(자격증명 삭제, 파괴적)를 별도 엔드포인트로 나눠 둬서, Toggle은
  확인 없이 즉시 저장하고 진짜 "해제"만 확인창을 거친다(디자인 목업도 두
  버튼을 나란히 보여준다 — "가져올 캘린더 선택" / "연동 해제").
*/
export function CalendarConnectionSection() {
  const query = useConnections()
  const setStatus = useSetConnectionStatus()
  const replaceCalendars = useReplaceSelectedCalendars()
  const setWriteCalendar = useSetWriteCalendar()
  const disconnect = useDisconnectConnection()
  const applyEvents = useApplyCandidateEvents()

  const [disconnectTarget, setDisconnectTarget] = useState(null) // {connectionId, label} | null
  const [calendarEditTarget, setCalendarEditTarget] = useState(null) // {connectionId, label, selectedCalendars} | null
  const [writeCalendarTarget, setWriteCalendarTarget] = useState(null) // {connectionId, label, writeCalendarId} | null
  const [connectingProvider, setConnectingProvider] = useState(null) // 'APPLE' | null

  if (query.isLoading) return <LoadingSkeleton preset="listRow" count={2} />
  if (query.isError) return <ErrorState variant="section" onAction={() => query.refetch()} />

  const connections = query.data ?? []
  const connectionFor = (provider) => connections.find((c) => c.provider === provider)

  return (
    <>
      <ul className="flex flex-col gap-3">
        {visibleProviders().map(({ provider, label }) => {
          const Icon = PROVIDER_ICON[provider]
          const conn = connectionFor(provider)
          const isActive = conn?.status === CONNECTION_STATUS.CONNECTED

          return (
            <li key={provider} className="rounded-card border border-border p-4">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-surface-sunken text-text"
                >
                  <Icon size={20} />
                </span>
                <span className="flex flex-1 flex-col">
                  <span className="text-label font-medium text-text">{label}</span>
                  <span className="text-caption text-text-muted">
                    {conn ? (conn.accountIdentifier ?? '외부 일정 연동') : '미연결'}
                  </span>
                </span>

                {conn ? (
                  <Toggle
                    checked={isActive}
                    onChange={(next) =>
                      setStatus.mutate({
                        connectionId: conn.connectionId,
                        status: next ? CONNECTION_STATUS.CONNECTED : CONNECTION_STATUS.DISABLED,
                      })
                    }
                    ariaLabel={`${label} 연동`}
                  />
                ) : provider === 'APPLE' ? (
                  <Button variant="secondary" size="sm" onClick={() => setConnectingProvider('APPLE')}>
                    연동하기
                  </Button>
                ) : (
                  // 구글은 서버가 발급하는 인가 주소로 페이지 전체가 이동한다
                  // (프론트에서 조립하지 않는 이유는 googleCalendarAuthorizationUrl
                  // 헤더 참조). redirectUri는 클릭 시점에 googleCalendarRedirectUri()
                  // 로 조립한다 — 콜백 페이지(GoogleCalendarCallbackPage)도 같은
                  // 함수를 호출해, 인가 요청과 토큰 교환의 redirectUri가 항상
                  // 일치하게 한다(settingsApi.js googleCalendarRedirectUri 헤더 참조).
                  // W6부터 이 게이트를 없앴다 — 다만 배포(raw IP, HTTPS 미보유)에서는
                  // 구글이 이 값 자체를 거부할 수 있다는 한계는 여전히 남는다.
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      window.location.href = googleCalendarAuthorizationUrl(googleCalendarRedirectUri())
                    }}
                  >
                    연동하기
                  </Button>
                )}
              </div>

              {conn && isActive && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                  {/*
                    «가져오기 n개» 만 보여 주던 자리에 내보내기 상태를 나란히 둔다.
                    두 방향이 별개 설정인데 한쪽만 보이면, 가져오기를 켠 사용자가
                    내보내기도 켜진 것으로 읽는다. canWrite·writeCalendarId 가 없는
                    (이 계약 이전의) 서버에서는 내보내기 문구를 아예 감춘다 — 모르는
                    것을 «꺼짐» 이라 적으면 그것이 거짓이 된다.
                  */}
                  <span className="text-caption text-text-muted">
                    {conn.selectedCalendars.length}개 캘린더 가져오기
                    {conn.canWrite !== undefined && (
                      <>
                        {' · '}
                        {conn.canWrite === false
                          ? '내보내기 불가(쓰기 권한 없음)'
                          : conn.writeCalendarId
                            ? '내보내기 켜짐'
                            : '내보내기 꺼짐'}
                      </>
                    )}
                  </span>
                  <div className="flex gap-2">
                    {/*
                      ONB-08/09 — 이 버튼이 외부 일정을 주간 계획까지 실어 나르는
                      유일한 경로다. 연동 추가와 캘린더 선택만으로는 서버가 제공자를
                      부르지도 않고(동기화는 후보 조회 시점에 돈다), 가져온 일정도
                      CANDIDATE에 머물러 고정 일정이 되지 않는다 — 두 단계가 모두
                      빠져 있어 "연동은 됐는데 주간 계획이 빈" 상태가 됐다.
                      useApplyCandidateEvents가 조회(=동기화)와 반영을 한 동작으로 묶는다.

                      캘린더를 하나도 안 골랐으면 누르지 못하게 막는다. 서버가 그 경우
                      제공자를 부르지 않고 빈 목록을 돌려주는데, 그러면 "일정이 없다"와
                      "고를 캘린더를 안 골랐다"가 화면에서 같아 보인다.
                    */}
                    <Button
                      variant="primary"
                      size="sm"
                      loading={applyEvents.isPending}
                      disabled={conn.selectedCalendars.length === 0}
                      title={
                        conn.selectedCalendars.length === 0
                          ? '가져올 캘린더를 먼저 선택해 주세요'
                          : undefined
                      }
                      onClick={() => applyEvents.mutate(conn.connectionId)}
                    >
                      일정 가져와 반영
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setCalendarEditTarget({ ...conn, label })}
                    >
                      가져올 캘린더 선택
                    </Button>
                    {/*
                      이슈 #69 — 내보내기의 유일한 스위치다. 이 대상이 비어 있으면
                      서버는 변경을 큐에 넣지 않고 조용히 지나간다(오류도 표시도 없다).
                      canWrite 가 거짓이면 대상을 골라도 나가지 않으므로 그때는 막고
                      이유를 Button 의 disabledReason 으로 말한다(hover 전용 title 이
                      아니다 — SYS-07 §7.2). 옆의 "가져와 반영" 버튼은 아직 title 을
                      쓰지만, 그 코드가 이미 그 계약을 어기고 있는 것이라 따르지 않는다.

                      canWrite 가 undefined 인 경우(이 계약 이전의 서버)는 막지 않는다:
                      프론트가 먼저 배포됐을 때 기능을 없는 것으로 만들면 안 된다.
                    */}
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={conn.canWrite === false}
                      // hover 전용 title 이 아니라 Button 의 disabledReason 을 쓴다 —
                      // 그 계약이 "키보드·스크린리더 사용자도 hover 없이 읽어야 한다"
                      // (SYS-07 §7.2)를 명시하고, 이 화면은 BottomSheet 분기를 둘 만큼
                      // 터치를 실제 대상으로 삼는다(hover 가 아예 없는 기기).
                      disabledReason={
                        conn.canWrite === false
                          ? '쓰기 권한이 없습니다. 연동을 해제하고 다시 연동하면 권한을 요청합니다.'
                          : undefined
                      }
                      onClick={() => setWriteCalendarTarget({ ...conn, label })}
                    >
                      내보낼 캘린더
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => setDisconnectTarget({ ...conn, label })}>
                      연동 해제
                    </Button>
                  </div>
                </div>
              )}
              {conn && !isActive && (
                <p className="mt-2 border-t border-border pt-3 text-caption text-text-muted">
                  이 캘린더의 일정은 주간 계획에 반영되지 않습니다.
                </p>
              )}
            </li>
          )
        })}
      </ul>

      {disconnectTarget && (
        <DisconnectConfirmDialog
          connection={disconnectTarget}
          onClose={() => setDisconnectTarget(null)}
          submitting={disconnect.isPending}
          onConfirm={() =>
            disconnect.mutate(disconnectTarget.connectionId, { onSuccess: () => setDisconnectTarget(null) })
          }
        />
      )}

      {calendarEditTarget && (
        <CalendarSelectDialog
          connection={calendarEditTarget}
          onClose={() => setCalendarEditTarget(null)}
          submitting={replaceCalendars.isPending}
          onSubmit={(selections) =>
            replaceCalendars.mutate(
              { connectionId: calendarEditTarget.connectionId, selections },
              { onSuccess: () => setCalendarEditTarget(null) },
            )
          }
        />
      )}

      {writeCalendarTarget && (
        <WriteCalendarDialog
          connection={writeCalendarTarget}
          onClose={() => setWriteCalendarTarget(null)}
          submitting={setWriteCalendar.isPending}
          onSubmit={(externalCalendarId) =>
            setWriteCalendar.mutate(
              { connectionId: writeCalendarTarget.connectionId, externalCalendarId },
              { onSuccess: () => setWriteCalendarTarget(null) },
            )
          }
        />
      )}

      {connectingProvider === 'APPLE' && <AppleConnectDialog onClose={() => setConnectingProvider(null)} />}
    </>
  )
}

export default CalendarConnectionSection
