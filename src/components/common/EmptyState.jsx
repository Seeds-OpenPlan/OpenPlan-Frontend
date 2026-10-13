import { Button } from './Button'

/*
  EmptyState atom (ui-spec §PROJ.1 목록 empty · §PROJ.9 구조화 초안 empty · shared
  with ui-spec-dash §DASH.6 온보딩 empty). Title + description + up to two
  actions (primary + optional secondary), centered — the shape every "nothing
  here yet, here's how to start" surface in this codebase repeats.

  No decorative icon (owner decision — the generic "empty box" illustration
  every instance showed read as visual clutter, not information, so it was
  dropped app-wide rather than kept as an opt-in prop). `py-8` (down from the
  old icon layout's `py-10`) keeps the card's vertical rhythm proportional
  now that there's one less element stacked in the gap-3 column.

  Not `role="alert"`/`role="status"`: an empty list is a normal, expected state
  (not an error, not a transient announcement), so it renders like ordinary
  page content and lets the surrounding heading/skeleton-replacement flow
  carry focus naturally — same reasoning ErrorState gives for skipping
  role="status" on SCR-403.
*/
export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  // Offline write-disable (§PROJ.1/2.1 오프라인 상태) DISABLES the action with
  // a reason rather than hiding it (Button's own `disabledReason` contract) —
  // the caller keeps passing its real onAction/onSecondaryAction and only
  // sets `disabled`, so the button stays visible and discoverable.
  disabled = false,
  disabledReason,
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface px-4 py-8 text-center">
      <p className="text-body font-medium text-text">{title}</p>
      {description && <p className="max-w-[42ch] text-label text-text-muted">{description}</p>}
      {(onAction || onSecondaryAction) && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {onAction && (
            <Button
              variant="primary"
              size="md"
              onClick={onAction}
              disabled={disabled}
              disabledReason={disabled ? disabledReason : undefined}
            >
              {actionLabel}
            </Button>
          )}
          {onSecondaryAction && (
            <Button
              variant="secondary"
              size="md"
              onClick={onSecondaryAction}
              disabled={disabled}
              disabledReason={disabled ? disabledReason : undefined}
            >
              {secondaryActionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

export default EmptyState
