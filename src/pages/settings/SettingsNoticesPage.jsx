import { AnnouncementAccordionList } from '../../components/help/AnnouncementAccordionList'

/*
  SCR-SET 하위 "공지" (ST-F1-15, owner feedback #D — 최상위 `/notices`에서
  이곳으로 옮김. `settings-detail-title` id는 다른 설정 하위 화면과 동일한
  규약(SettingsLayout.jsx 자신의 헤더 참고).

  `/notices/:noticeId` 딥링크 라우트는 변경 없음 — 알림 클릭·직접 URL이
  그대로 그리로 간다(AnnouncementAccordionList/AnnouncementContent 자신의
  헤더 참고).
*/
function SettingsNoticesPage() {
  return (
    <div className="flex flex-col gap-4">
      <h2 id="settings-detail-title" className="text-title font-semibold text-text">
        공지
      </h2>
      <AnnouncementAccordionList />
    </div>
  )
}

export default SettingsNoticesPage
