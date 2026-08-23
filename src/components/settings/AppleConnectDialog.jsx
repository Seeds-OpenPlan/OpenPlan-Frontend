import { useId, useRef, useState } from 'react'
import { Dialog } from '../common/Dialog'
import { BottomSheet } from '../common/BottomSheet'
import { Button } from '../common/Button'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import { useCreateAppleConnection } from '../../features/settings/useSettings'

const FIELD =
  'w-full rounded-control border border-border bg-surface px-3 py-2 text-label text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring'

/*
  AppleConnectDialog — FIX-14의 애플 경로 (신규 연동 생성). Google과 달리
  외부 페이지로 넘어가지 않는다: CalDAV라 Apple ID(전체 이메일)와 앱 암호를
  이 폼이 직접 받아 POST /external-calendar-connections로 보낸다(6주차 문서
  근거 — 로컬 openapi.yaml은 아직 이 필드를 모른다, settingsApi.js 헤더 참조).
  일반 로그인 비밀번호로는 서버가 무조건 거부하므로, 앱 암호 발급 경로 안내를
  폼 안에 항상 노출해 둔다.

  에러 3분기 (팀장 지시 — 임의 해석 금지):
    422 → 입력값 자체가 잘못됨. 폼을 그대로 다시 보여주고(아래에서 이미 그
          상태) 사용자가 고쳐 다시 제출하게 한다. "재시도" 버튼을 주지
          않는다 — 오타를 그대로 다시 보내는 건 의미가 없다.
    502 → 일시적 게이트웨이 장애. 입력은 이미 유효했으므로 제출 버튼 자리를
          "다시 시도" 버튼으로 바꿔, 같은 값으로 한 번 더 보낼 수 있게 한다.
    409 → 이미 연결된 계정(E-EXT-004). 재시도해도 결과가 바뀌지 않으므로
          안내만 하고, 사용자가 다른 계정으로 다시 채워 넣게 한다.

  앱 암호는 제출 즉시 화면 상태(appPassword)에서 지운다 — 성공/실패와 무관하게
  마스킹 입력이 값을 계속 들고 있을 이유가 없다(보안 요구사항). 그런데도
  "다시 시도" 버튼은 그 뒤에도 정확히 같은 요청을 다시 보낼 수 있어야 한다 —
  TanStack Query의 useMutation은 마지막으로 mutate()에 넘긴 인자를
  `mutation.variables`로 계속 들고 있으므로, 그 사본을 재사용하면 화면
  어디에도 값을 다시 렌더링하지 않고도 재요청이 가능하다(별도 ref로 중복
  보관하지 않는 이유). 사용자가 필드를 다시 건드리면 `reset()`으로 그
  재시도 상태 자체를 버리고 통상적인(편집 가능한) 제출 흐름으로 되돌아간다 —
  바뀐 입력값을 "다시 시도"가 조용히 무시한 채 옛 값을 또 보내는 상황을
  막기 위함이다.
*/
export function AppleConnectDialog({ onClose }) {
  const isDesktop = useIsDesktop()
  const titleId = useId()
  const errorId = useId()
  const firstFieldRef = useRef(null)
  const [appleId, setAppleId] = useState('')
  const [appPassword, setAppPassword] = useState('')

  const createConnection = useCreateAppleConnection()

  const errorStatus = createConnection.error?.status
  const isDuplicate = errorStatus === 409
  const isRetryable = errorStatus === 502
  const isValidationError = errorStatus === 422

  const errorCopy = isDuplicate
    ? '이미 연결된 Apple 계정입니다. 다른 계정으로 다시 시도해 주세요.'
    : isRetryable
      ? '일시적인 오류로 연동하지 못했습니다. 같은 정보로 다시 시도해 주세요.'
      : isValidationError
        ? 'Apple ID 또는 앱 암호를 확인해 주세요. 일반 로그인 비밀번호는 사용할 수 없습니다.'
        : createConnection.isError
          ? '연동하지 못했습니다. 잠시 후 다시 시도해 주세요.'
          : null

  // 오류가 떠 있는 상태에서 사용자가 다시 타이핑하면 그 오류(와 "다시 시도"가
  // 기대는 옛 variables)를 버린다 — 위 헤더의 마지막 문단 참조.
  const editField = (setter) => (value) => {
    if (createConnection.isError) createConnection.reset()
    setter(value)
  }

  const submit = (e) => {
    e.preventDefault()
    const body = { appleId, appPassword }
    setAppPassword('') // 제출 즉시 비움 — 헤더 코멘트 참조
    createConnection.mutate(body, { onSuccess: () => onClose() })
  }

  const retry = () => {
    if (!createConnection.variables) return
    createConnection.mutate(createConnection.variables, { onSuccess: () => onClose() })
  }

  const body = (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h2 id={titleId} className="text-title font-semibold text-text">
        Apple 캘린더 연동
      </h2>

      <div className="rounded-control bg-surface-sunken p-3 text-caption text-text-muted">
        일반 로그인 비밀번호로는 연동할 수 없습니다. appleid.apple.com → 로그인
        및 보안 → 앱 암호 → 새로 만들기에서 발급한 앱 전용 암호를 입력해
        주세요. (2단계 인증이 켜진 계정에만 이 메뉴가 보입니다.)
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">Apple ID</span>
        <input
          ref={firstFieldRef}
          type="email"
          autoComplete="username"
          placeholder="someone@icloud.com"
          value={appleId}
          onChange={(e) => editField(setAppleId)(e.target.value)}
          aria-describedby={errorCopy ? errorId : undefined}
          aria-invalid={errorCopy ? true : undefined}
          required
          className={FIELD}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">앱 암호</span>
        <input
          type="password"
          autoComplete="off"
          placeholder="xxxx-xxxx-xxxx-xxxx"
          value={appPassword}
          onChange={(e) => editField(setAppPassword)(e.target.value)}
          aria-describedby={errorCopy ? errorId : undefined}
          aria-invalid={errorCopy ? true : undefined}
          required
          className={FIELD}
        />
      </label>

      {errorCopy && (
        <span id={errorId} role="alert" className="text-caption text-danger-700">
          {errorCopy}
        </span>
      )}

      <div className="mt-1 flex justify-end gap-2">
        <Button type="button" variant="secondary" size="md" onClick={onClose}>
          취소
        </Button>
        {isRetryable ? (
          <Button type="button" variant="primary" size="md" loading={createConnection.isPending} onClick={retry}>
            다시 시도
          </Button>
        ) : (
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={createConnection.isPending}
            disabled={!appleId || !appPassword}
          >
            연동하기
          </Button>
        )}
      </div>
    </form>
  )

  if (isDesktop) {
    return (
      <Dialog open onClose={onClose} labelledById={titleId} initialFocusRef={firstFieldRef}>
        {body}
      </Dialog>
    )
  }
  return (
    <BottomSheet open onClose={onClose} labelledById={titleId} initialFocusRef={firstFieldRef}>
      {body}
    </BottomSheet>
  )
}

export default AppleConnectDialog
