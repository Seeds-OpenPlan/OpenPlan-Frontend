import { useMemo } from 'react'
import { Badge } from '../common/Badge'
import { Skeleton } from '../common/Skeleton'
import { AlertTriangleIcon } from '../common/statusIcons'
import {
  blockRect,
  hourTicks,
  PX_PER_MIN,
  rangeHeightPx,
  visibleRange,
} from '../../features/plan/planGeometry'
import { dateOf, formatMinutesLabel, minutesOfDay, weekLabelKO, WEEKDAY_LABELS_KO } from '../../features/plan/planTime'
import { compareBySeverity, severityLabels, violationCopy } from '../../features/plan/violationMessages'
import {
  VIOLATION_BORDER_CLASSES,
  VIOLATION_CHIP_CLASSES,
  VIOLATION_STRIPES,
} from '../../features/plan/violationStyles'

/*
  AC-3 미리보기 — a compact, READ-ONLY mini weekly grid, fed by
  useTaskEditPreview.js. Built from the SAME geometry primitives the real
  calendar (CalendarGrid.jsx) uses — blockRect/PX_PER_MIN/rangeHeightPx/
  hourTicks — so a block's on-screen position here is not a second, possibly-
  disagreeing math from the real grid's own.

  Deliberately NOT interactive: no drag, no resize, no click-to-open, no
  context menu. This view exists to ANSWER "what would this change do to the
  week", not to let the user act on it from here — PLAN-11's own guarantee
  ("실제로 저장되지 않았습니다", rendered verbatim below — do not paraphrase
  this string) would be a lie the moment this view could write anything.

  NFR-017: every violation is restated as full TEXT in the list under the
  grid — the on-block chip/border is a supplementary pointer only, since the
  blocks themselves are far too narrow here to reliably show a real message.
*/
const PREVIEW_MAX_HEIGHT_PX = 260

// The worst (highest-severity) issue targeting this specific block, or null.
// Mirrors PlanBlock.jsx's own `violation` prop shape (severity/label/count)
// so the two views read consistently if a reviewer compares them side by
// side.
function violationFor(issues, planBlockId) {
  const hits = issues.filter((issue) => issue.targetBlockIds?.includes(planBlockId))
  if (hits.length === 0) return null
  const [worst] = [...hits].sort(compareBySeverity)
  const copy = violationCopy(worst)
  return { severity: copy.severity, label: copy.label, count: hits.length }
}

function MiniBlock({ block, range, isVirtual, violation }) {
  const startMin = minutesOfDay(block.startAt)
  const endMin = minutesOfDay(block.endAt)
  const rect = blockRect(startMin, endMin, range)
  const timeLabel = `${formatMinutesLabel(startMin)}-${formatMinutesLabel(endMin)}`
  // Violation look is shared with the real weekly plan (PlanBlock) via
  // violationStyles.js — same border color AND the same diagonal hatch stripe,
  // so 차단/경고 read identically here and there (owner request). Falls back to
  // the virtual-block brand outline, then the plain block border.
  const borderClass = violation
    ? VIOLATION_BORDER_CLASSES[violation.severity]
    : isVirtual
      ? 'border-brand-600'
      : 'border-border'

  return (
    <div
      style={{
        top: rect.top,
        height: rect.height,
        // Same hatch PlanBlock paints into a violated block's background.
        ...(violation ? { backgroundImage: VIOLATION_STRIPES[violation.severity] } : null),
      }}
      aria-label={`${isVirtual ? '미리보기 · ' : ''}${block.title}, ${timeLabel}${
        violation ? `, ${severityLabels[violation.severity]} ${violation.label}` : ''
      }`}
      className={[
        'absolute inset-x-0.5 overflow-hidden rounded-control border px-1 py-0.5 text-left text-[0.6rem] leading-tight',
        isVirtual ? 'z-10 bg-brand-100 text-brand-900 ring-1 ring-brand-600' : 'bg-surface-sunken text-text-muted',
        borderClass,
      ].join(' ')}
    >
      <span className="block truncate font-medium">
        {isVirtual ? '미리보기 · ' : ''}
        {block.title}
      </span>
      <span className="block truncate opacity-80">{timeLabel}</span>
      {violation && (
        <span
          className={[
            'mt-0.5 inline-flex items-center gap-0.5 rounded-chip px-1 py-px text-[0.55rem] font-bold',
            VIOLATION_CHIP_CLASSES[violation.severity],
          ].join(' ')}
        >
          <AlertTriangleIcon size={8} />
          {severityLabels[violation.severity]}
        </span>
      )}
    </div>
  )
}

