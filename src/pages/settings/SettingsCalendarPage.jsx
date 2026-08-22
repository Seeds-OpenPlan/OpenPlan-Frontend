import { CalendarConnectionSection } from '../../components/settings/CalendarConnectionSection'

/*
  SettingsCalendarPage — 연동 (FIX-13~17 + 신규 연동 생성). 오너 리뷰 3차,
  item 4: 라운드 2에서 계정 화면의 한 섹션으로 접었던 것을 다시 독립 하위
  화면으로 되돌렸다(오너 의도 정정 — "계정 바로 옆"은 같은 화면 안이 아니라
  리스트에서 인접한 별도 항목이었다). UI/데이터 자체(CalendarConnectionSection
  — 구글·애플 각자 독립된 연결/해제 토글, 오너 4차 리뷰로 라운드 2의 단일
  병합을 정정)는 그대로 재사용, 이 페이지는 배치만 한다.

  `id="settings-detail-title"` — 모바일 BottomSheet가 `labelledById`로 참조하는
  공용 id(item 6). Outlet은 한 번에 한 하위 페이지만 렌더하므로 모든 설정
  하위 페이지가 같은 리터럴 id를 써도 충돌하지 않는다.
*/
function SettingsCalendarPage() {
  return (
    <div className="flex flex-col gap-6">
      <h2 id="settings-detail-title" className="text-title font-semibold text-text">
        캘린더 연동
      </h2>
      <CalendarConnectionSection />
    </div>
  )
}

export default SettingsCalendarPage
