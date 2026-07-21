import { useReducedMotion } from '../../hooks/useReducedMotion'

/*
  Skeleton primitive + the six composed presets (components.md §4, ui-spec §4.1).
  Presets mirror the real content's grid and spacing so that when data arrives
  there is ZERO layout shift (SYS-03 AC-3, CLS budget).

  Motion: a left→right shimmer by default. When the user prefers reduced motion,
  a JS branch (useReducedMotion) swaps to a static neutral fill, because CSS
  duration:0 alone can leave a visible flash on some engines (tokens.md §6).

  Accessibility note: individual bars are decorative and aria-hidden. The
  aria-busy container + one-time aria-live announcement live in LoadingSkeleton,
  not here, to avoid a narration storm across many bars (components.md §4).
*/

export function Skeleton({ width, height = '1rem', radius = 'var(--radius-chip)', className = '' }) {
  const reduced = useReducedMotion()

  const style = { width, height, borderRadius: radius }

  // Shimmer uses a moving gradient; the static branch is a flat neutral fill.
  const motionClass = reduced
    ? 'bg-neutral-200'
    : 'bg-[linear-gradient(90deg,var(--color-neutral-200)_25%,var(--color-neutral-100)_37%,var(--color-neutral-200)_63%)] bg-[length:200%_100%] animate-[skeleton-shimmer_var(--duration-slow)_ease-in-out_infinite]'

  return (
    <span
      aria-hidden="true"
      className={`block ${motionClass} ${className}`}
      style={style}
    />
  )
}

// 1..n text lines; the last line is shorter to read as natural text.
export function SkeletonText({ lines = 3, className = '' }) {
  return (
    <span className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '60%' : '100%'} height="0.75rem" />
      ))}
    </span>
  )
}

export function SkeletonCard({ className = '' }) {
  return (
    <span className={`block rounded-card border border-border p-4 ${className}`}>
      <Skeleton width="40%" height="1rem" className="mb-3" />
      <SkeletonText lines={3} />
    </span>
  )
}

export function SkeletonStatCard({ className = '' }) {
  return (
    <span className={`block rounded-card border border-border p-4 ${className}`}>
      <Skeleton width="30%" height="0.75rem" className="mb-2" />
      <Skeleton width="55%" height="1.5rem" className="mb-3" />
      <Skeleton width="100%" height="0.5rem" radius="var(--radius-full)" />
    </span>
  )
}

export function SkeletonListRow({ count = 3, className = '' }) {
  return (
    <span className={`flex flex-col gap-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className="flex items-center gap-3">
          <Skeleton width="2.5rem" height="2.5rem" radius="var(--radius-full)" />
          <span className="flex flex-1 flex-col gap-2">
            <Skeleton width="70%" height="0.75rem" />
            <Skeleton width="40%" height="0.75rem" />
          </span>
        </span>
      ))}
    </span>
  )
}

export function SkeletonAvatar({ size = '2.5rem', className = '' }) {
  return <Skeleton width={size} height={size} radius="var(--radius-full)" className={className} />
}

// Free-size block for later compositions (e.g. the weekly calendar grid).
export function SkeletonBlock({ width = '100%', height = '4rem', className = '' }) {
  return <Skeleton width={width} height={height} radius="var(--radius-card)" className={className} />
}

export default Skeleton
