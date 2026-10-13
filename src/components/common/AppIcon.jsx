/*
  Inline SVG render of OpenPlan's confirmed app icon (brand blue square + white
  ring + white check) — same design the owner locked in for the Play Store
  listing and PWA manifest (see `scripts/generate-icons.mjs`, which rasterizes
  the identical 512x512 coordinates to PNG for the installed-app icons). This
  component exists so the SAME mark can also appear inline in the web UI
  (auth shell, top bar) without shipping an extra image request — it's a
  vector copy of `docs/플레이 출시 작업내용/스토어 그래픽/openplan-icon.svg`,
  not a reinterpretation, so any future redesign must update both files
  together (see that script's own header comment for the full fan-out list).

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
  surface, so the blue fill + white strokes are hardcoded on purpose. They
  still reference the brand CSS variable (not a raw literal) so a brand color
  change only has one source of truth.
*/

// 512 viewBox coordinates, lifted directly from the design-of-record SVG —
// kept as named constants (not inlined below) so a future palette/shape
// change only touches this block, matching generate-icons.mjs's own layout.
const VIEWBOX_SIZE = 512
const CORNER_RADIUS = VIEWBOX_SIZE * 0.18 // same ratio as generate-icons.mjs's non-fullBleed cornerRadius
const RING_CENTER_RADIUS = 148
const RING_STROKE_WIDTH = 44
const CHECK_STROKE_WIDTH = 40
const CHECK_PATH = 'M190 262 L238 310 L324 218'

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
      <path
        d={CHECK_PATH}
        fill="none"
        stroke="#fff"
        strokeWidth={CHECK_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default AppIcon
