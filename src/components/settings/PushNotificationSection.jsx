import { useEffect, useState } from 'react'
import { Toggle } from '../common/Toggle'
import { LoadingSkeleton } from '../common/LoadingSkeleton'
import { ErrorState } from '../common/ErrorState'
import { isAndroidAppShell } from '../../utils/appShell'
import { getExistingPushSubscription, subscribeToPush, subscriptionToPayload } from '../../utils/pushSubscription'
import { createPushSubscription } from '../../features/settings/settingsApi'
import { usePushSettings, useUpdatePushSettings, useVapidPublicKey } from '../../features/settings/useSettings'

// 용어집 그대로 — 태스크 / 고정 일정 / 일정(ADR-0015 사용자 결정 "대상 3가지").
// `description`은 10분이라는 숫자를 반복하지 않는다 — 그 설명은 섹션 상단
// 안내문 한 곳에만 두고, 여기서는 "무엇을" 보낼지만 말한다(ADR 결정 ② 대상
// 조건의 사용자용 요약).
const PUSH_ITEMS = [
  { key: 'taskEnabled', label: '태스크', description: '저장(확정)한 주간 계획의 태스크' },
  { key: 'fixedScheduleEnabled', label: '고정 일정', description: '반복 설정한 고정 일정' },
  { key: 'scheduleEnabled', label: '일정', description: '주간 계획에 배치된 일정' },
]

/*
  PushNotificationSection — ADR-0015 FE. 실제 구현은 PushNotificationSectionApp
  (아래)에 있고, 이 바깥 함수는 안드로이드 앱 판별 하나만 한다 — Hook 규칙상
  "조건에 따라 Hook 자체를 건너뛰는" 모양을 만들면 안 되므로(React 쪽 return
  앞에 Hook이 없어야 한다), 쿼리/상태를 쓰는 본체를 별도 컴포넌트로 떼어
  isAndroidAppShell()이 거짓일 때는 그 컴포넌트를 마운트조차 하지 않는다.

  사용자 결정(ADR 결정 표 1행) — 웹에서는 이 섹션이 "아무것도" 그리지 않는다.
  섹션·권한 요청·구독 생성 전부 없음. isAndroidAppShell()이 이미 쓰이는 다른
  화면(CalendarConnectionSection·SettingsNavList)과 같은 판별을 그대로
  재사용한다 — 새 판별기를 만들지 않는다.
*/
export function PushNotificationSection() {
  if (!isAndroidAppShell()) return null
  return <PushNotificationSectionApp />
}

