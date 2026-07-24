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

/*
  Task-status copy (ST-F1-09 addition) — mirrors the project-status catalog
  above, same "one catalog, many consumers" reasoning. Previously TaskRow.jsx
  spelled these out in its own local STATUS_BADGE map; centralized here now
  that a SECOND consumer (TaskEditPage's 상태 field, SCR-TASK-EDIT) needs the
  identical label set — a status word should not have two places to drift
  apart. ERD tasks.status: UNASSIGNED / IN_PROGRESS / COMPLETED.
*/
export const TASK_STATUS_LABELS = {
  UNASSIGNED: '미배치',
  IN_PROGRESS: '배치됨',
  COMPLETED: '완료',
}

// Badge tone per status — same tones TaskRow.jsx's original STATUS_BADGE used
// (danger = nothing placed yet, brand = placed, success = done).
export const TASK_STATUS_BADGE_TONE = {
  UNASSIGNED: 'danger',
  IN_PROGRESS: 'brand',
  COMPLETED: 'success',
}

// Ordered for TaskEditPage's 상태 radio group.
export const TASK_STATUS_OPTIONS = [
  { value: 'UNASSIGNED', label: TASK_STATUS_LABELS.UNASSIGNED },
  { value: 'IN_PROGRESS', label: TASK_STATUS_LABELS.IN_PROGRESS },
  { value: 'COMPLETED', label: TASK_STATUS_LABELS.COMPLETED },
]

export default PROJECT_STATUS_LABELS
