import { NavLink } from 'react-router-dom'
import {
  ClockIcon,
  CalendarIcon,
  SlidersIcon,
  TagIcon,
  UserCircleIcon,
  BellIcon,
  ChatIcon,
  MegaphoneIcon,
  PlayCircleIcon,
  ChevronRightIcon,
} from './settingsIcons'
import { useAvailability } from '../../features/plan/usePlanData'
import { commonPatternLabel } from '../../features/settings/availabilityHelpers'
import { useAllFixedSchedules, useConnections } from '../../features/settings/useSettings'
import { useTaskCategories } from '../../features/project/useProjectData'
import { toast } from '../../hooks/useToasts'
import { Skeleton } from '../common/Skeleton'
import { APP_VERSION_LABEL } from '../../constants/appVersion'

/*
  SCR-SET 허브의 행 목록 (ui-spec §SET, Desktop/Mobile.Settings.png). ONE
  component renders it in BOTH shapes the design shows: full-width at the hub
  itself, narrower as the desktop split-view sidebar (SettingsLayout decides
  the width via its own wrapping className — this component never sizes
  itself).

  Each row's trailing value reads from the SAME query cache the row's own
  detail screen uses (useAvailability/useAllFixedSchedules/useConnections) —
  visiting the hub never fetches a second, possibly-inconsistent copy of that
  data.

  "기본값" (FIX-10~12) is NOT in the reference PNG's row list — flagged
  [가정-보완] in the PR: the AC (§ST-F1-12 AC-3) requires the 4-라디오 screen to
  exist somewhere reachable, and the hub is the only entry point ui-spec
  defines for §SET's sub-screens, so a row was added rather than leaving the
  screen unreachable. "지원"/"공지" ARE in the PNG and, as of ST-F1-15, route
  to real screens (/settings/support, /settings/notices — owner feedback #D
  moved these INTO the settings 2-pane detail instead of the top-level
  /help·/notices this row originally pointed at) instead of the stub toast
  every other row used to fall back to while HELP/OPS didn't exist yet.

  행 순서(오너 리뷰 3차, item 3 — 오너 지정): 기본값 → 가용시간 → 고정일정 →
  계정관리 → 캘린더연동 → 알림. 첫 행(기본값)의 경로는
  settingsNavOrder.SETTINGS_FIRST_DETAIL_PATH와 반드시 같아야 한다(데스크톱
  자동 열림 대상 — SettingsLayout.jsx item 1).

  "연동"(Google/Apple 캘린더): 오너 리뷰 2차로 한 번 "캘린더 연동" 단일 토글로
  합쳐 계정 화면 섹션에 접었다가, 3차에서 독립 행/하위 화면
  (SettingsCalendarPage)으로, 4차에서 그 화면 안의 Google/Apple 자체도 다시
  독립 토글로 되돌렸다 — 이 행의 배지는 "적어도 하나 연결됨"만 요약해서 보여준다
  (어느 쪽인지는 들어가야 안다).
*/

const stubToast = () => toast({ tone: 'info', message: '다음 업데이트에서 제공됩니다' })

function useAvailabilityBadge() {
  const query = useAvailability()
  if (query.isLoading) return { loading: true }
  const label = commonPatternLabel(query.data)
  return { loading: false, label: label ?? '설정 필요' }
}

function useFixedScheduleBadge() {
  const query = useAllFixedSchedules()
  if (query.isLoading) return { loading: true }
  const conflictCount = (query.data ?? []).filter((f) => f.hasConflict).length
  return { loading: false, conflictCount }
}

// W3 신규 행 — 등록된 프리셋 개수만 요약(가용시간/고정일정 행처럼 세부 상태를
// 가르는 값이 아니라 단순 개수라, "충돌 N건" 같은 tone 분기 없이 항상 muted).
function useTaskCategoryBadge() {
  const query = useTaskCategories()
  if (query.isLoading) return { loading: true }
  return { loading: false, count: (query.data ?? []).length }
}

// 허브 행 하나가 Google/Apple 두 독립 연결을 대표해야 하므로, "적어도 하나
// 연결됨"으로 요약한다 — 어느 쪽인지는 화면에 들어가야 안다(개별 배지가
// 아니라 이 화면군 전체의 목록 규약과 같은 "요약 배지").
function useCalendarConnectionBadge() {
  const query = useConnections()
  if (query.isLoading) return { loading: true }
  // W6: 서버는 이미 수립된 연동만 돌려준다(provider당 최대 1행, connectionId
  // 키) — 그중 하나라도 CONNECTED면 "연결됨"이다. 목록에 아예 없는 provider는
  // status 필드 자체가 없으므로 optional chaining으로 미연결 취급한다.
  const connected = (query.data ?? []).some((c) => c.status === 'CONNECTED')
  return { loading: false, connected }
}

function Row({ to, onClick, icon: Icon, title, subtitle, trailing }) {
  const content = (
    <>
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-surface-sunken text-text-muted"
      >
        <Icon size={20} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-label font-medium text-text">{title}</span>
        <span className="truncate text-caption text-text-muted">{subtitle}</span>
      </span>
      {trailing}
      <ChevronRightIcon className="shrink-0 text-text-disabled" />
    </>
  )

  const rowClass =
    'flex min-h-[64px] w-full items-center gap-3 border-b border-border px-4 py-3 text-left ' +
    'hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus-ring'

  if (to) {
    return (
      <NavLink to={to} className={({ isActive }) => `${rowClass} ${isActive ? 'bg-brand-50' : ''}`}>
        {content}
      </NavLink>
    )
  }
  return (
    <button type="button" onClick={onClick} className={rowClass}>
      {content}
    </button>
  )
}

