/*
  Single source for the VISUAL styling of a violated block (border color, chip
  color, and the diagonal-hatch background stripe), so every surface that shows
  a violation on a block reads identically. Copy of these strings used to live
  privately in PlanBlock.jsx; the task-edit preview (TaskEditPreview.jsx) needs
  the exact same look, and the owner explicitly asked that "차단/경고 모양"
  match the weekly plan — single-sourcing them here guarantees they can't drift.

  This is the styling companion to violationMessages.js (which single-sources
  the COPY). Keep the two separate: text catalog there, visual tokens here.
*/

// Border color by severity — applied to the block's own border.
export const VIOLATION_BORDER_CLASSES = {
  blocking: 'border-danger-500',
  warning: 'border-warning-500',
}

// The small "차단/경고" chip on the block.
export const VIOLATION_CHIP_CLASSES = {
  blocking: 'bg-danger-600 text-white',
  warning: 'bg-warning-600 text-white',
}

// Blocking = tight, high-contrast hatch; warning = wider, softer hatch. The two
// patterns are distinguishable in greyscale (not color-only — NFR-017).
export const VIOLATION_STRIPES = {
  blocking:
    'repeating-linear-gradient(45deg, color-mix(in srgb, var(--color-danger-600) 20%, transparent) 0, color-mix(in srgb, var(--color-danger-600) 20%, transparent) 4px, transparent 4px, transparent 9px)',
  warning:
    'repeating-linear-gradient(45deg, color-mix(in srgb, var(--color-warning-600) 18%, transparent) 0, color-mix(in srgb, var(--color-warning-600) 18%, transparent) 3px, transparent 3px, transparent 14px)',
}
