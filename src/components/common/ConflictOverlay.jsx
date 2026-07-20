import { useId, useRef, useState } from 'react'
import { Dialog } from './Dialog'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import { Badge } from './Badge'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import { systemMessages } from '../../constants/systemMessages'

/*
  OVL-CONFLICT (ui-spec §6). Opened by a save mutation's onError when
  error.code === 'E-COM-006' (or E-PLAN-004). Data comes ONLY from the response's
  details.latest — never a re-fetch (AC-3, avoids a fresh race). This cycle has
  no real save screen; this fixes the contract ST-F1-02/05/06/09 will reuse.

  Exactly three choices, fixed order (AC-2):
    ① 최신 데이터 수용  → onAccept (replace draft with latest, drop my changes)
    ② 내 변경 재시도   → onRetry  (adopt latest version, user re-saves manually)
    ③ 비교            → inline field-by-field diff (no merge UI — Non-goal)

  Cannot be dismissed by Esc or backdrop — a choice is the only forward path
  (AC-4). Rendered as a centered Dialog on desktop, a BottomSheet on mobile
  (§0.3). Both omit onClose so neither offers a dismiss affordance.
*/
const m = systemMessages.conflict

function formatSavedAt(latest) {
  const raw = latest?.updatedAt
  if (!raw) return null
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return String(raw)
  // Locale-formatted timestamp; no assumption about server format beyond parseable.
  return d.toLocaleString('ko-KR')
}

// Best-effort field diff between my draft and the latest representation. Shapes
// are contract-dependent (details.latest form is not yet confirmed, story §9.1-B),
// so this renders a generic key/value comparison rather than a domain-specific view.
function buildDiff(current, latest) {
  if (!latest || typeof latest !== 'object') return []
  const keys = new Set([...Object.keys(current ?? {}), ...Object.keys(latest)])
  return Array.from(keys)
    .filter((k) => k !== 'updatedAt')
    .map((key) => {
      const mine = current?.[key]
      const theirs = latest[key]
      const changed = JSON.stringify(mine) !== JSON.stringify(theirs)
      return { key, mine, theirs, changed }
    })
}

function OverlayBody({ latest, current, onAccept, onRetry, titleId, firstActionRef }) {
  const [showDiff, setShowDiff] = useState(false)
  const savedAt = formatSavedAt(latest)
  const diff = showDiff ? buildDiff(current, latest) : []

  const options = [
    {
      key: 'accept',
      ...m.options.accept,
      onClick: onAccept,
      ref: firstActionRef,
      variant: 'primary',
    },
    { key: 'retry', ...m.options.retry, onClick: onRetry, variant: 'secondary' },
    {
      key: 'compare',
      ...m.options.compare,
      onClick: () => setShowDiff((v) => !v),
      variant: 'secondary',
      expandable: true,
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 id={titleId} className="text-title font-bold text-text">
          {m.title}
        </h2>
        <p className="mt-2 max-w-[42ch] text-body text-text-muted">{m.body}</p>
      </div>

      {savedAt && (
        <div className="rounded-card border border-border bg-surface-sunken px-3 py-2">
          <p className="text-caption text-text-muted">{m.latestInfoLabel}</p>
          <p className="text-label text-text">
            {savedAt} {m.savedSuffix}
          </p>
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {options.map((opt) => (
          <li key={opt.key} className="rounded-card border border-border p-3">
            <p className="text-label font-medium text-text">{opt.title}</p>
            <p className="mt-1 text-caption text-text-muted">{opt.body}</p>
            <div className="mt-3">
              <Button
                ref={opt.ref}
                variant={opt.variant}
                size="md"
                onClick={opt.onClick}
                aria-expanded={opt.expandable ? showDiff : undefined}
              >
                {opt.action}
              </Button>
            </div>

            {/* Compare expands an inline field diff (no route change, no merge UI). */}
            {opt.expandable && showDiff && (
              <ul className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                {diff.length === 0 && (
                  <li className="text-caption text-text-muted">비교할 항목이 없습니다.</li>
                )}
                {diff.map((row) => (
                  <li key={row.key} className="flex items-center justify-between gap-2 text-caption">
                    <span className="font-medium text-text">{row.key}</span>
                    {row.changed ? (
                      <Badge tone="warning" label="변경됨" />
                    ) : (
                      <Badge tone="neutral" label="동일" />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ConflictOverlay({ open, latest, current, onAccept, onRetry, returnFocusRef }) {
  const isDesktop = useIsDesktop()
  const titleId = useId()
  const firstActionRef = useRef(null)

  const body = (
    <OverlayBody
      latest={latest}
      current={current}
      onAccept={onAccept}
      onRetry={onRetry}
      titleId={titleId}
      firstActionRef={firstActionRef}
    />
  )

  // No onClose on either shell → no Esc / backdrop dismissal (AC-4).
  if (isDesktop) {
    return (
      <Dialog
        open={open}
        labelledById={titleId}
        initialFocusRef={firstActionRef}
        returnFocusRef={returnFocusRef}
        size="lg"
      >
        {body}
      </Dialog>
    )
  }

  return (
    <BottomSheet
      open={open}
      labelledById={titleId}
      initialFocusRef={firstActionRef}
      returnFocusRef={returnFocusRef}
    >
      {body}
    </BottomSheet>
  )
}

export default ConflictOverlay
