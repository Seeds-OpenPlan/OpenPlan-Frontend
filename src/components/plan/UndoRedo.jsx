import { UndoIcon, RedoIcon } from './planIcons'

/*
  Undo/redo controls (PLAN-30/31), bottom-left of the grid. Disabled state comes
  straight from the client history stacks; both are real buttons with explicit
  labels so the action is keyboard/SR reachable and never conveyed by icon alone.
*/
function RoundButton({ onClick, disabled, label, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-text shadow-card transition-colors hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      {children}
    </button>
  )
}

export function UndoRedo({ canUndo, canRedo, onUndo, onRedo }) {
  return (
    <div className="flex items-center gap-2">
      <RoundButton onClick={onUndo} disabled={!canUndo} label="되돌리기">
        <UndoIcon className="text-lg" />
      </RoundButton>
      <RoundButton onClick={onRedo} disabled={!canRedo} label="다시하기">
        <RedoIcon className="text-lg" />
      </RoundButton>
    </div>
  )
}

export default UndoRedo
