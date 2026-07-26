/*
  Generic single-open accordion row shell — extracted from
  components/project/ProjectAccordionRow.jsx (the project-accordion
  restructure's own pattern) so ST-F1-15's 내 문의/공지 lists can reuse the
  EXACT same toggle mechanics instead of re-deriving them (owner feedback
  #10/#11: "프로젝트 아코디언 패턴 재사용/추출").

  Caller owns the actual "which row is open" STATE (a single value, not a
  per-row boolean set — same single-open contract ProjectsPage's own
  `expanded` follows) and hands down `expanded`/`onToggle`; this component
  only renders the shell: an invisible full-cover toggle button UNDER the
  header content (z-0), the header/summary in normal flow (naturally stacked
  above it by DOM order — see the z-layering note below), and the panel
  itself only in the DOM while `expanded` (so `aria-controls` never points at
  an id that doesn't exist).

  Z-LAYERING: `header`/`summary` must NOT set their own `position`/`z-index`
  unless they need to float ABOVE the toggle for independent clickability
  (e.g. per-row action buttons) — ProjectAccordionRow's own badges/actions row
  does this itself (`relative z-10`) before rendering its content through
  `header`; this shell does not force that on every caller, since a plain
  read-only row (no nested interactive controls) needs none of it.
*/
export function AccordionRow({ expanded, onToggle, ariaLabel, panelId, header, summary, panel }) {
  return (
    <li className="rounded-card border border-border bg-surface shadow-card">
      <div className="relative p-4">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={expanded ? panelId : undefined}
          aria-label={ariaLabel}
          onClick={onToggle}
          className="absolute inset-0 z-0 rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">{header}</div>
        {/* No imposed margin here — callers differ on whether the summary
            needs top spacing at all (ProjectAccordionRow's OWN content
            supplies its own mt-2/mt-3 per element; a caller with nothing to
            add just passes plain content). Forcing a margin on this wrapper
            would double up with whatever the caller's own first child
            already carries. */}
        {summary && <div className="relative">{summary}</div>}
      </div>

      {expanded && (
        <div id={panelId} className="border-t border-border p-4 pt-3">
          {panel}
        </div>
      )}
    </li>
  )
}

export default AccordionRow
