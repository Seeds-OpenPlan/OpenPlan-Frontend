import { useId, useRef, useState } from 'react'
import { Dialog } from '../common/Dialog'
import { BottomSheet } from '../common/BottomSheet'
import { Button } from '../common/Button'
import { Toggle } from '../common/Toggle'
import { LoadingSkeleton } from '../common/LoadingSkeleton'
import { ErrorState } from '../common/ErrorState'
import { GoogleGIcon, AppleGlyphIcon } from './settingsIcons'
import { AppleConnectDialog } from './AppleConnectDialog'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import {
  useConnections,
  useAvailableCalendars,
  useSetConnectionStatus,
  useReplaceSelectedCalendars,
  useDisconnectConnection,
} from '../../features/settings/useSettings'
import {
  CONNECTION_STATUS,
  GOOGLE_CALENDAR_REDIRECT_URI,
  googleCalendarAuthorizationUrl,
} from '../../features/settings/settingsApi'

// PROVIDER_ICON — 이미 정본(서버가 화면에 맞춰졌다, 6주차 문서 §0). 이 상수
// 자체는 W6 connectionId 전환과 무관하게 그대로 둔다.
const PROVIDER_ICON = { GOOGLE: GoogleGIcon, APPLE: AppleGlyphIcon }
const PROVIDERS = [
  { provider: 'GOOGLE', label: 'Google 캘린더' },
  { provider: 'APPLE', label: 'Apple 캘린더' },
]

function CalendarSelectDialog({ connection, onClose, onSubmit, submitting }) {
  const isDesktop = useIsDesktop()
  const titleId = useId()
  const firstCheckboxRef = useRef(null)
  // W6: 선택 가능한 캘린더는 connections 응답에 얹혀 오지 않는다 — 다이얼로그가
  // 열릴 때 그 자리에서 GET .../{connectionId}/calendars로 따로 불러온다
  // (settingsApi.js getAvailableCalendars 헤더 참조).
  const calendarsQuery = useAvailableCalendars(connection.connectionId)
  const [selected, setSelected] = useState(() => new Set(connection.selectedCalendarIds))

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
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
        <li key={cal.id}>
          <label className="flex items-center gap-3 rounded-control px-2 py-2 hover:bg-surface-sunken">
            <input
              ref={i === 0 ? firstCheckboxRef : undefined}
              type="checkbox"
              checked={selected.has(cal.id)}
              onChange={() => toggle(cal.id)}
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
          onClick={() => onSubmit(Array.from(selected))}
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

function DisconnectConfirmDialog({ connection, onClose, onConfirm, submitting }) {
  const isDesktop = useIsDesktop()
  const titleId = useId()
  const confirmRef = useRef(null)

  const body = (
    <div className="flex flex-col gap-4">
      <h2 id={titleId} className="text-title font-semibold text-text">
        {connection.label} 연동을 해제할까요?
      </h2>
      <p className="text-body text-text-muted">
        연동을 해제하면 이후 반영되지 않습니다. 이미 계획에 반영된 일정은 그대로 남습니다.
      </p>
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
  const disconnect = useDisconnectConnection()

  const [disconnectTarget, setDisconnectTarget] = useState(null) // {connectionId, label} | null
  const [calendarEditTarget, setCalendarEditTarget] = useState(null) // {connectionId, label, selectedCalendarIds} | null
  const [connectingProvider, setConnectingProvider] = useState(null) // 'APPLE' | null

  if (query.isLoading) return <LoadingSkeleton preset="listRow" count={2} />
  if (query.isError) return <ErrorState variant="section" onAction={() => query.refetch()} />

  const connections = query.data ?? []
  const connectionFor = (provider) => connections.find((c) => c.provider === provider)

  return (
    <>
      <ul className="flex flex-col gap-3">
        {PROVIDERS.map(({ provider, label }) => {
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
                  // 헤더 참조). redirectUri가 아직 TODO라 그 값이 채워지기
                  // 전까지는 시작 자체를 막는다 — settingsApi.js
                  // GOOGLE_CALENDAR_REDIRECT_URI 헤더 참조.
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!GOOGLE_CALENDAR_REDIRECT_URI}
                    disabledReason={!GOOGLE_CALENDAR_REDIRECT_URI ? '콜백 주소 등록 후 제공됩니다' : undefined}
                    onClick={() => {
                      window.location.href = googleCalendarAuthorizationUrl(GOOGLE_CALENDAR_REDIRECT_URI)
                    }}
                  >
                    연동하기
                  </Button>
                )}
              </div>

              {conn && isActive && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                  <span className="text-caption text-text-muted">
                    {conn.selectedCalendarIds.length}개 캘린더 선택됨
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setCalendarEditTarget({ ...conn, label })}
                    >
                      가져올 캘린더 선택
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
          onSubmit={(calendarIds) =>
            replaceCalendars.mutate(
              { connectionId: calendarEditTarget.connectionId, calendarIds },
              { onSuccess: () => setCalendarEditTarget(null) },
            )
          }
        />
      )}

      {connectingProvider === 'APPLE' && <AppleConnectDialog onClose={() => setConnectingProvider(null)} />}
    </>
  )
}

export default CalendarConnectionSection
