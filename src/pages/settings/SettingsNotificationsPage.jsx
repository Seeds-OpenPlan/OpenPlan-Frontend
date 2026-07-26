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

  MASTER TOGGLE (ST-F1-15 오너 피드백 #5, 2차 수정 #A — "순수 게이트"). 처음
  구현은 마스터를 켜고 끌 때 개별 5종 저장값까지 함께 일괄 mutate했는데,
  오너 피드백으로 그 부분을 제거했다: `masterEnabled`는 개별 5종의 저장값을
  전혀 건드리지 않는 화면 전용 게이트일 뿐이다.
  - 마스터 OFF → 개별 5종은 저장값 그대로 두고 화면에서만 `disabled`(회색
    처리 + Toggle의 `disabledReason`으로 사유 텍스트 병기). "실제 발송 여부는
    master && individual" 개념은 유지되지만, 그 AND의 개별 쪽 입력값 자체는
    이 화면이 절대 다시 쓰지 않는다.
  - 마스터를 다시 ON → 개별 저장값을 손댄 적이 없으므로 이전 설정이 그대로
    "복원"된 것처럼 보인다(사실은 애초에 안 바뀌었을 뿐).
  이 필드는 "모든 5종이 켜져 있는가"에서 DERIVE하지 않고 여전히 독립 필드로
  저장한다(settingsFixtures.js) — 계산값으로 두면 개별 토글 하나만 꺼도
  마스터가 즉시 꺼짐으로 튀는 문제는 여전히 유효한 이유라 그대로 둔다.
*/
function SettingsNotificationsPage() {
  const query = useNotificationSettings()
  const patch = usePatchNotificationSetting()

  if (query.isLoading) return <LoadingSkeleton preset="listRow" count={6} />
  if (query.isError) return <ErrorState variant="section" onAction={() => query.refetch()} />

  const settings = query.data ?? {}
  // 과거(마이그레이션 이전) 캐시/mock 데이터에는 이 필드가 없을 수 있어 기본
  // true — "처음 보는 사용자는 전체 켜짐"이 다른 4종 알림 기본값과도 맞다.
  const masterEnabled = settings.masterEnabled ?? true

  return (
    <div className="flex flex-col gap-4">
      <h2 id="settings-detail-title" className="text-title font-semibold text-text">
        알림
      </h2>
      <ul className="overflow-hidden rounded-card border border-border">
        <li className="border-b border-border bg-surface-sunken px-4 py-3">
          <Toggle
            checked={masterEnabled}
            onChange={(next) => patch.mutate({ key: 'masterEnabled', enabled: next })}
            label="전체 알림"
            description="끄면 아래 5종 알림이 모두 꺼집니다"
            showStateText
          />
        </li>
        {NOTIFICATION_ITEMS.map((item) => (
          <li key={item.key} className="border-b border-border px-4 py-3 last:border-b-0">
            <Toggle
              checked={Boolean(settings[item.key])}
              onChange={(next) => patch.mutate({ key: item.key, enabled: next })}
              label={item.label}
              description={item.description}
              showStateText
              disabled={!masterEnabled}
              disabledReason={!masterEnabled ? '전체 알림이 꺼져 있습니다' : undefined}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

export default SettingsNotificationsPage
