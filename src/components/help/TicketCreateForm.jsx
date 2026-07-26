import { useRef, useState } from 'react'
import { Dialog } from '../common/Dialog'
import { BottomSheet } from '../common/BottomSheet'
import { Button } from '../common/Button'
import { ErrorState } from '../common/ErrorState'
import { useCreateTicket } from '../../features/help/useHelp'
import { TICKET_CATEGORIES } from '../../features/help/ticketCategories'
import { useAccount } from '../../features/settings/useSettings'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import { toast } from '../../hooks/useToasts'

const FIELD =
  'w-full rounded-control border border-border bg-surface px-3 py-2 text-label text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring'
const TITLE_ID = 'ticket-create-title'

// owner feedback #C — 첨부파일 개수 제한. mock이라 실제 업로드/용량 검증은
// 없고(서버 계약 미확정) 파일 이름만 들고 다니지만, 개수 상한만은 실제
// 서비스에서도 흔한 합리적 방어라 [가정]으로 지금 넣어 둔다.
const MAX_ATTACHMENTS = 5

/*
  OVL-HELP-NEW (ST-F1-15, HELP-03/04). Originally a dedicated route
  (`/help/new`, a full page) — owner feedback (3차 #2) moved the PRIMARY
  entry to a modal opened from `/settings/support`'s own "새 문의 작성"
  button, same Dialog(데스크톱)/BottomSheet(모바일) split TaskCreateForm.jsx
  already uses. The old route now just redirects to `/settings/support`
  (router.js) — this component is the one place the actual form lives, so a
  future deep-link/standalone-page need only wraps THIS in whatever shell it
  wants instead of duplicating the fields.

  owner feedback #C, 3차 #1 — 회신 이메일은 이제 **선택**이다: 계정 이메일
  (useAccount)로 프리필하되, 사용자가 비워서 제출해도 막지 않는다(첨부와
  마찬가지로 선택 입력). 필수 검증은 제목·내용 두 개뿐.
  - 첨부는 `input type=file`만 잡고 실제 업로드는 하지 않는다([가정] — 실
    Swagger에 이 필드의 업로드 방식(멀티파트/서명 URL 등)이 없어, 이 mock
    단계에서는 선택한 파일의 "이름"만 서버에 보내는 자리표시자로 둔다).

  성공 시: 리드 지시대로 "닫히고 목록(내 문의) 갱신"만 한다 — 예전 라우트
  버전처럼 새 티켓의 상세 페이지로 이동하지 않는다(useCreateTicket이 이미
  ticketsKey를 invalidate하므로 목록은 저절로 최신화된다). `onSuccess`는
  호출자(SettingsSupportPage)가 모달을 닫고 "내 문의" 탭으로 전환하는 데 쓴다.
*/
export function TicketCreateForm({ onClose, onSuccess }) {
  const isDesktop = useIsDesktop()
  const titleRef = useRef(null)
  const accountQuery = useAccount()
  const createTicket = useCreateTicket()

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [email, setEmail] = useState('')
  // 계정 이메일이 아직 이 필드를 프리필한 적이 없는지 추적하는 별도 플래그 —
  // `!email`만으로 판단하면 사용자가 프리필된 값을 전부 지우려 할 때(빈
  // 문자열로 되돌아감) 이 렌더-중 갱신이 그 의도를 무시하고 다시 채워 넣어
  // 버린다. 렌더 중 조건부 setState(useEffect가 아니라 —
  // react-hooks/set-state-in-effect가 바로 이 패턴을 useEffect 대신 쓰라고
  // 요구한다: "Adjusting state when a prop changes")로 계정 이메일이 처음
  // 도착한 그 렌더에서 딱 한 번만 반영한다.
  const [emailPrefilled, setEmailPrefilled] = useState(false)
  const [attachments, setAttachments] = useState([]) // File[] — mock: 이름만 사용
  // owner feedback #9 — 카테고리 select. 첫 항목을 기본 선택해 두어(다른 폼의
  // 라디오/셀렉트 기본값 관례와 동일) 제출이 "선택 안 함" 상태로 막히지 않는다.
  const [category, setCategory] = useState(TICKET_CATEGORIES[0].value)

  if (accountQuery.data?.email && !emailPrefilled) {
    setEmailPrefilled(true)
    setEmail(accountQuery.data.email)
  }

  const trimmedTitle = title.trim()
  const trimmedBody = body.trim()
  const canSubmit = trimmedTitle.length > 0 && trimmedBody.length > 0 && !createTicket.isPending

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length > MAX_ATTACHMENTS) {
      toast({ tone: 'error', message: `첨부파일은 최대 ${MAX_ATTACHMENTS}개까지 첨부할 수 있습니다` })
      e.target.value = ''
      return
    }
    setAttachments(files)
  }

  const submit = (e) => {
    e.preventDefault()
    if (!canSubmit) return
    createTicket.mutate(
      {
        title: trimmedTitle,
        body: trimmedBody,
        category,
        email: email.trim() || null, // 3차 #1 — 선택 입력, 비워도 제출 허용
        attachments: attachments.map((f) => f.name),
      },
      {
        onSuccess: (ticket) => {
          toast({ tone: 'success', message: '문의가 접수되었습니다' })
          onSuccess?.(ticket)
        },
      },
    )
  }

  const formBody = (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h2 id={TITLE_ID} className="text-title font-semibold text-text">
        문의 작성
      </h2>

      <label className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">카테고리</span>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={FIELD}>
          {TICKET_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">제목 *</span>
        <input
          ref={titleRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="문의 제목을 입력해 주세요"
          className={FIELD}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">내용 *</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          placeholder="문의하실 내용을 자세히 적어 주세요"
          className={`${FIELD} resize-none`}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">
          회신 이메일 <span className="text-text-disabled">(선택)</span>
        </span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="답변받으실 이메일 주소"
          className={FIELD}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">
          첨부파일 <span className="text-text-disabled">(선택, 최대 {MAX_ATTACHMENTS}개)</span>
        </span>
        <input type="file" multiple onChange={handleFileChange} className={FIELD} />
        {attachments.length > 0 && (
          <ul className="mt-1 flex flex-col gap-0.5">
            {attachments.map((file, i) => (
              <li key={`${file.name}-${i}`} className="truncate text-caption text-text-muted">
                {file.name}
              </li>
            ))}
          </ul>
        )}
      </label>

      {createTicket.isError && <ErrorState variant="inline" onAction={() => createTicket.reset()} />}

      <div className="mt-1 flex items-center justify-between gap-2">
        <span role="alert" className="text-caption text-danger-700">
          {!trimmedTitle || !trimmedBody ? '제목과 내용을 입력해 주세요' : ''}
        </span>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" variant="primary" size="md" loading={createTicket.isPending} disabled={!canSubmit}>
            접수하기
          </Button>
        </div>
      </div>
    </form>
  )

  if (isDesktop) {
    return (
      <Dialog open onClose={onClose} labelledById={TITLE_ID} initialFocusRef={titleRef} size="lg">
        {formBody}
      </Dialog>
    )
  }
  return (
    <BottomSheet open onClose={onClose} labelledById={TITLE_ID} initialFocusRef={titleRef}>
      {formBody}
    </BottomSheet>
  )
}

export default TicketCreateForm