function TrailingText({ tone = 'muted', children }) {
  const toneClass = tone === 'accent' ? 'text-brand-700' : tone === 'warning' ? 'text-warning-700' : 'text-text-muted'
  return <span className={`shrink-0 text-label font-medium ${toneClass}`}>{children}</span>
}

function Section({ title, children }) {
  return (
    <div className="mb-6">
      <h2 className="mb-2 px-1 text-caption font-medium text-text-muted">{title}</h2>
      <div className="overflow-hidden rounded-card border border-border bg-surface">{children}</div>
    </div>
  )
}

export function SettingsNavList({ onTutorialRestart }) {
  const availability = useAvailabilityBadge()
  const fixedBadge = useFixedScheduleBadge()
  const taskCategoryBadge = useTaskCategoryBadge()
  const calendarBadge = useCalendarConnectionBadge()

  return (
    <nav aria-label="설정 메뉴">
      {/* 오너 지정 순서(item 3): 기본값 → 가용시간 → 고정일정. */}
      <Section title="계획 기준">
        <Row
          to="/settings/defaults"
          icon={SlidersIcon}
          title="기본값 설정"
          subtitle="재계획 대안 기본 전략"
        />
        <Row
          to="/settings/availability"
          icon={ClockIcon}
          title="가용시간 설정"
          subtitle="가용 시간 범위·요일별 조정"
          trailing={
            availability.loading ? (
              <Skeleton width="4rem" height="0.875rem" />
            ) : (
              <TrailingText tone="accent">{availability.label}</TrailingText>
            )
          }
        />
        <Row
          to="/settings/fixed-schedules"
          icon={CalendarIcon}
          title="고정일정 관리"
          subtitle="반복 일정·충돌 확인"
          trailing={
            fixedBadge.loading ? (
              <Skeleton width="4rem" height="0.875rem" />
            ) : fixedBadge.conflictCount > 0 ? (
              <TrailingText tone="warning">충돌 {fixedBadge.conflictCount}건</TrailingText>
            ) : (
              <TrailingText>충돌 없음</TrailingText>
            )
          }
        />
        {/* W3 신규 행 — 참조 PNG/오너 지정 6행 순서에는 없던 항목(그 순서
            자체는 재배열하지 않는다). 고정일정 바로 뒤에 덧붙인 이유는 이
            페이지 자신의 헤더 PLACEMENT 주석 참고. */}
        <Row
          to="/settings/task-categories"
          icon={TagIcon}
          title="태스크 카테고리"
          subtitle="태스크 분류 프리셋 관리"
          trailing={
            taskCategoryBadge.loading ? (
              <Skeleton width="3rem" height="0.875rem" />
            ) : (
              <TrailingText>{taskCategoryBadge.count}개</TrailingText>
            )
          }
        />
      </Section>

      {/* 오너 지정 순서(item 3/4): 계정관리 → 캘린더연동 → 알림. */}
      <Section title="계정">
        <Row to="/settings/account" icon={UserCircleIcon} title="계정 관리" subtitle="프로필·로그아웃·계정 상태" />
        <Row
          to="/settings/calendar"
          icon={CalendarIcon}
          title="캘린더 연동"
          subtitle="Google·Apple 캘린더 가져오기"
          trailing={
            calendarBadge.loading ? (
              <Skeleton width="3rem" height="0.875rem" />
            ) : (
              <TrailingText tone={calendarBadge.connected ? 'accent' : 'muted'}>
                {calendarBadge.connected ? '연결됨' : '미연결'}
              </TrailingText>
            )
          }
        />
        <Row to="/settings/notifications" icon={BellIcon} title="알림" subtitle="푸시 알림·리마인더" />
      </Section>

      <Section title="지원 및 정보">
        <Row
          icon={PlayCircleIcon}
          title="튜토리얼 다시 실행"
          subtitle="처음부터 다시 안내받기"
          onClick={onTutorialRestart ?? stubToast}
        />
        {/* ST-F1-15 — 더 이상 스텁이 아니다. owner feedback #D: 다른 설정
            항목처럼 설정 안에 머물며 우측 디테일 pane에 뜬다(예전엔 최상위
            /faq·/notices로 튕겨 나갔음 — 그 경로들은 이제 여기로 redirect만
            한다, router.js 참고). "지원"은 그 안에서도 FAQ 탭이 기본(오너
            피드백 #7 — "궁금한 걸 먼저 찾아보고, 없으면 문의"). */}
        <Row to="/settings/support" icon={ChatIcon} title="지원" subtitle="문의·피드백 보내기" />
        <Row to="/settings/notices" icon={MegaphoneIcon} title="공지" subtitle="업데이트·공지사항" />
      </Section>

      {/* 오너 리뷰 2차 (E) — 참조 PNG 하단의 "OpenPlan v1.0.0" 푸터. 실제
          package.json version을 읽는다(appVersion.js 헤더에 0.0.0 특수 처리 이유). */}
      <p className="mt-2 text-center text-caption text-text-disabled">OpenPlan {APP_VERSION_LABEL}</p>
    </nav>
  )
}

export default SettingsNavList
