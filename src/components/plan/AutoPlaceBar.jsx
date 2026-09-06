import { useId, useState } from 'react'
import { Button } from '../common/Button'

/*
  Top bar shown while an auto-placement DRAFT is on the grid (ST-F1-03 RB-PLAN-01,
  AC-2). The draft blocks render dashed with a "초안" mark; this bar is the only
  way to resolve them: [적용] commits the batch, [취소] discards it.

  The caption states two things in plain words, EACH its own line (fix I — the
  owner specified this exact two-sentence, two-line copy verbatim and asked
  that it render as exactly two lines, never merged onto one or wrapped into a
  third): the C-2 double protection (applying the draft still does not save the
  week — the weekly confirm (ST-F1-05) is separate) and, since plan-polish fix
  G, that every OTHER block is locked while this is open — dragging/resizing/
  nudging a different block, or moving/deleting/unplacing one via its menu,
  would change the very block set the draft's placements were computed against,
  so [적용] could commit a batch that no longer matches what's on screen. This
  is the ONLY place that states that lock proactively (the locked blocks
  themselves just go non-draggable — see WeeklyPage's planLocked and
  PlanBlock's moveLocked — with no per-attempt toast, since nothing here is a
  drag that visibly STARTS then gets rejected; it simply never starts, so
  there's nothing to explain in the moment). Counts are text (배치 N · 미배치
  M), never color-only (NFR-017).

  Always stacked (no `sm:flex-row` anymore, fix I): this only ever renders
  inside WeeklyPage's fixed-width floating banner (bottom-left, capped at
  `md:max-w-sm` to clear the unplaced panel on the right — see that render
  comment), never at some ambient container width the OLD viewport-based
  `sm:` breakpoint could reason about. A row layout there would squeeze the
  caption into a column shared with the button pair, which is exactly what
  broke fix I's one-sentence-per-line requirement (the longer sentence needs
  ~350px+ and a shared row leaves nowhere near that). Stacking gives the
  caption close to the banner's FULL width instead.

  COLLAPSE (owner report, W6 — on a narrow mobile viewport this banner's two
  caption lines + button row push its total height tall enough to hide the
  dashed draft blocks it is supposed to be describing, right underneath it).
  A header row (counts + toggle) always stays visible so [적용]/[취소] are
  never more than one tap away; collapsing only hides the caption lines and
  the button row, giving the grid its space back without losing the draft
  (still open, just not being decided on this instant). Defaults to expanded
  — this must not change what a desktop user already sees today.
*/
export function AutoPlaceBar({ placedCount, unplacedCount, applying = false, onApply, onCancel }) {
  const [expanded, setExpanded] = useState(true)
  const panelId = useId()

  return (
    <div
      role="region"
      aria-label="자동 배치 초안"
      // fix J-4 (owner decision): a slightly tinted background + a backdrop
      // blur, to read as a floating panel the way the unplaced panel does.
      // `backdrop-blur-md` is that panel's own value. Opacity is `/50` (owner
      // set it to ~50%, lighter than the panel's /78) — `--color-brand-50` is
      // a plain literal (`#eff6ff`, index.css), so the Tailwind `/50` modifier
      // alone resolves fine here. Kept well under 100% so the blur actually
      // reads as blur (the back content shows through), not a flat fill.
      className="flex flex-col gap-2 rounded-card border border-dashed border-brand-300 bg-brand-50/50 p-3 backdrop-blur-md"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-label font-semibold text-brand-900">
          자동 배치 초안 · 배치 {placedCount}건{unplacedCount > 0 ? ` · 미배치 ${unplacedCount}건` : ''}
        </p>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-label={expanded ? '자동 배치 초안 내용 접기' : '자동 배치 초안 내용 펼치기'}
          onClick={() => setExpanded((v) => !v)}
          // 44px touch target (NFR-017) even though the glyph itself is tiny —
          // padding does the work, not the icon size.
          className="-m-2.5 shrink-0 rounded-control p-2.5 text-brand-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <ChevronIcon expanded={expanded} />
        </button>
      </div>
      {expanded && (
        <div id={panelId} className="flex flex-col gap-2">
          <div>
            {/* Two separate lines, not one wrapped paragraph. `md:whitespace-nowrap`
                keeps each sentence from breaking mid-line ON DESKTOP, where the
                banner (WeeklyPage) is sized to fit the longer one without
                wrapping (see that render comment for the exact math and its
                narrowest verified width). Mobile is left at the DEFAULT wrap
                (no `whitespace-nowrap` below `md:`) on purpose: forcing nowrap
                there too, with nothing capping the banner's own width, risks the
                text overflowing past the fixed-position box — which can widen
                the PAGE's own scrollable area on some phones, a worse bug than a
                caption occasionally running to a 3rd line on the narrowest ones
                (see WeeklyPage's render comment for the computed floor). */}
            <p className="whitespace-normal text-caption text-text-muted md:whitespace-nowrap">
              초안입니다. 적용해도 주간 계획은 아직 저장되지 않습니다.
            </p>
            <p className="whitespace-normal text-caption text-text-muted md:whitespace-nowrap">
              검토 중에는 다른 블록을 수정할 수 없습니다.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onCancel} disabled={applying}>
              취소
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={onApply}
              loading={applying}
              disabled={placedCount === 0}
            >
              적용
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// Local (same convention as TimeSelect's own chevron — no shared arrow icon
// in the inventory points down/up, only left/right). Rotates via CSS instead
// of swapping paths so `prefers-reduced-motion` callers still see the
// correct final orientation with no separate no-motion variant needed.
function ChevronIcon({ expanded }) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export default AutoPlaceBar
