/*
  Cursor-anchored popover positioning shared by the desktop block-action menu
  (BlockActionMenu) and the empty-slot task picker (WeeklyPage). Both popovers
  open at an arbitrary cursor point that can land anywhere in the viewport,
  including its bottom/right edges — a naive `top/left = cursor` clamp only
  guards against overflowing past a hardcoded assumed menu size, which breaks
  as soon as the menu grows (see ST-F1-04 bug: 5-item block menu got clipped
  at the bottom of the grid).

  Instead of measuring the popover's real size (which would need a layout
  effect + setState-in-effect, disallowed by the React 19 lint rule outside
  callback refs), we flip the anchor edge based on which half of the viewport
  the cursor sits in. Anchoring via `bottom`/`right` instead of `top`/`left`
  makes the popover grow toward the cursor rather than away from it, so it can
  never be pushed past the opposite edge regardless of its actual content size.
  Pair this with a `max-height`/`overflow-y-auto` on the popover as a last-resort
  safety net for extremely tall content.
*/
export function getPopoverAnchorStyle(point, { margin = 8 } = {}) {
  const x = point?.x ?? 0
  const y = point?.y ?? 0
  const style = {}

  // Anchor from the right edge once the cursor passes the horizontal midpoint,
  // so the popover grows leftward and stays clear of the right viewport edge.
  if (x > window.innerWidth / 2) {
    style.right = Math.max(margin, window.innerWidth - x)
  } else {
    style.left = Math.max(margin, x)
  }

  // Same idea vertically: below the midpoint, grow upward from the cursor.
  if (y > window.innerHeight / 2) {
    style.bottom = Math.max(margin, window.innerHeight - y)
  } else {
    style.top = Math.max(margin, y)
  }

  return style
}
