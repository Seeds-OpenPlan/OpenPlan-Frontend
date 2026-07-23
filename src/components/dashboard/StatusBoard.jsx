import { Link } from 'react-router-dom'
import { Button } from '../common/Button'
import { ErrorState } from '../common/ErrorState'
import { formatDurationKO } from '../../features/plan/planTime'

/*
  S1 · 이번 주 상태 보드 (DASH-01 + DASH-07 흡수 — ui-spec-dash.md §DASH.1, r2).
  The 3-state word/color table is FIXED by the (missing) decision doc's §4.5
  values, quoted verbatim in ui-spec-dash.md — this table is the only place
  that mapping lives, so a future copy tweak changes one object, not every
  call site.

  The status/percent/minutes are ALL server-decided (dry-run-style judgment,
  not something this component recomputes) — `status` alone drives the
  color/word and the progress bar's overload branch; the percent shown is
  plain arithmetic for display only, never used to re-derive `status` itself
  (ui-spec's "서버 판정 소비 — FE 재계산 금지").

  r2 delta (product-owner feedback, absorbing what r1 spread across two other
  cards): the [가용시간] button is gone — its only unique job (a way to the
  availability setting) now rides the meta line's own "가용시간 조정 →" text
  link, right next to the VALUE it edits, instead of a second button beside
  [주간 계획 확인]. 손 볼 요일 (DASH-07) drops its own heading/divider
  sub-section and becomes the meta area's last line — same information, no
  longer reading as a separate card-within-a-card.
*/
const STATUS_COPY = {
  OK: { label: '무리 없음', textClass: 'text-text' },
  TIGHT: { label: '여유 부족', textClass: 'text-warning-700' },
  OVERLOAD: { label: '과부하', textClass: 'text-danger-700' },
}

export function StatusBoard({
  error = false,
  onRetry,
  status = 'OK',
  plannedMinutes = 0,
  availableMinutes = 0,
  focusWindow,
  adjustDays = [],
  onOpenWeekly,
}) {
  if (error) {
    return (
      <section>
        <h2 className="sr-only">이번 주 상태 보드</h2>
        <ErrorState variant="section" onAction={onRetry} />
      </section>
    )
  }

  const copy = STATUS_COPY[status] ?? STATUS_COPY.OK
  const overloaded = status === 'OVERLOAD'
  const percent = availableMinutes > 0 ? Math.round((plannedMinutes / availableMinutes) * 100) : 0
  const fillPercent = Math.min(Math.max(percent, 0), 100)
  const remainingMinutes = Math.max(availableMinutes - plannedMinutes, 0)
  const overMinutes = Math.max(plannedMinutes - availableMinutes, 0)

  return (
    // md:relative + the CTA's md:absolute below: on desktop the button sits
    // top-right BESIDE the headline, matching PlanHeader's "카드/헤더 우상단
    // 액션" system (size sm there too). Mobile keeps it in normal flow, full
    // width, size lg (48px — the one CTA left still needs the mobile touch
    // target ui-spec §0.4 requires; sm/md would violate it there).
    <div className="rounded-card border border-border bg-surface p-4 md:relative md:p-5">
      <div className="md:pr-40">
        <p className="flex items-baseline gap-2">
          <span className={`text-display font-bold ${copy.textClass}`}>{copy.label}</span>
          <span className="text-title text-text-muted tabular-nums">{percent}%</span>
        </p>
        <p className="mt-1 text-body font-medium text-text tabular-nums">
          {formatDurationKO(plannedMinutes)} / {formatDurationKO(availableMinutes)}
        </p>
      </div>

      <div className="mt-4">
        <div
          role="progressbar"
          aria-valuenow={fillPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`가용 ${formatDurationKO(availableMinutes)} 중 ${formatDurationKO(plannedMinutes)} 계획`}
          className="h-2 w-full overflow-hidden rounded-full bg-neutral-200"
        >
          <div
            className={`h-full rounded-full ${overloaded ? 'bg-danger-600' : 'bg-neutral-800'}`}
            style={{ width: `${fillPercent}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-caption text-text-muted tabular-nums">
          <span>0</span>
          <span>{formatDurationKO(availableMinutes)}</span>
        </div>
      </div>

      {/* 메타 영역: 여유/초과 · 집중 시간 · 가용시간 조정 링크 — 값과 진입점을
          한 자리에 (r2 §DASH.1 "기준 카드 흡수"). */}
      <p className="mt-2 flex flex-wrap items-center gap-x-1 text-label text-text-muted tabular-nums">
        <span>
          {overloaded ? (
            <span className="font-medium text-danger-700">초과 {formatDurationKO(overMinutes)}</span>
          ) : (
            <>
              여유 <span className="font-medium text-text">{formatDurationKO(remainingMinutes)}</span>
            </>
          )}
          {focusWindow && <> · 집중 {focusWindow}</>}
          {' · '}
        </span>
        <Link
          to="/settings"
          className="rounded font-medium text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          가용시간 조정 →
        </Link>
      </p>

      {/* 손 볼 요일(DASH-07) — 더 이상 별도 소제목/구분선 없이 메타 영역의
          마지막 한 줄. 비인터랙티브(노출까지만 — r1과 동일), % 텍스트 병기
          필수(AC-2, 색 단독 아님). */}
      {adjustDays.length === 0 ? (
        <p className="mt-1 text-label text-text-muted">이번 주는 손 볼 요일 없음</p>
      ) : (
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-label">
          <span className="text-caption text-text-muted">손 볼 요일</span>
          {adjustDays.map((d) => (
            <span
              key={d.dayLabel}
              className="rounded-chip bg-warning-50 px-2 py-1 text-caption font-medium text-warning-700"
            >
              {d.dayLabel} · 잔여 {d.remainingPercent}%
            </span>
          ))}
        </p>
      )}

      {/* CTA: normal-flow full-width row on mobile; pinned to the card's
          top-right corner on desktop (md:relative on the card above makes
          this absolute positioning relative to the CARD, not the viewport). */}
      <div className="mt-4 md:absolute md:right-5 md:top-5 md:mt-0">
        <Button variant="primary" size="lg" className="w-full md:hidden" onClick={onOpenWeekly}>
          주간 계획 확인
        </Button>
        <Button variant="primary" size="sm" className="hidden md:inline-flex" onClick={onOpenWeekly}>
          주간 계획 확인
        </Button>
      </div>
    </div>
  )
}

export default StatusBoard
