/*
  Inline SVG status icons for the common-state surfaces. Follows the existing
  layout/icons.jsx convention: no icon package, currentColor stroke, aria-hidden
  (the meaning is always carried by adjacent text, never the icon alone — R5 /
  NFR-017). Emoji status icons are forbidden (ui-spec §0.2).
*/

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
}

// SCR-404 — compass/search: "you are looking for something that isn't here".
export function NotFoundIcon({ className, size = 24 }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

// SCR-403 — lock: access denied (visually distinct from 404, story §2 requires it).
export function LockIcon({ className, size = 24 }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

// PTN-ERROR — warning triangle.
export function AlertTriangleIcon({ className, size = 24 }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  )
}

// PTN-OFFLINE — wifi with a slash.
export function WifiOffIcon({ className, size = 24 }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path d="M2 2l20 20" />
      <path d="M8.5 16.4a5 5 0 0 1 7 0" />
      <path d="M5 12.9a10 10 0 0 1 3.4-2.2M19 12.9a10 10 0 0 0-4.8-2.7" />
      <path d="M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8a15 15 0 0 0-9.6-3.6" />
      <path d="M12 20h.01" />
    </svg>
  )
}

// Recovery toast — check in a circle.
export function CheckCircleIcon({ className, size = 24 }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </svg>
  )
}

// Button inline-loading spinner. Marked aria-hidden; the label text ("처리 중")
// carries the state, and the button sets aria-busy (color/motion is secondary).
export function SpinnerIcon({ className, size = 16 }) {
  return (
    <svg
      {...base}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
    >
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  )
}
