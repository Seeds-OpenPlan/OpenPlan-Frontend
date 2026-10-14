import { CalendarConnectionSection } from '../../components/settings/CalendarConnectionSection'

/*
  SettingsCalendarPage — 연동 (FIX-13~17 + 신규 연동 생성). 오너 리뷰 3차,
  item 4: 라운드 2에서 계정 화면의 한 섹션으로 접었던 것을 다시 독립 하위
  화면으로 되돌렸다(오너 의도 정정 — "계정 바로 옆"은 같은 화면 안이 아니라
  리스트에서 인접한 별도 항목이었다). UI/데이터 자체(CalendarConnectionSection
  — 구글·애플 각자 독립된 연결/해제 토글, 오너 4차 리뷰로 라운드 2의 단일
  병합을 정정)는 그대로 재사용, 이 페이지는 배치만 한다.

  `id="settings-detail-title"` — 설정 하위 페이지 전체가 공유하는 리터럴 id
  (item 6). Outlet은 한 번에 한 하위 페이지만 렌더하므로 모든 설정 하위
  페이지가 같은 리터럴 id를 써도 충돌하지 않는다. (PR #82 AI 리뷰 Blocking
  fix, 2026-10: 모바일 상세 헤더가 한때 경로→제목 맵에서 따로 가져온 문구를
  동시에 그려 제목이 두 번 보였다 — 지금은 헤더가 「← 설정」만 그리고, 제목의
  유일한 출처는 이 h2다. SettingsLayout.jsx가 라우트 전환 시 바로 이 id를
  찾아 포커스를 옮긴다 — 그래서 이 id는 여전히 살아 있는, 오히려 전보다 더
  중요해진 계약이다.)
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
