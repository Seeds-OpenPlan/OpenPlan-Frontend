import { useId, useRef, useState } from 'react'
import { Dialog } from '../common/Dialog'
import { BottomSheet } from '../common/BottomSheet'
import { Button } from '../common/Button'
import { Toggle } from '../common/Toggle'
import { LoadingSkeleton } from '../common/LoadingSkeleton'
import { ErrorState } from '../common/ErrorState'
import { GoogleGIcon, AppleGlyphIcon } from './settingsIcons'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import { useConnections, useSetConnectionActive, useReplaceSelectedCalendars } from '../../features/settings/useSettings'

const PROVIDER_ICON = { GOOGLE: GoogleGIcon, APPLE: AppleGlyphIcon }

function CalendarSelectDialog({ connection, onClose, onSubmit, submitting }) {
  const isDesktop = useIsDesktop()
  const titleId = useId()
  const firstCheckboxRef = useRef(null)
  const [selected, setSelected] = useState(new Set(connection.selectedCalendarIds))

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const body = (
    <div className="flex flex-col gap-4">
      <h2 id={titleId} className="text-title font-semibold text-text">
        {connection.label} 캘린더 선택
      </h2>
      <p className="text-caption text-text-muted">
        선택한 캘린더의 일정만 이번 주 계획에 반영됩니다. 저장하면 전체 목록이 지금 선택으로 교체됩니다.
      </p>
      <ul className="flex flex-col gap-1">
        {connection.availableCalendars.map((cal, i) => (
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
      <div className="mt-1 flex justify-end gap-2">
        <Button variant="secondary" size="md" onClick={onClose}>
          취소
        </Button>
        <Button variant="primary" size="md" loading={submitting} onClick={() => onSubmit(Array.from(selected))}>
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
  CalendarConnectionSection — 연동 (FIX-13~17). 독립 하위 화면(SettingsCalendarPage,
  오너 리뷰 3차)의 본문. Google/Apple은 각자 독립된 연결/해제 토글과 캘린더
  선택을 갖는다 — round-1과 같은 모양([가정-확장] connections 배열,
  settingsFixtures.js). 라운드 2에서 한 번 "캘린더 연동" 단일 스위치로 합쳤다가,
  오너 4차 리뷰로 이 화면 한정 정정됐다: provider 선택이라는 부가 개념 자체가
  실사용에서 헷갈린다는 판단.

  두 개의 독립 오버레이 상태(disconnectTarget/calendarEditTarget)는 "정확히
  하나만 열려 있다"는 이 코드베이스의 공통 규약을 그대로 따른다(어느 provider의
  다이얼로그인지는 그 안에 담긴 connection 객체 하나로 결정된다).
*/
export function CalendarConnectionSection() {
  const query = useConnections()
  const setActive = useSetConnectionActive()
  const replaceCalendars = useReplaceSelectedCalendars()

  const [disconnectTarget, setDisconnectTarget] = useState(null) // connection | null
  const [calendarEditTarget, setCalendarEditTarget] = useState(null) // connection | null

  if (query.isLoading) return <LoadingSkeleton preset="listRow" count={2} />
  if (query.isError) return <ErrorState variant="section" onAction={() => query.refetch()} />

  const connections = query.data ?? []

  const handleToggle = (conn, next) => {
    if (next) {
      setActive.mutate({ provider: conn.provider, connected: true })
    } else {
      setDisconnectTarget(conn) // FIX-17 — off는 확인 후에만 실제로 호출
    }
  }

  return (
    <>
      <ul className="flex flex-col gap-3">
        {connections.map((conn) => {
          const Icon = PROVIDER_ICON[conn.provider]
          return (
            <li key={conn.provider} className="rounded-card border border-border p-4">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-surface-sunken text-text"
                >
                  <Icon size={20} />
                </span>
                <span className="flex flex-1 flex-col">
                  <span className="text-label font-medium text-text">{conn.label}</span>
                  <span className="text-caption text-text-muted">외부 일정 연동</span>
                </span>
                <Toggle
                  checked={conn.connected}
                  onChange={(next) => handleToggle(conn, next)}
                  ariaLabel={`${conn.label} 연동`}
                />
              </div>
              {conn.connected && (
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                  <span className="text-caption text-text-muted">
                    {conn.selectedCalendarIds.length}개 캘린더 선택됨
                  </span>
                  <Button variant="secondary" size="sm" onClick={() => setCalendarEditTarget(conn)}>
                    캘린더 선택 편집
                  </Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {disconnectTarget && (
        <DisconnectConfirmDialog
          connection={disconnectTarget}
          onClose={() => setDisconnectTarget(null)}
          submitting={setActive.isPending}
          onConfirm={() =>
            setActive.mutate(
              { provider: disconnectTarget.provider, connected: false },
              { onSuccess: () => setDisconnectTarget(null) },
            )
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
              { provider: calendarEditTarget.provider, calendarIds },
              { onSuccess: () => setCalendarEditTarget(null) },
            )
          }
        />
      )}
    </>
  )
}

export default CalendarConnectionSection
