import { ChevronLeftIcon, ChevronRightIcon } from './planIcons'
import { weekLabelKO } from '../../features/plan/planTime'

/*
  Week navigator (PLAN-02): ‹ N월 M주차 › centered above the grid. Prev/next are
  real buttons (keyboard + SR reachable) with explicit labels; the visible month
  label is the primary text so the icons are decorative only.
*/
export function WeekNav({ weekStartISO, isCurrentWeek = false, onPrev, onNext, onToday }) {
  return (
    /*
      A6: "이번 주" 버튼이 늘 `absolute right-0`였고 가운데 그룹은 `justify-
      center`로만 가운데 놓였다 — 둘은 서로의 폭을 모르므로, 월/주차 라벨이
      길어지거나 화면이 좁아지면(360~375px) 겹칠 수 있다(SummaryBar가 375px
      에서 실측으로 겪은 것과 같은 종류의 조합, 그 파일의 주석 참고). 데스크톱
      (md+)은 그 가운데+절대 배치 그대로 두고, 모바일은 absolute를 걷어 **진짜
      흐름**(justify-between)으로 둔다 — 겹칠 수가 없는 구조. 버튼이 없을 때는
      가운데 그룹 하나만 남아 justify-between이든 justify-center든 결과가
      같으므로 "이번 주"가 안 보이는 현재 주차 화면은 그대로다.
    */
    <div className="relative flex items-center justify-between gap-2 md:justify-center">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          aria-label="이전 주"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-text-muted transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <ChevronLeftIcon className="text-base" />
        </button>

        <h2 className="min-w-[7rem] text-center text-title font-bold text-text" aria-live="polite">
          {weekLabelKO(weekStartISO)}
        </h2>

        <button
          type="button"
          onClick={onNext}
          aria-label="다음 주"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-text-muted transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <ChevronRightIcon className="text-base" />
        </button>
      </div>

      {/* Quick jump to the current week — only shown when viewing another week
          (redundant on the current one). md+에서만 절대 배치로 오른쪽 끝에
          붙고, 모바일에서는 위 flex 흐름의 두 번째 아이템으로 justify-between
          이 오른쪽 끝에 놓아 준다(겹침 없이 같은 결과). */}
      {!isCurrentWeek && (
        <button
          type="button"
          onClick={onToday}
          className="rounded-full border border-border px-2.5 py-1 text-caption font-medium text-text-muted transition-colors hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring md:absolute md:right-0"
        >
          이번 주
        </button>
      )}
    </div>
  )
}

export default WeekNav
