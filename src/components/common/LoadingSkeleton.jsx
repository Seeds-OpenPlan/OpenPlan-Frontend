import {
  SkeletonText,
  SkeletonCard,
  SkeletonStatCard,
  SkeletonListRow,
  SkeletonAvatar,
  SkeletonBlock,
} from './Skeleton'

/*
  PTN-LOADING query-wait surface (ui-spec §4.1). Provides the accessible
  container the raw Skeleton bars deliberately omit: aria-busy="true" while
  loading and a single aria-live="polite" region, so screen readers announce
  "불러왔습니다" ONCE when content arrives — not once per skeleton bar
  (components.md §4). No full-screen spinner is ever used (SYS-03 AC-1, R3).

  Pass a `preset` for the common shapes, or `children` for a custom skeleton
  composition that mirrors the real layout (zero layout shift, SYS-03 AC-3).
*/

const PRESETS = {
  text: SkeletonText,
  card: SkeletonCard,
  statCard: SkeletonStatCard,
  listRow: SkeletonListRow,
  avatar: SkeletonAvatar,
  block: SkeletonBlock,
}

export function LoadingSkeleton({ preset = 'text', className = '', children, ...presetProps }) {
  const Preset = PRESETS[preset] ?? SkeletonText

  return (
    <div aria-busy="true" aria-live="polite" className={className}>
      {/* Visually-hidden label; the aria-live region announces once on unmount
          swap when the consumer replaces this with real content. */}
      <span className="sr-only">불러오는 중</span>
      {children ?? <Preset {...presetProps} />}
    </div>
  )
}

export default LoadingSkeleton
