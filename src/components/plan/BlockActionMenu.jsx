import { useEffect } from 'react'
import { BottomSheet } from '../common/BottomSheet'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import { getPopoverAnchorStyle } from '../../utils/popoverPosition'

/*
  Block action menu (PLAN-09 — "메뉴 진입"). This story delivers the SHELL: the
  menu opens from a right-click (desktop popover at the cursor) or from the block's
  menu affordance (mobile action sheet, §0.3), and closes on Esc / outside click.

  The menu ITEMS (edit, complete, unplace, delete, …) are PLAN-08/10–18 = ST-F1-04,
  so `items` is a seam: when empty, an explanatory placeholder renders so the entry
  point is verifiable now without inventing next-story behavior.
*/
function MenuList({ block, items, onClose }) {
  return (
    <div className="min-w-56 py-1">
      <p className="truncate px-3 py-2 text-caption font-medium text-text-muted">
        {block?.title}
      </p>
      <div className="h-px bg-border" />
      {items.length === 0 ? (
        <p className="px-3 py-3 text-caption text-text-muted">
          블록 동작 메뉴는 이후 단계에서 추가됩니다
        </p>
      ) : (
        <ul>
          {items.map((it) => (
            <li key={it.key}>
              <button
                type="button"
                onClick={() => {
                  it.onSelect?.()
                  onClose()
                }}
                className={[
                  'flex w-full items-center px-3 py-2.5 text-left text-label transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none',
                  it.tone === 'danger' ? 'text-danger-600' : 'text-text',
                ].join(' ')}
              >
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function BlockActionMenu({ open, block, position, items = [], onClose }) {
  const isDesktop = useIsDesktop()

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  if (isDesktop) {
    // Anchor the popover at the cursor, flipping to grow toward the cursor
    // (via bottom/right) instead of away from it when the cursor is in the
    // lower/right half of the viewport. This keeps the menu fully on-screen
    // regardless of how many items it renders — see popoverPosition.js.
    const anchorStyle = getPopoverAnchorStyle(position)
    return (
      <>
        {/* Full-screen backdrop closes on outside click without dimming. */}
        <div className="fixed inset-0 z-40" onPointerDown={onClose} aria-hidden="true" />
        <div
          role="menu"
          aria-label={`${block?.title ?? ''} 동작`}
          style={anchorStyle}
          className="fixed z-50 max-h-[70vh] overflow-y-auto rounded-card border border-border bg-surface shadow-popover"
        >
          <MenuList block={block} items={items} onClose={onClose} />
        </div>
      </>
    )
  }

  return (
    <BottomSheet open={open} onClose={onClose} labelledById={undefined}>
      <MenuList block={block} items={items} onClose={onClose} />
    </BottomSheet>
  )
}

export default BlockActionMenu
