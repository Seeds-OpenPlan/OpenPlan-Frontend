/*
  Inline SVG render of OpenPlan's confirmed app icon (brand blue square + a
  single white ring, centered) — same design the owner locked in for the Play
  Store listing and PWA manifest (see `scripts/generate-icons.mjs`, which
  rasterizes the same ratios to PNG for the installed-app icons). This
  component exists so the SAME mark can also appear inline in the web UI
  (auth shell, top bar) without shipping an extra image request.

  History: an earlier "ring + check" design (openplan-icon.svg) was replaced
  by owner decision 2026-10-13 — the ring-only placeholder already live on
  #65 read better, and the check's off-center stroke made the earlier mark
  look misaligned. The ring-only ratios below are lifted from that #65
  placeholder (generate-icons.mjs's `RING_OUTER_RATIO`/`RING_INNER_RATIO`),
  not reinvented, so the two scripts stay in lockstep — any future shape
  change must update both files together (see that script's own header
  comment for the full fan-out list, including the Play Store AAB re-upload
  requirement).

  Corner radius: the master SVG is a plain full-bleed square (that's correct
  for maskable/OS-masked icon slots, where the OS itself clips the shape).
  Inline in our own UI there's no OS mask, so a hard square would look like a
  mis-cropped image next to our rounded-card/rounded-control surfaces. We round
  it here with `rx` (not a wrapping div + overflow-hidden) so the radius scales
  automatically with every call site's `size` instead of needing a second CSS
  value kept in sync — and reuse the exact 0.18 ratio generate-icons.mjs already
  uses for the "any"-purpose PNG, so the inline mark and the installed-app icon
  read as the same rounded-badge shape.

  Colors are intentionally NOT tokenized via Tailwind `fill-*` classes: this
  badge must render identically regardless of surrounding theme (including the
  reserved-but-inert `.dark` overrides in index.css) because it's a fixed brand
  mark, not themed chrome — a light badge would disappear on a future dark
  surface, so the blue fill + white stroke are hardcoded on purpose. They
  still reference the brand CSS variable (not a raw literal) so a brand color
  change only has one source of truth.
*/

// 512 viewBox, ratios matching generate-icons.mjs exactly (RING_OUTER_RATIO /
// RING_INNER_RATIO there) so the inline mark and the rasterized PNG icons are
// the same shape at any size. Center radius / stroke width are derived, not
// hand-picked, so the two never drift apart: outer=512*0.33=168.96,
// inner=512*0.18=92.16 → center=(168.96+92.16)/2=130.56, width=168.96-92.16=76.8.
const VIEWBOX_SIZE = 512
const CORNER_RADIUS = VIEWBOX_SIZE * 0.18 // same ratio as generate-icons.mjs's non-fullBleed cornerRadius
const RING_OUTER_RADIUS = VIEWBOX_SIZE * 0.33
const RING_INNER_RADIUS = VIEWBOX_SIZE * 0.18
const RING_CENTER_RADIUS = (RING_OUTER_RADIUS + RING_INNER_RADIUS) / 2
const RING_STROKE_WIDTH = RING_OUTER_RADIUS - RING_INNER_RADIUS

/**
 * @param {number} [size] - rendered width/height in px (viewBox scales to fit).
 * @param {string} [className]
 * @param {string} [label] - when given, the icon is the ONLY content conveying
 *   meaning at that spot, so it renders `role="img"` + `aria-label` instead of
 *   `aria-hidden`. Every current call site pairs this icon with visible
 *   "OpenPlan" text, so callers should normally leave this unset.
 */
export function AppIcon({ size = 24, className = '', label }) {
  const isDecorative = !label

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
      className={className}
      role={isDecorative ? undefined : 'img'}
      aria-hidden={isDecorative ? 'true' : undefined}
      aria-label={isDecorative ? undefined : label}
    >
      <rect
        width={VIEWBOX_SIZE}
        height={VIEWBOX_SIZE}
        rx={CORNER_RADIUS}
        fill="var(--color-brand-600)"
      />
      <circle
        cx={VIEWBOX_SIZE / 2}
        cy={VIEWBOX_SIZE / 2}
        r={RING_CENTER_RADIUS}
        fill="none"
        stroke="#fff"
        strokeWidth={RING_STROKE_WIDTH}
      />
    </svg>
  )
}

export default AppIcon
