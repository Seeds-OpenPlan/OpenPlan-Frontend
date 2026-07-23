import { useId, useRef, useState } from 'react'
import { Dialog } from '../common/Dialog'
import { BottomSheet } from '../common/BottomSheet'
import { Button } from '../common/Button'
import { Badge } from '../common/Badge'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import {
  BASELINE_OPTION,
  BASELINE_STRATEGY_TYPE,
  GENERATED_STRATEGY_TYPES,
  replanStrategyCatalog,
} from '../../features/plan/replanStrategies'

/*
  재계획 대안 비교 (PLAN-29 · RB-PLAN-03~05 · RB-STAT-04 표면). Four fixed
  alternatives, always in this order (P3 — names/blurbs come from
  replanStrategies.js, the single catalog): 기존 계획 유지안 (client-only
  baseline, always ready) then the three server-generated strategies. Selecting
  one and pressing [적용] replaces the week's DRAFT with that option's proposed
  block set (AC-3) and re-runs validation; nothing here saves/confirms the week
  — that stays PLAN-03's job (C-2 double protection, same as auto-place's apply
  step in ST-F1-03).

  Mounted CONDITIONALLY by the page (fresh per open, same pattern as
  ScheduleForm), so `open` is always true here — the page's `{replanOpen && ...}`
  is what actually gates visibility. The three generated alternatives are
  (re)requested every time this mounts: the block set may have changed since the
  last time it was open, and a fresh comparison is cheap (mock ~220ms/strategy)
  and simply correct, where reusing a stale one would not be.

  Rendered as native <input type="radio"> — arrow-key navigation and the
  "exactly one of four" semantic come from the browser for free, which a
  button-group re-implementation would have to hand-roll.
*/

function StrategyCard({ type, label, blurb, state, selected, disabled, onSelect, onRetry }) {
  const inputId = `replan-option-${type}`
  const isBaseline = type === BASELINE_STRATEGY_TYPE

  return (
    <li
      className={[
        'rounded-card border p-3 transition-colors',
        selected ? 'border-brand-500 bg-brand-50/40' : 'border-border',
      ].join(' ')}
    >
      <label htmlFor={inputId} className="flex cursor-pointer items-start gap-3">
        <input
          id={inputId}
          type="radio"
          name="replan-option"
          checked={selected}
          // A generated card is only selectable once it has a real option to
          // apply; idle/loading/error cards stay disabled until success (or
          // baseline, which is always ready).
          disabled={disabled || (!isBaseline && state.status !== 'success')}
          onChange={() => onSelect(type)}
          className="mt-1 h-4 w-4 accent-brand-600"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-label font-semibold text-text">{label}</span>
            {!isBaseline && state.status === 'success' && state.option && (
              <Badge tone="neutral" label="생성됨" />
            )}
          </span>
          <span className="text-caption text-text-muted">{blurb}</span>

          {isBaseline ? (
            <span className="mt-1 text-caption text-text-muted">
              변경 요약: {BASELINE_OPTION.changeSummary} · 근거: {BASELINE_OPTION.recommendationReason}
            </span>
          ) : state.status === 'loading' ? (
            // A skeleton line, not a spinner (Skeleton.jsx's no-spinner-hell
            // rule applies here too, even for this per-card loading state).
            <span
              aria-hidden="true"
              className="mt-1 h-3 w-3/4 animate-pulse rounded bg-surface-sunken motion-reduce:animate-none"
            />
          ) : state.status === 'error' ? (
            <span className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-caption text-danger-700">대안을 생성하지 못했습니다</span>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault() // don't also toggle the radio via the surrounding <label>
                  onRetry(type)
                }}
                className="text-caption font-medium text-brand-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                다시 시도
              </button>
            </span>
          ) : state.status === 'success' && state.option ? (
            <span className="mt-1 text-caption text-text-muted">
              변경 요약: {state.option.changeSummary} · 근거: {state.option.recommendationReason}
            </span>
          ) : state.status === 'success' ? (
            // A resolved-but-null option: the server genuinely has nothing to
            // propose for this strategy (e.g. MINIMAL_CHANGE with no 차단 to
            // fix) — a real result, not an error, so it reads that way too.
            <span className="mt-1 text-caption text-text-muted">제안할 변경 사항이 없습니다</span>
          ) : (
            <span className="mt-1 text-caption text-text-muted">대기 중</span>
          )}
        </span>
      </label>
    </li>
  )
}