export function TaskEditPreview({
  weekStartISO,
  days,
  availability,
  blocks,
  virtualBlock,
  issues,
  blockingCount,
  warningCount,
  delayed,
  loading,
  noSlot,
}) {
  const range = useMemo(() => visibleRange('focus', availability), [availability])
  const ticks = useMemo(() => hourTicks(range), [range])
  const orderedIssues = useMemo(() => [...issues].sort(compareBySeverity), [issues])

  return (
    <section aria-label="미리보기" className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-label font-semibold text-text">미리보기 · {weekLabelKO(weekStartISO)}</h2>
          {/* Exact required caption (AC-3, PLAN-11) — never paraphrase. */}
          <p className="text-caption text-text-muted">실제로 저장되지 않았습니다</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge tone={blockingCount > 0 ? 'danger' : 'neutral'} label={`차단 ${blockingCount}건`} />
          <Badge tone={warningCount > 0 ? 'warning' : 'neutral'} label={`경고 ${warningCount}건`} />
        </div>
      </div>

      {/* Same "keep the last good result visible, say it might be stale"
          contract usePlanValidation gives the real weekly plan (AC-1 of
          ST-F1-05) — a validation failure here must not silently blank the
          preview into looking clean. */}
      {delayed && (
        <p className="rounded-card border border-border bg-surface-sunken px-3 py-2 text-caption text-text-muted">
          검증 지연 · 마지막으로 확인한 결과를 보여 주고 있습니다
        </p>
      )}

      {loading ? (
        <Skeleton width="100%" height="10rem" />
      ) : noSlot ? (
        <p className="rounded-card border border-border bg-surface-sunken px-3 py-6 text-center text-caption text-text-muted">
          이번 주에 미리보기를 배치할 자리를 찾지 못했습니다 — 가용 시간이 부족합니다
        </p>
      ) : (
        <div className="overflow-hidden rounded-control border border-border">
          {/* The header row lives INSIDE the same scroll container as the body
              and is pinned with `sticky` — so both share one width and the
              scrollbar can't offset the 7 header columns from the 7 body
              columns (previously the header sat outside the scroll box and drifted
              by the scrollbar's width). */}
          <div className="overflow-y-auto" style={{ maxHeight: PREVIEW_MAX_HEIGHT_PX }}>
            <div className="sticky top-0 z-20 grid grid-cols-7 border-b border-border bg-surface-sunken text-center text-caption text-text-muted">
              {WEEKDAY_LABELS_KO.map((label) => (
                <span key={label} className="border-l border-border py-1 first:border-l-0">
                  {label}
                </span>
              ))}
            </div>
            <div className="relative grid grid-cols-7" style={{ height: rangeHeightPx(range) }}>
              {ticks.map((h) => (
                <div
                  key={h}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 border-t border-border/60"
                  style={{ top: (h * 60 - range.startMinutes) * PX_PER_MIN }}
                />
              ))}
              {days.map((dayISO) => (
                <div key={dayISO} className="relative border-l border-border first:border-l-0">
                  {blocks
                    .filter((b) => dateOf(b.startAt) === dayISO)
                    .map((b) => (
                      <MiniBlock
                        key={b.planBlockId}
                        block={b}
                        range={range}
                        isVirtual={b.planBlockId === virtualBlock?.planBlockId}
                        violation={violationFor(issues, b.planBlockId)}
                      />
                    ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {orderedIssues.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {orderedIssues.map((issue) => {
            const copy = violationCopy(issue)
            return (
              <li key={issue.id} className="flex items-start gap-2 text-caption">
                <Badge tone={copy.severity === 'blocking' ? 'danger' : 'warning'} label={severityLabels[copy.severity]} />
                <span className="text-text">{copy.text}</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default TaskEditPreview
