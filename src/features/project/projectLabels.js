/*
  Single catalog for project-status copy (owner review 2026-07-23, A-4). Every
  screen that shows a project's status — the list tabs, the WS header badge,
  the manage-overlay radio group, the reactivate caption — reads from here,
  never spells the Korean label out locally. Same "one catalog, many
  consumers" principle this codebase already applies to
  features/plan/violationMessages.js (copy) and replanStrategies.js (labels) —
  P4/J1: a status word never has more than one place to go wrong.

  ERD (12. 상세 ERD) `projects.status` enum: IN_PROGRESS / PAUSED / CLOSED.
  "PAUSED" reads as "보류" per the owner's explicit terminology call — NOT
  "중지" (ui-spec §PROJ.0.2's own draft text), which the owner rejected live.
*/
export const PROJECT_STATUS_LABELS = {
  IN_PROGRESS: '진행중',
  PAUSED: '보류',
  CLOSED: '종료',
}

// Badge tone per status (ui-spec §PROJ.0.2 table — labels superseded above,
// tones unchanged: brand for the one active state, neutral for both others).
export const PROJECT_STATUS_BADGE_TONE = {
  IN_PROGRESS: 'brand',
  PAUSED: 'neutral',
  CLOSED: 'neutral',
}

// Ordered for the manage-overlay radio group AND the list's tab order.
export const PROJECT_STATUS_OPTIONS = [
  { value: 'IN_PROGRESS', label: PROJECT_STATUS_LABELS.IN_PROGRESS },
  { value: 'PAUSED', label: PROJECT_STATUS_LABELS.PAUSED },
  { value: 'CLOSED', label: PROJECT_STATUS_LABELS.CLOSED },
]

export default PROJECT_STATUS_LABELS
