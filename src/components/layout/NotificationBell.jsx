import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellIcon, SettingsIcon } from './icons'
import { NotificationPanel } from './NotificationPanel'
import { BottomSheet } from '../common/BottomSheet'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import {
  useNotifications,
  useUnreadNotificationCount,
  useMarkNotificationRead,
} from '../../features/notifications/useNotifications'

const PANEL_TITLE_ID = 'notification-panel-title'

/*
  Panel header — "알림" title + a settings-gear shortcut straight to
  SettingsNotificationsPage (owner feedback #3: from the panel itself, not
  just the settings hub's own "알림" row). Shared by both shells below so the
  gear's behavior (navigate + close the panel) is written once.
*/
function PanelHeader({ onOpenSettings }) {
  return (
    <div className="flex items-center justify-between">
      <h2 id={PANEL_TITLE_ID} className="text-title font-semibold text-text">
        알림
      </h2>
      <button
        type="button"
        onClick={onOpenSettings}
        aria-label="알림 설정으로 이동"
        className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <SettingsIcon className="h-4 w-4" />
      </button>
    </div>
  )
}

/*
  PNL-NOTI trigger + shell (ST-F1-15, ux-flow-map §1 "SHELL -.-> NOTI"). One
  self-contained component so TopNav/MobileTopBar each drop it in as a single
  replacement for the static bell glyph they used to render — neither header
  needs to lift panel-open state itself.

  Shell split follows §0.2's own table (PNL-UNPLACED/REVIEW row): desktop gets
  a NON-modal dropdown anchored under the bell (dismissed by outside-click/Esc,
  same pattern UnplacedPanel's desktop drawer already uses — a real scrim
  would be overkill for a small read-mostly list); mobile gets the standard
  modal BottomSheet every other PNL in this codebase falls back to.

  Unread count (badge + sr-only live region) comes from the SAME notifications
  query the panel lists — see useUnreadNotificationCount's own header for why
  there is deliberately no second "count" endpoint.
*/
export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const isDesktop = useIsDesktop()
  const navigate = useNavigate()
  const wrapperRef = useRef(null)
  const bellBtnRef = useRef(null)
  const liveRegionId = useId()

  const query = useNotifications()
  const unreadCount = useUnreadNotificationCount()
  const markRead = useMarkNotificationRead()

  // Desktop-only dismissal: outside click / Esc. BottomSheet handles both of
  // its own on mobile (backdrop + the shared overlay-stack Esc listener), so
  // this effect only ever attaches while the non-modal desktop dropdown is open.
  useEffect(() => {
    if (!open || !isDesktop) return undefined
    const onPointerDown = (e) => {
      if (!wrapperRef.current?.contains(e.target)) setOpen(false)
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, isDesktop])

  // NOTI-03 읽음 처리 + NOTI-04 이동. 읽음 낙관 갱신은 useMarkNotificationRead가
  // 이미 하므로 여기서는 "아직 안 읽었으면 호출"만 판단하고, 네비게이션은 읽음
  // 요청 완료를 기다리지 않는다 — 사용자 입장에서 이동은 즉시 일어나야 하고,
  // 실패 시 롤백은 뮤테이션 쪽 책임(다음에 패널을 열면 여전히 안읽음으로 보인다).
  const handleItemClick = (notification) => {
    if (!notification.readAt) markRead.mutate(notification.notificationId)
    setOpen(false)
    if (notification.routePath) navigate(notification.routePath)
  }

  // 헤더 톱니바퀴 (owner feedback #3) — 알림 설정 화면은 라우트 이동이므로
  // 패널부터 닫아야 뒤에 남은 드롭다운/시트가 없다.
  const openNotificationSettings = () => {
    setOpen(false)
    navigate('/settings/notifications')
  }

  const panelBody = (
    <NotificationPanel
      notifications={query.data}
      isLoading={query.isLoading}
      isError={query.isError}
      onRetry={() => query.refetch()}
      onItemClick={handleItemClick}
    />
  )

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={bellBtnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={unreadCount > 0 ? `알림 (미확인 ${unreadCount}건)` : '알림'}
        className="relative flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <BellIcon className="h-5 w-5" />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-600 px-0.5 text-[10px] font-semibold leading-none text-white"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* aria-live 배지 — 화면에 보이는 dot/숫자와 별개로, 미확인 개수가 바뀔
          때마다(다른 탭에서 읽음 처리되어 refetch로 갱신되는 경우 포함) 스크린
          리더가 한 번 안내받도록 하는 시각적으로 숨겨진 영역(AC-4 연장선). */}
      <span id={liveRegionId} role="status" aria-live="polite" className="sr-only">
        {unreadCount > 0 ? `미확인 알림 ${unreadCount}건` : ''}
      </span>

      {isDesktop ? (
        open && (
          <div
            role="region"
            aria-labelledby={PANEL_TITLE_ID}
            // z-50 (owner feedback #4): WeeklyPage's own sticky day-header row
            // (CalendarGrid.jsx) sits at z-40 and paints AFTER this panel in
            // DOM order (main content vs. the header above it), so equal
            // z-index used to let the grid win and cover the open dropdown.
            // This panel must always sit above ANY in-page sticky/positioned
            // content, so it takes the same top-of-stack level Dialog/
            // BottomSheet's own portal layer uses, without needing to touch
            // WeeklyPage/CalendarGrid at all.
            className="absolute right-0 top-full z-50 mt-2 max-h-[70vh] w-80 overflow-y-auto rounded-card border border-border bg-surface p-2 shadow-popover motion-safe:animate-[banner-slide-down_var(--duration-fast)_var(--ease-standard)]"
          >
            <PanelHeader onOpenSettings={openNotificationSettings} />
            {panelBody}
          </div>
        )
      ) : (
        open && (
          <BottomSheet open={open} onClose={() => setOpen(false)} labelledById={PANEL_TITLE_ID}>
            <div className="flex flex-col gap-3">
              <PanelHeader onOpenSettings={openNotificationSettings} />
              {panelBody}
            </div>
          </BottomSheet>
        )
      )}
    </div>
  )
}

export default NotificationBell