function ModalBody({
  titleId,
  closeRef,
  strategies,
  selectedType,
  onSelectType,
  onGenerateAll,
  onRetryStrategy,
  onApply,
  applying,
  applyConflict,
  isGenerating,
  slowNotice,
  onClose,
}) {
  const selectedOption =
    selectedType === BASELINE_STRATEGY_TYPE
      ? BASELINE_OPTION
      : (strategies[selectedType]?.option ?? null)
  const canApply = !applying && !applyConflict && selectedOption != null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id={titleId} className="text-title font-bold text-text">
          재계획 대안
        </h2>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="rounded-control px-2 py-1 text-label text-text-muted hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          닫기
        </button>
      </div>

      <p className="text-caption text-text-muted">
        네 가지 대안을 비교하고 하나를 선택해 적용하세요. 적용해도 주간 계획은 아직 저장되지 않습니다.
      </p>

      {/* NFR-029 — a non-blocking notice, not a takeover: the cards below keep
          filling in as each strategy resolves; this only explains why some are
          still loading past the point a user would start to wonder. */}
      {slowNotice && isGenerating && (
        <p className="rounded-card border border-border bg-surface-sunken px-3 py-2 text-caption text-text-muted">
          대안을 생성하는 데 시간이 걸리고 있습니다. 잠시만 기다려 주세요
        </p>
      )}

      {applyConflict && (
        <p
          role="alert"
          className="rounded-card border border-danger-500 bg-danger-50 px-3 py-2 text-caption text-danger-700"
        >
          이 대안 목록이 더 이상 최신이 아닙니다. 다시 생성한 뒤 다시 선택해 주세요
        </p>
      )}

      <ul className="flex flex-col gap-2">
        <StrategyCard
          type={BASELINE_STRATEGY_TYPE}
          label={replanStrategyCatalog.BASELINE.label}
          blurb={replanStrategyCatalog.BASELINE.blurb}
          state={{ status: 'success', option: BASELINE_OPTION }}
          selected={selectedType === BASELINE_STRATEGY_TYPE}
          disabled={applying}
          onSelect={onSelectType}
          onRetry={() => {}}
        />
        {GENERATED_STRATEGY_TYPES.map((type) => (
          <StrategyCard
            key={type}
            type={type}
            label={replanStrategyCatalog[type].label}
            blurb={replanStrategyCatalog[type].blurb}
            state={strategies[type]}
            selected={selectedType === type}
            disabled={applying || applyConflict}
            onSelect={onSelectType}
            onRetry={onRetryStrategy}
          />
        ))}
      </ul>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" size="md" onClick={onGenerateAll} disabled={applying}>
          다시 생성
        </Button>
        <Button variant="secondary" size="md" onClick={onClose} disabled={applying}>
          닫기
        </Button>
        <Button
          variant="primary"
          size="md"
          loading={applying}
          disabled={!canApply}
          onClick={() => onApply(selectedOption)}
        >
          적용
        </Button>
      </div>
    </div>
  )
}

export function ReplanOptionsModal({
  strategies,
  onGenerateAll,
  onRetryStrategy,
  onApply,
  onClose,
  applying = false,
  applyConflict = false,
  isGenerating = false,
  slowNotice = false,
}) {
  const isDesktop = useIsDesktop()
  const titleId = useId()
  const closeRef = useRef(null)
  // Default selection = 기존 계획 유지안 (BASELINE). ASSUMPTION (flagged to the
  // team lead): FIX-12's "재계획 대안 기본값" picker is ST-F1-12, which doesn't
  // exist yet, so there is no stored user preference to read here. Absent one,
  // the alternative that changes NOTHING is the safest default — selecting it
  // and pressing 적용 is a no-op close, never an unintended overwrite.
  const [selectedType, setSelectedType] = useState(BASELINE_STRATEGY_TYPE)

  const body = (
    <ModalBody
      titleId={titleId}
      closeRef={closeRef}
      strategies={strategies}
      selectedType={selectedType}
      onSelectType={setSelectedType}
      onGenerateAll={onGenerateAll}
      onRetryStrategy={onRetryStrategy}
      onApply={onApply}
      applying={applying}
      applyConflict={applyConflict}
      isGenerating={isGenerating}
      slowNotice={slowNotice}
      onClose={onClose}
    />
  )

  if (isDesktop) {
    return (
      <Dialog open onClose={onClose} labelledById={titleId} initialFocusRef={closeRef} size="lg">
        {body}
      </Dialog>
    )
  }
  return (
    <BottomSheet open onClose={onClose} labelledById={titleId} initialFocusRef={closeRef}>
      {body}
    </BottomSheet>
  )
}

export default ReplanOptionsModal