function PushNotificationSectionApp() {
  const vapidQuery = useVapidPublicKey()
  const settingsQuery = usePushSettings()
  const updateSettings = useUpdatePushSettings()

  // 바로 앞 토글 클릭에서 권한을 거부당했는지 — Notification.permission을 매
  // 렌더마다 직접 읽지 않고 상태로 들고 있는 이유는, "지금 막 거부한" 경우에만
  // 안내를 보여주고 싶어서다(이미 예전에 거부해 둔 사용자에게 화면을 열 때마다
  // 조건 없이 안내를 띄우면 그 자체가 소음이다 — 토글이 꺼진 채 있는 것만으로
  // 충분한 신호다).
  const [permissionBlocked, setPermissionBlocked] = useState(false)
  // 구독 생성(권한 요청 ~ POST)이 진행 중인가. updateSettings.isPending과
  // 별도로 두는 이유: 구독 생성은 PUT 호출보다 앞선 선행 단계라, 그 구간에도
  // 세 토글을 똑같이 잠가야 한다(아래 disableAll이 둘을 OR로 합친다).
  const [subscribing, setSubscribing] = useState(false)
  const [subscribeError, setSubscribeError] = useState(false)

  const publicKey = vapidQuery.data?.publicKey ?? null
  // 조회 실패(vapidQuery.isError)와 "서버가 아직 키를 안 올렸다"(publicKey:
  // null, ADR 결정 ⑤) 둘 다 "지금은 못 쓴다"로 같이 묶는다 — 구독을 만들 키가
  // 없으면 토글을 켜 봐야 실패할 동작이므로, 처음부터 비활성 안내로 바꿔 보여
  // 주는 것이 "눌렀는데 조용히 실패"보다 낫다.
  const pushReady = !vapidQuery.isLoading && publicKey != null

  // 페이지를 열 때 권한이 이미 허용돼 있고 기기에 구독이 남아 있으면 서버에
  // 다시 올려 둔다(ADR 결정 ④ — 재설치·브라우저 키 회전으로 서버가 들고 있는
  // endpoint가 끊겼을 수 있다). endpoint가 UNIQUE라 서버는 이것을 upsert로
  // 받으므로(settingsApi.createPushSubscription 헤더 참조), "이미 등록돼
  // 있나"를 먼저 묻지 않고 매번 다시 POST해도 안전하다. 실패하면 조용히
  // 넘어간다 — 사용자가 토글을 다시 누르면 handleToggle이 같은 경로를 밟는다.
  useEffect(() => {
    if (!pushReady) return
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    let cancelled = false
    getExistingPushSubscription()
      .then((sub) => {
        if (!sub || cancelled) return null
        return createPushSubscription(subscriptionToPayload(sub))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [pushReady])

  if (settingsQuery.isLoading || vapidQuery.isLoading) return <LoadingSkeleton preset="listRow" count={3} />
  if (settingsQuery.isError) return <ErrorState variant="section" onAction={() => settingsQuery.refetch()} />

  if (!pushReady) {
    return (
      <div className="rounded-control bg-surface-sunken p-3 text-caption text-text-muted">
        푸시 알림을 준비 중입니다. 잠시 후 다시 확인해 주세요.
      </div>
    )
  }

  const settings = settingsQuery.data ?? {
    taskEnabled: false,
    fixedScheduleEnabled: false,
    scheduleEnabled: false,
  }

  /*
    토글 하나의 "켜기"는 기기에 구독이 없을 때만 선행 단계(권한 요청 →
    PushManager.subscribe → POST)를 밟는다 — 있으면 곧바로 PUT만 보낸다.
    `Notification.requestPermission()`은 반드시 **이 클릭 핸들러 안에서**
    불러야 한다(사용자 제스처 요구사항, ADR 작업 지시서 명시) — await를
    먼저 거친 뒤 호출해도 같은 동기 호출 체인(마이크로태스크) 안이라 크롬
    기준 유효하지만, 타이머·네트워크 왕복처럼 매크로태스크를 먼저 거치면
    제스처가 끊겨 브라우저가 프롬프트를 띄우지 않고 조용히 거부로 처리한다
    — 그래서 이 함수 전체가 짧은 프라미스 체인(serviceWorker.ready 등) 하나로
    끝나도록 유지한다.

    "끄기"(next === false)는 구독을 전혀 건드리지 않는다 — 컴포넌트 헤더의
    "완전한 구독 해제" 설명 참조.
  */
  async function handleToggle(key, next) {
    setSubscribeError(false)
    if (next) {
      const existing = await getExistingPushSubscription().catch(() => null)
      if (!existing) {
        if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
          setPermissionBlocked(true)
          return
        }
        setSubscribing(true)
        try {
          const permission = await Notification.requestPermission()
          if (permission !== 'granted') {
            setPermissionBlocked(true)
            return
          }
          setPermissionBlocked(false)
          const subscription = await subscribeToPush(publicKey)
          await createPushSubscription(subscriptionToPayload(subscription))
        } catch {
          setSubscribeError(true)
          return
        } finally {
          setSubscribing(false)
        }
      }
    }
    updateSettings.mutate({ ...settings, [key]: next })
  }

  const disableAll = subscribing || updateSettings.isPending

  // 저장 중·오류 안내를 한 자리에 고정한다(항상 렌더링하고 텍스트만 바꿔치기) —
  // 조건부로 블록 자체를 넣고 빼면 그 높이만큼 아래 내용이 밀렸다가 복귀하는
  // 레이아웃 흔들림(CLS)이 생긴다. role을 오류일 때만 "alert"로 바꿔 스크린
  // 리더가 오류는 즉시, 저장 중 같은 일반 상태는 "polite"로 느슨하게 읽게
  // 한다.
  const status = disableAll
    ? { tone: 'muted', text: '저장 중입니다' }
    : permissionBlocked
      ? { tone: 'danger', text: '알림이 차단되어 있습니다. 안드로이드 설정 › 앱 › OpenPlan › 알림에서 허용해 주세요.' }
      : subscribeError
        ? { tone: 'danger', text: '알림을 켜지 못했습니다. 잠시 후 다시 시도해 주세요.' }
        : null

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-label font-semibold text-text">푸시 알림</h3>
        <p className="text-caption text-text-muted">시작 10분 전에 기기로 알려드립니다. 시각은 고정이며 고를 수 없습니다.</p>
      </div>
      <ul className="overflow-hidden rounded-card border border-border">
        {PUSH_ITEMS.map((item) => (
          <li key={item.key} className="border-b border-border px-4 py-3 last:border-b-0">
            <Toggle
              checked={Boolean(settings[item.key])}
              onChange={(next) => handleToggle(item.key, next)}
              label={item.label}
              description={item.description}
              showStateText
              disabled={disableAll}
            />
          </li>
        ))}
      </ul>
      <p
        role={status?.tone === 'danger' ? 'alert' : 'status'}
        aria-live="polite"
        className={`text-caption ${status?.tone === 'danger' ? 'text-danger-700' : 'text-text-muted'}`}
      >
        {status?.text ?? ' '}
      </p>
    </div>
  )
}

export default PushNotificationSection
