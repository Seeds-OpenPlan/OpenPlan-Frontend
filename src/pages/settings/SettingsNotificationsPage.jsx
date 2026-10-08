import { useRef } from 'react'
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

  확정 계약(NOTI-01, openapi.yaml:876/2614) — 더 이상 가정-확장 아님. GET이
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
    "게이트"가 아니라 "일괄 적용"이다. 그래서 개별 행을 "마스터가 꺼졌으니
    잠근다"는 이유로는 더 이상 `disabled` 처리하지 않는다: 다섯 값 전부가
    실제로 바뀌므로 잠글 "숨은 저장값"이 남지 않는다.
  - 부작용: 마스터를 OFF→ON으로 되돌리면 꺼두었던 개별 항목도 함께
    켜진다(이전의 "개별값 보존" 특성은 사라짐) — 서버에 없는 필드로
    개별값을 따로 기억해 둘 수 없다는 계약상 제약의 직접적 결과라
    §SET.6에도, 백엔드 계약에도 이 손실을 피할 다른 방법이 없다.

  PENDING 중 전체 잠금 (Thomas PR 리뷰 SHOULD-FIX #2). 마스터 일괄 PUT(5종)과
  개별 PUT(1종)은 같은 유형 키를 공유할 수 있다 — 저장이 진행 중인 동안 다른
  토글을 또 누르면 두 요청이 겹쳐 날아가고, 응답이 보낸 순서와 다르게
  도착하면(useSettings.js의 requestId 가드가 캐시 쪽은 막아 주지만) 화면과
  서버 실제 값이 어긋나는 순간이 생길 수 있다. 가장 단순하고 확실한 차단은
  "저장 중엔 아무 토글도 새로 못 누르게" 직렬화하는 것이다 — `save.isPending`
  동안 6개 토글(마스터 포함) 전부를 `disabled`로 막는다. 응답이 보통
  수십~수백ms 안에 오므로(mock 70ms, 실서버도 단순 upsert) 깜빡임이 거슬릴
  정도로 길게 잠기지는 않는다 — 다른 설정 화면들(SettingsDefaultsPage 등)도
  이미 `mutation.isPending` 동안 저장 버튼을 잠그는 같은 관례를 쓴다.

  동기 ref 가드 (PR #69 AI 재리뷰 Should-fix ③). 위 `disabled={save.isPending}`
  는 React 상태라 "클릭 → 그 상태가 리렌더로 DOM에 반영"되기까지 한 틱의
  틈이 있다 — 그 틈 안에서 두 번째 클릭(예: 개별 토글 직후 곧바로 마스터
  토글)이 들어오면 여전히 두 PUT이 겹쳐 날아갈 수 있다(useSettings.js의
  requestId/pendingCount 가드가 그 결과를 안전하게 수습하긴 하지만, 애초에
  겹치지 않는 편이 낫다). `isSavingRef`는 React 상태가 아니라 일반 변수라
  리렌더를 기다리지 않고 그 자리에서 즉시 참/거짓이 바뀐다 — `guardedSave`가
  이 ref를 "클릭 즉시" 확인해 이미 하나가 나가 있으면 새 호출 자체를 아예
  만들지 않는다(mutate를 호출하지 않음 — 네트워크에 두 번째 요청이 생성되지
  않는다). `mutate()`의 두 번째 인자(call-level 콜백)로 ref를 되돌리는 이유는
  훅 레벨 onSettled(useSettings.js)와는 독립적으로, "이 호출 하나"가
  끝나는 시점만 보면 되기 때문이다.
*/
function SettingsNotificationsPage() {
  const query = useNotificationSettings()
  const save = useSaveNotificationSettings()
  const isSavingRef = useRef(false)

  const guardedSave = (changes) => {
    if (isSavingRef.current) return
    isSavingRef.current = true
    save.mutate(changes, {
      onSettled: () => {
        isSavingRef.current = false
      },
    })
  }

  if (query.isLoading) return <LoadingSkeleton preset="listRow" count={6} />
  if (query.isError) return <ErrorState variant="section" onAction={() => query.refetch()} />

  const settings = query.data ?? {}
  // allOn과 개별 행이 같은 "값이 없을 때 뭘로 읽을지" 규칙을 쓰도록 한 헬퍼로
  // 묶는다(Thomas PR 리뷰 NIT #3 — 전엔 allOn은 `!== false`, 개별 행은
  // `Boolean(...)`로 서로 다르게 처리해 `undefined`가 섞이면 두 표시가
  // 어긋날 수 있었다). 기본을 "켜짐"으로 두는 이유는 서버의 시드 기본값
  // (최초 조회 시 기본 켜짐)과 같은 방향이라서다.
  const isOn = (type) => settings[type] !== false

  // 서버 필드가 아니라 화면 파생값 — 5종이 전부 true일 때만 "전체 켜짐"으로
  // 보인다. 하나라도 꺼져 있으면 마스터도 꺼짐으로 보여, 사용자가 "전체
  // 알림이 켜져 있다"는 문구를 보고도 실제로는 일부가 꺼져 있는 불일치를
  // 피한다.
  const allOn = NOTIFICATION_TYPES.every(isOn)

  const handleMasterToggle = (next) => {
    guardedSave(NOTIFICATION_TYPES.map((type) => ({ type, enabled: next })))
  }

  // 저장 중엔 전체(마스터 포함) 잠금 — 위 파일 헤더 "PENDING 중 전체 잠금"
  // 참고. sr-only 문구(Toggle.jsx가 disabledReason을 시각적으로는 숨기고
  // 스크린리더에만 읽어준다)라 평상시엔 화면에 아무 것도 추가되지 않는다.
  const savingReason = save.isPending ? '저장 중입니다' : undefined

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
            disabled={save.isPending}
            disabledReason={savingReason}
          />
        </li>
        {NOTIFICATION_ITEMS.map((item) => (
          <li key={item.type} className="border-b border-border px-4 py-3 last:border-b-0">
            <Toggle
              checked={isOn(item.type)}
              onChange={(next) => guardedSave([{ type: item.type, enabled: next }])}
              label={item.label}
              description={item.description}
              showStateText
              disabled={save.isPending}
              disabledReason={savingReason}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

export default SettingsNotificationsPage
