import { Toggle } from '../../components/common/Toggle'
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton'
import { ErrorState } from '../../components/common/ErrorState'
import { useNotificationSettings, usePatchNotificationSetting } from '../../features/settings/useSettings'

// 5종 — key(서버 필드명) · label · description. 순서가 화면에 그대로 나온다.
const NOTIFICATION_ITEMS = [
  { key: 'dueSoonTasks', label: '마감 임박 태스크', description: '마감이 가까운 태스크를 미리 알려줍니다' },
  { key: 'planRisk', label: '계획 위험 경고', description: '이번 주 일정이 과부하일 때 알려줍니다' },
  { key: 'inquiryReply', label: '문의 답변', description: '보낸 문의에 답변이 등록되면 알려줍니다' },
  { key: 'announcement', label: '공지사항', description: '새 공지가 등록되면 알려줍니다' },
  { key: 'weeklyReminder', label: '주간 계획 작성 리마인더', description: '아직 계획을 세우지 않은 주를 알려줍니다' },
]

/*
  SettingsNotificationsPage — 알림 (NOTI-01, §ST-F1-12 AC-5 "5종 토글 즉시 저장 +
  켜짐/꺼짐 텍스트"). Each Toggle saves ITSELF the moment it flips — there is no
  page-level save button here, unlike every other 설정 screen in this story —
  matching the AC's own "즉시 저장" wording. `showStateText` is on for every
  row (the one screen in this codebase that turns it on — see Toggle.jsx's
  own header for why it defaults off everywhere else).

  [가정-확장] notification-settings 리소스 자체 (settingsApi.js 헤더) — the 5 KEYS
  above are this PR's own guess at "5종" (nothing in the spec names them); a
  real Swagger contract may rename/reorder them, which only this array and
  settingsFixtures.js's seed need to change to absorb.
*/
function SettingsNotificationsPage() {
  const query = useNotificationSettings()
  const patch = usePatchNotificationSetting()

  if (query.isLoading) return <LoadingSkeleton preset="listRow" count={5} />
  if (query.isError) return <ErrorState variant="section" onAction={() => query.refetch()} />

  const settings = query.data ?? {}

  return (
    <div className="flex flex-col gap-4">
      <h2 id="settings-detail-title" className="text-title font-semibold text-text">
        알림
      </h2>
      <ul className="overflow-hidden rounded-card border border-border">
        {NOTIFICATION_ITEMS.map((item) => (
          <li key={item.key} className="border-b border-border px-4 py-3 last:border-b-0">
            <Toggle
              checked={Boolean(settings[item.key])}
              onChange={(next) => patch.mutate({ key: item.key, enabled: next })}
              label={item.label}
              description={item.description}
              showStateText
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

export default SettingsNotificationsPage
