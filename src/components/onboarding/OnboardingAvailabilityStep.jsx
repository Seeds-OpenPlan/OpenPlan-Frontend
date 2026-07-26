import { useRef, useState } from 'react'
import { Button } from '../common/Button'
import SettingsAvailabilityPage from '../../pages/settings/SettingsAvailabilityPage'
import { AVAILABILITY_SAVE_ERROR } from '../../features/settings/availabilityHelpers'
import { onboardingCopy } from '../../features/onboarding/onboardingCopy'

/*
  ONB-03/04 (안내 + 설정). Embeds the REAL SettingsAvailabilityPage as-is — the
  task's explicit instruction ("②③④는 위 설정 화면 컴포넌트 재사용") is
  satisfied literally, not re-implemented, so this step and FIX-01~03's own
  settings screen can never drift into two different availability UIs.

  오너 결정(2026-07-26) — 초기 설정 단계에 "저장" 버튼 두 개가 따로 있을
  이유가 없다는 판단으로, `embedded` prop을 통해 SettingsAvailabilityPage
  자신의 저장 버튼 둘(가용 시간 카드 안 / 하단) 모두 숨기고, 이 스텝의
  [다음]이 그 저장까지 겸한다. 이전엔 전역 `dirty` 플래그로 [다음]을
  게이트했지만(저장 버튼을 눌러 dirty=false가 되어야 진행) — 그 버튼 자체가
  없어졌으니 이 게이트도 더 이상 맞지 않는다. 대신 [다음] 클릭이 직접
  SettingsAvailabilityPage가 React 19 ref-as-prop(+useImperativeHandle)로
  노출하는 `saveAll()`을 호출해 dirty한 draft만 저장하고, 그 성공 후에만
  onNext()로 다음 단계에 진행한다. `ready`는 그 페이지의 `onReadyChange`
  콜백으로 받는다 — draft가 아직 로딩 중일 땐 [다음] 자체를 비활성해
  saveAll이 "아직 저장할 게 없는" 상태로 불리는 일을 애초에 막는다.

  Thomas 리뷰 MAJOR-1/2 fix (2026-07-26) — saveAll()의 reject를 무조건
  "요일 범위 invalid"로 오귀속하던 이전 버전을 정정: saveAll은 이제 실패
  사유를 태그된 에러(`AVAILABILITY_SAVE_ERROR.*`, availabilityHelpers.js가
  export — 컴포넌트 파일이 아닌 순수 헬퍼 파일에 둔 이유는 그 파일 자신의
  주석 참고)로 구분해서 던진다. 이 catch는 그 태그로만 분기한다 —
  INVALID_RANGE/INVALID_CAPACITY는 각각의 인라인 힌트를 보여주고, 그 밖의
  (태그 없는) reject는 mutateAsync 자신의 네트워크/서버 실패다: 해당
  mutation의 onError가 이미 토스트로 알렸으므로 여기서는 아무 인라인 힌트도
  띄우지 않는다 — 그저 onNext()를 부르지 않고 이 스텝에 머무르는 것으로
  충분하다(잘못된 "시간이 invalid합니다" 메시지를 띄우면 오히려 원인을
  오도한다).
*/
export function OnboardingAvailabilityStep({ onNext, onBack }) {
  const c = onboardingCopy.availability
  const pageRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [hint, setHint] = useState(null) // null | 'range' | 'capacity'

  const handleNext = async () => {
    if (saving || !ready) return
    setSaving(true)
    setHint(null)
    try {
      await pageRef.current?.saveAll()
      onNext()
    } catch (err) {
      if (err?.code === AVAILABILITY_SAVE_ERROR.INVALID_RANGE) setHint('range')
      else if (err?.code === AVAILABILITY_SAVE_ERROR.INVALID_CAPACITY) setHint('capacity')
      // else: an untagged (network/server) rejection — its own mutation onError
      // already toasted, so no inline hint here (see this file's header).
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-title font-semibold text-text">{c.heading}</h2>
        <p className="mt-1 text-label text-text-muted">{c.body}</p>
      </div>

      <SettingsAvailabilityPage embedded ref={pageRef} onReadyChange={setReady} />

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="secondary" size="md" onClick={onBack} disabled={saving}>
          {onboardingCopy.wizard.back}
        </Button>
        <div className="flex flex-col items-end gap-1">
          {hint && (
            <p role="alert" className="text-caption text-danger-700">
              {hint === 'range' ? c.invalidRangeHint : c.invalidCapacityHint}
            </p>
          )}
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={handleNext}
            loading={saving}
            disabled={!ready}
          >
            {onboardingCopy.wizard.next}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default OnboardingAvailabilityStep
