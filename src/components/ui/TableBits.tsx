import type { CSSProperties } from 'react'

interface BitProps {
  className?: string
  /** Rotation of the whole doodle. */
  rotate?: string
}

const bitStyle = (rotate?: string) =>
  ({ rotate: rotate ?? '0deg' }) as CSSProperties

/**
 * The stuff lying around on the table — small ink doodles, purely decorative.
 * Position them absolutely inside a relative container; they never take
 * pointer events and are hidden from screen readers.
 */
export function CoffeeRing({ className = '', rotate }: BitProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 120 120"
      className={`pointer-events-none absolute ${className}`.trim()}
      style={bitStyle(rotate)}
    >
      <ellipse
        cx="60"
        cy="60"
        rx="52"
        ry="48"
        fill="none"
        stroke="rgba(151,103,94,0.14)"
        strokeWidth="7"
        strokeDasharray="150 12 60 8"
        strokeLinecap="round"
      />
      <ellipse
        cx="60"
        cy="60"
        rx="43"
        ry="40"
        fill="none"
        stroke="rgba(151,103,94,0.08)"
        strokeWidth="3"
      />
    </svg>
  )
}

export function Pencil({ className = '', rotate }: BitProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 140 16"
      className={`pointer-events-none absolute ${className}`.trim()}
      style={bitStyle(rotate)}
    >
      <rect x="18" y="3" width="104" height="10" rx="1.5" fill="#e8c99a" />
      <rect x="18" y="3" width="104" height="3.4" rx="1.5" fill="#dab77f" />
      {/* Tip */}
      <path d="M18 3 L4 8 L18 13 Z" fill="#f0e3cf" />
      <path d="M9.5 6 L4 8 L9.5 10 Z" fill="#4a423e" />
      {/* Eraser */}
      <rect x="122" y="3" width="6" height="10" rx="1" fill="#b9b0a8" />
      <rect x="128" y="3.5" width="9" height="9" rx="2.5" fill="#d8a7a0" />
    </svg>
  )
}

export function ZipTie({ className = '', rotate }: BitProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 90 70"
      className={`pointer-events-none absolute ${className}`.trim()}
      style={bitStyle(rotate)}
    >
      <path
        d="M22 60 C-6 44 8 8 38 12 C64 15 78 32 70 46 C64 57 44 58 36 47"
        fill="none"
        stroke="rgba(42,36,34,0.28)"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <rect
        x="30"
        y="42"
        width="12"
        height="9"
        rx="1.5"
        fill="rgba(42,36,34,0.32)"
      />
    </svg>
  )
}

export function Screw({ className = '', rotate }: BitProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`pointer-events-none absolute ${className}`.trim()}
      style={bitStyle(rotate)}
    >
      <circle
        cx="12"
        cy="12"
        r="8.5"
        fill="rgba(42,36,34,0.1)"
        stroke="rgba(42,36,34,0.3)"
        strokeWidth="1.4"
      />
      <path
        d="M6.5 12h11M12 6.5v11"
        stroke="rgba(42,36,34,0.32)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}
