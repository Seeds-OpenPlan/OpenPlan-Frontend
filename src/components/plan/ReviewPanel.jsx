import { useId, useRef } from 'react'
import { Dialog } from '../common/Dialog'
import { BottomSheet } from '../common/BottomSheet'
import { Badge } from '../common/Badge'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import { compareBySeverity, severityLabels, violationCopy } from '../../features/plan/violationMessages'

/*
  PNL-REVIEW — layer 3 of the validation display (PLAN-22~27). Lists every issue
  the dry-run found, 차단 first, and hands the selected one back so the page can
  focus the offending block (PLAN-23).

  Two rules shape the row layout:
  - Type AND target always appear as TEXT (NFR-017). The severity badge is a
    duplicate signal, never the only one.
  - Every row is a real <button>: selection is a keyboard-reachable action, and
    the browser gives us Enter/Space and :focus-visible for free.

  A pair violation (V1 겹침 / V2 고정 일정 충돌) names BOTH blocks and the time range
  inside its message — that pairing is the whole point of PLAN-24/25, so it lives
  in the copy catalog rather than being assembled here.

  Desktop = centered Dialog, mobile = BottomSheet (§0.3), matching OVL-CONFLICT.

  With many warnings the issue list can outgrow the shell. `sticky` alone can't
  fix that: its offset is relative to the SCROLLPORT, but the element still
  can't leave its own containing block, so pinning it inside a padded scroll
  area still leaves that padding's worth of gap for rows to slide past above
  it — tried once, visibly wrong. What this needs is a REAL nested layout: a
  non-scrolling header (title/close/차단·경고 badges) above a list that owns its
  own `overflow-y-auto` region, so the header's background genuinely reaches
  the shell's top edge and only the list underneath it ever scrolls.

  That means PanelBody must own 100% of the shell's content box instead of
  sitting inside Dialog/BottomSheet's own padded/scrolling wrapper — both take
  `scrollBody={false}` below for exactly this (see Dialog.jsx's comment on the
  prop). `min-h-0` reappears at every flex level from there down to the list:
  a flex item's default minimum size is its CONTENT size, and PLAN's list is
  the one thing here tall enough for that default to matter — without it, an
  ancestor several levels up (not the list itself) would refuse to shrink and
  the whole panel would blow past the height cap again, just via a different
  mechanism than the original bug.
*/
function IssueRow({ issue, onSelect }) {
  const copy = violationCopy(issue)
  const isBlocking = copy.severity === 'blocking'
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect?.(issue)}
        className={[
          'flex w-full flex-col items-start gap-1 rounded-card border p-3 text-left',
          'transition-colors duration-fast ease-standard',
          'hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
          isBlocking ? 'border-danger-500' : 'border-border',
        ].join(' ')}
      >
        <span className="flex items-center gap-2">
          <Badge
            tone={isBlocking ? 'danger' : 'warning'}
            label={severityLabels[copy.severity]}
          />
          <span className="text-label font-semibold text-text">{copy.label}</span>
        </span>
        <span className="text-label leading-snug text-text">{copy.text}</span>
        <span className="text-caption leading-snug text-text-muted">{copy.hint}</span>
      </button>
    </li>
  )
}

function PanelBody({
  titleId,
  closeRef,
  blockingCount,
  warningCount,
  issues,
  delayed,
  onSelectIssue,
  onClose,
}) {
  // 차단 first: they are the ones actually holding the save button down, so they
  // must be what the user reads first. Sorting a copy keeps the caller's array
  // (which the grid marking also reads) untouched.
  const ordered = [...issues].sort(compareBySeverity)

  return (
    // Fills the shell's whole content box (`scrollBody={false}` on both Dialog
    // and BottomSheet hands us exactly that, via flex-1). `min-h-0`: without
    // it this box's default minimum height is its content's — i.e. the
    // header's height PLUS the full, unclipped list — which would push the
    // shell past its cap instead of letting the list region below shrink.
    <div className="flex h-full min-h-0 flex-col">
      {/* Non-scrolling header: its own background + padding, so nothing can
          ever be seen sliding past ABOVE it — there is no shared padded
          ancestor left for a gap to hide in (that was the `sticky` bug). */}
      <div className="flex flex-col gap-4 bg-surface px-6 pb-4 pt-6">
        <div className="flex items-center justify-between gap-2">
          <h2 id={titleId} className="text-title font-bold text-text">
            검토
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

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={blockingCount > 0 ? 'danger' : 'neutral'} label={`차단 ${blockingCount}건`} />
          <Badge tone={warningCount > 0 ? 'warning' : 'neutral'} label={`경고 ${warningCount}건`} />
        </div>
      </div>

      {/* The ONLY scrolling region. `flex-1` claims whatever height the fixed
          header above didn't use; `min-h-0` is what actually lets it be
          smaller than its content (the list) instead of forcing this box to
          grow past the header + full list, which is the failure mode
          `overflow-y-auto` alone does not prevent. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-6">
        {/* The last dry-run didn't answer. The list below is the previous result,
            kept on purpose — saying so is more honest than blanking it (AC-1). */}
        {delayed && (
          <p className="rounded-card border border-border bg-surface-sunken px-3 py-2 text-caption text-text-muted">
            검증 지연 · 마지막으로 확인한 결과를 보여 주고 있습니다
          </p>
        )}

        {ordered.length === 0 ? (
          <p className="rounded-card border border-border bg-surface-sunken px-3 py-6 text-center text-label text-text-muted">
            {/* Counts without a list means the first dry-run of this week hasn't
                answered yet: the counts come from the week payload, the details
                only from the dry-run. Saying "항목이 없습니다" there would contradict
                the badge right above it. */}
            {blockingCount + warningCount > 0
              ? '검토 항목을 불러오는 중입니다'
              : '지금은 검토할 항목이 없습니다'}
          </p>
        ) : (
          <>
            <p className="text-caption text-text-muted">
              항목을 선택하면 해당 블록으로 이동합니다
            </p>
            <ul className="flex flex-col gap-2">
              {ordered.map((issue) => (
                <IssueRow key={issue.id} issue={issue} onSelect={onSelectIssue} />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

export function ReviewPanel({
  open,
  blockingCount = 0,
  warningCount = 0,
  issues = [],
  delayed = false,
  onSelectIssue,
  onClose,
}) {
  const isDesktop = useIsDesktop()
  const titleId = useId()
  const closeRef = useRef(null)

  if (!open) return null

  const body = (
    <PanelBody
      titleId={titleId}
      closeRef={closeRef}
      blockingCount={blockingCount}
      warningCount={warningCount}
      issues={issues}
      delayed={delayed}
      onSelectIssue={onSelectIssue}
      onClose={onClose}
    />
  )

  if (isDesktop) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        labelledById={titleId}
        initialFocusRef={closeRef}
        size="lg"
        scrollBody={false}
      >
        {body}
      </Dialog>
    )
  }
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      labelledById={titleId}
      initialFocusRef={closeRef}
      scrollBody={false}
    >
      {body}
    </BottomSheet>
  )
}

export default ReviewPanel
