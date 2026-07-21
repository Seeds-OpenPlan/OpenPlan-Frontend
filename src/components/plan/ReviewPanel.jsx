import { useId, useRef } from 'react'
import { Dialog } from '../common/Dialog'
import { BottomSheet } from '../common/BottomSheet'
import { Badge } from '../common/Badge'
import { useIsDesktop } from '../../hooks/useMediaQuery'

/*
  PNL-REVIEW shell (opened by the "검토 N" entry, PLAN-22 surface). This story
  provides the panel container + the block/warning count summary so the entry
  point is functional; the per-issue list with click-to-focus (PLAN-23) and the
  violation copy catalog are ST-F1-05, so `issues` is a seam that renders an
  empty state until then.

  Desktop = centered Dialog, mobile = BottomSheet (§0.3), matching OVL-CONFLICT.
*/
function PanelBody({ titleId, blockCount, warningCount, issues, onClose }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id={titleId} className="text-title font-bold text-text">
          검토
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="rounded-control px-2 py-1 text-label text-text-muted hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          닫기
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge tone={blockCount > 0 ? 'danger' : 'neutral'} label={`차단 ${blockCount}건`} />
        <Badge tone={warningCount > 0 ? 'warning' : 'neutral'} label={`경고 ${warningCount}건`} />
      </div>

      {issues.length === 0 ? (
        <p className="rounded-card border border-border bg-surface-sunken px-3 py-6 text-center text-label text-text-muted">
          표시할 상세 검토 항목이 아직 없습니다
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {issues.map((it) => (
            <li key={it.id} className="rounded-card border border-border p-3 text-label text-text">
              {it.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function ReviewPanel({ open, blockCount = 0, warningCount = 0, issues = [], onClose }) {
  const isDesktop = useIsDesktop()
  const titleId = useId()
  const closeRef = useRef(null)

  if (!open) return null

  const body = (
    <PanelBody
      titleId={titleId}
      blockCount={blockCount}
      warningCount={warningCount}
      issues={issues}
      onClose={onClose}
    />
  )

  if (isDesktop) {
    return (
      <Dialog open={open} onClose={onClose} labelledById={titleId} initialFocusRef={closeRef} size="lg">
        {body}
      </Dialog>
    )
  }
  return (
    <BottomSheet open={open} onClose={onClose} labelledById={titleId} initialFocusRef={closeRef}>
      {body}
    </BottomSheet>
  )
}

export default ReviewPanel
