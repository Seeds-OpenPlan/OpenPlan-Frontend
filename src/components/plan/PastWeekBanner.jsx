import { Banner } from '../common/Banner'

/*
  Read-only banner for past weeks (AC-5). A past week's blocks can't be moved or
  re-planned; only record/complete transitions are allowed (those actions land in
  ST-F1-04). The banner states the reason in text so the disabled interactions are
  explained rather than silently inert.
*/
export function PastWeekBanner() {
  return (
    <Banner
      tone="info"
      message="지난 주간 계획입니다 · 배치 변경은 할 수 없고 기록·완료만 가능합니다"
      dismissible={false}
      sticky={false}
    />
  )
}

export default PastWeekBanner
