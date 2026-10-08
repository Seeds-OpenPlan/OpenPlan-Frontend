import { Toggle } from '../../components/common/Toggle'
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton'
import { ErrorState } from '../../components/common/ErrorState'
import { useNotificationSettings, useSaveNotificationSettings } from '../../features/settings/useSettings'
import { NOTIFICATION_TYPES } from '../../features/settings/settingsApi'

/*
  5종 — notificationType(계약 enum) · label · description. 순서가 화면에 그대로
  나온다 — 서버가 항상 이 enum 선언 순으로 5건을 반환한다
  (NotificationSettingService.getSettings 주석 "선언 순서로 5건 고정 반환").

  라벨·캡션은 추측이 아니라 두 1차 출처를 그대로 옮긴다:
  - ui-spec-set.md §SET.6 (Jonnathan 확정) — 행 라벨·캡션 문구 그대로.
  - NotificationGenerator.java 각 알림의 발송 조건 — 캡션이 그 조건과 실제로
    맞는지 대조(예: PLAN_UNSAVED는 "변경이 있으면"이 아니라 "그 주 계획이
    아직 DRAFT로 남아 있으면" 발송이지만, ui-spec 캡션이 사용자에게 보여줄
    수준의 요약이라 그대로 채택— 계약의 발송 "조건"과 화면의 "안내 문구"는
    같은 정밀도일 필요가 없다).
*/
const NOTIFICATION_ITEMS = [
  { type: 'DEADLINE_SOON', label: '마감 임박', description: '마감이 가까운 태스크를 미리 알립니다' },
  { type: 'TODAY_TASKS', label: '오늘 할 일', description: '오늘 예정된 계획을 아침에 알립니다' },
  { type: 'PLAN_UNSAVED', label: '계획 미저장', description: '저장하지 않은 변경이 있으면 알립니다' },
  { type: 'RETROSPECT', label: '회고 알림', description: '주간 회고 시점을 알립니다' },
  { type: 'SUPPORT_ANSWERED', label: '문의 답변 등록', description: '문의에 답변이 달리면 알립니다' },
]

/*
  SettingsNotificationsPage — 알림 (NOTI-01, §ST-F1-12 AC-5 "5종 토글 즉시 저장 +
  켜짐/꺼짐 텍스트"). Each Toggle saves ITSELF the moment it flips — there is no
  page-level save button here, unlike every other 설정 screen in this story —
  matching the AC's own "즉시 저장" wording. `showStateText` is on for every
  row (the one screen in this codebase that turns it on — see Toggle.jsx's
  own header for why it defaults off everywhere else).

  확정 계약(NOTI-01, openapi.yaml:876/2614) — more 가정-확장 아님. GET이
  5종 배열을 돌려주고 PUT이 부분 저장을 받는다(settingsApi.js 헤더 참고).
  「공지사항」 토글은 계약에 대응하는 유형이 없어 제거했다 — 서버가 모르는
  유형을 PUT에 실으면 422 E-COM-009로 거절된다(NotificationSettingService.
  parseType).

  MASTER TOGGLE — 설계 변경(2026-10-08, 계약 대조 오너 승인). 과거(ST-F1-15
  오너 피드백 #5)엔 masterEnabled를 서버의 독립 필드로 저장하는 "순수 게이트"
  였다 — 꺼도 개별 5종 저장값은 건드리지 않고 화면에서만 disabled 처리했다.
  그런데 실제 계약(NotificationSetting 스키마)엔 그런 필드가 없다. 서버가
  모르는 값을 저장할 수는 없으므로, 이 토글은 이제 순수 화면 전용 편의
  기능이다:
  - 체크 상태는 저장값이 아니라 "5종이 모두 켜져 있는가"에서 DERIVE한다
    (별도 필드 없음 — 서버에 없는 값을 보내지 않기 위한 필연적 선택).
  - 켜기/끄기 시 5종 전부를 한 번의 PUT(`useSaveNotificationSettings`가
    받는 `changes` 배열에 5개를 담아 호출)으로 실제로 켜거나 끈다 — 더 이상
    "게이트"가 아니라 "일괄 적용"이다. 그래서 개별 행도 더는 `disabled`로
    잠그지 않는다: 다섯 값 전부가 실제로 바뀌므로 잠글 "숨은 저장값"이
    남지 않는다.
  - 부작용: 마스터를 OFF→ON으로 되돌리면 꺼두었던 개별 항목도 함께
    켜진다(이전의 "개별값 보존" 특성은 사라짐) — 서버에 없는 필드로
    개별값을 따로 기억해 둘 수 없다는 계약상 제약의 직접적 결과라
    §SET.6에도, 백엔드 계약에도 이 손실을 피할 다른 방법이 없다.
*/
function SettingsNotificationsPage() {
  const query = useNotificationSettings()
  const save = useSaveNotificationSettings()

  if (query.isLoading) return <LoadingSkeleton preset="listRow" count={6} />
  if (query.isError) return <ErrorState variant="section" onAction={() => query.refetch()} />

  const settings = query.data ?? {}
  // 서버 필드가 아니라 화면 파생값 — 5종이 전부 true일 때만 "전체 켜짐"으로
  // 보인다. 하나라도 꺼져 있으면 마스터도 꺼짐으로 보여, 사용자가 "전체
  // 알림이 켜져 있다"는 문구를 보고도 실제로는 일부가 꺼져 있는 불일치를
  // 피한다.
  const allOn = NOTIFICATION_TYPES.every((type) => settings[type] !== false)

  const handleMasterToggle = (next) => {
    save.mutate(NOTIFICATION_TYPES.map((type) => ({ type, enabled: next })))
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 id="settings-detail-title" className="text-title font-semibold text-text">
        알림
      </h2>
      <ul className="overflow-hidden rounded-card border border-border">
        <li className="border-b border-border bg-surface-sunken px-4 py-3">
          <Toggle
            checked={allOn}
            onChange={handleMasterToggle}
            label="전체 알림"
            description="끄면 아래 5종 알림이 모두 꺼집니다"
            showStateText
          />
        </li>
        {NOTIFICATION_ITEMS.map((item) => (
          <li key={item.type} className="border-b border-border px-4 py-3 last:border-b-0">
            <Toggle
              checked={Boolean(settings[item.type])}
              onChange={(next) => save.mutate([{ type: item.type, enabled: next }])}
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
