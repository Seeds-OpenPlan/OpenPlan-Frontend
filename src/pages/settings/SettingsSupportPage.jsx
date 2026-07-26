import { useState } from 'react'
import { HelpTabs } from '../../components/help/HelpTabs'
import { FaqBrowser } from '../../components/help/FaqBrowser'
import { TicketAccordionList } from '../../components/help/TicketAccordionList'
import { TicketCreateForm } from '../../components/help/TicketCreateForm'
import { Button } from '../../components/common/Button'

/*
  SCR-SET 하위 "지원" (ST-F1-15, owner feedback #D — 이전엔 최상위 `/faq`·
  `/help`로 튕겨 나갔지만, 다른 설정 항목처럼 설정 안에 머물며 우측 디테일
  pane에 뜨도록 재구성). `settings-detail-title` id는 다른 설정 하위 화면과
  동일한 규약(SettingsLayout.jsx 자신의 헤더 참고 — 모바일 BottomSheet의
  labelledById가 이 id 하나로 전 화면을 공유한다).

  FAQ/내 문의 전환은 이제 라우트가 아니라 이 페이지 하나 안의 로컬 상태다
  (HelpTabs.jsx 자신의 헤더 참고) — 기본값은 'faq'(owner feedback #7 "지원
  진입 시 FAQ 먼저"와 동일한 순서). 탭은 owner feedback #B대로 제목("지원")
  바로 오른쪽에 인접 배치하고, "새 문의 작성"은 별도로 오른쪽 끝에 둔다.

  owner feedback 3차 #2 — "새 문의 작성"은 더 이상 `/help/new`로 이동하지
  않고 이 페이지가 직접 TicketCreateForm 모달을 띄운다. 버튼은 두 탭 모두에서
  계속 보인다([가정] — 오너가 "FAQ에서도 버튼이 떠 있다"는 점을 언급했지만
  모달 전환 자체가 핵심 지시였고 버튼을 탭별로 감추라는 명시적 지시는 없어
  전역 액션으로 유지; 어긋나면 조정). 성공 시 모달을 닫고 "내 문의" 탭으로
  전환한다 — 리드 지시 "제출하면 닫히고 목록(내 문의) 갱신" 그대로(목록 자체
  갱신은 useCreateTicket의 invalidate가 이미 처리).

  `/help/:ticketId`·`/notices/:noticeId` 같은 딥링크 라우트는 변경 없음 —
  알림 클릭·직접 URL·AC-1 소유권 방어는 그 라우트들이 그대로 소유한다
  (TicketAccordionList/FaqBrowser 자신의 헤더 참고). `/help/new`는 이제
  `/settings/support`로 redirect만 하는 자리표시자다(router.js).
*/
function SettingsSupportPage() {
  const [tab, setTab] = useState('faq')
  const [createOpen, setCreateOpen] = useState(false)

  const openCreate = () => setCreateOpen(true)
  const closeCreate = () => setCreateOpen(false)
  const handleCreateSuccess = () => {
    setCreateOpen(false)
    setTab('tickets')
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 id="settings-detail-title" className="text-title font-semibold text-text">
            지원
          </h2>
          <HelpTabs value={tab} onChange={setTab} />
        </div>
        <Button variant="primary" size="sm" onClick={openCreate}>
          새 문의 작성
        </Button>
      </div>

      {tab === 'faq' ? (
        <FaqBrowser onCreateNew={openCreate} />
      ) : (
        <TicketAccordionList onCreateNew={openCreate} />
      )}

      {createOpen && <TicketCreateForm onClose={closeCreate} onSuccess={handleCreateSuccess} />}
    </div>
  )
}

export default SettingsSupportPage
