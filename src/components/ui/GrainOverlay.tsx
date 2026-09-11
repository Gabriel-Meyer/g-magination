import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'

/**
 * Fixed full-screen film-grain overlay built from an SVG turbulence filter.
 * Sits above everything, ignores pointer events, and drifts slowly unless the
 * user prefers reduced motion. Soft-light blend keeps the grain monochrome.
 */
export function GrainOverlay() {
  const reduced = usePrefersReducedMotion()

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 mix-blend-soft-light"
      style={{ opacity: 0.06 }}
    >
      <svg className="h-full w-full">
        <filter id="grain-noise">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
            stitchTiles="stitch"
          >
            {!reduced && (
              <animate
                attributeName="baseFrequency"
                dur="14s"
                values="0.9;0.78;0.9"
                repeatCount="indefinite"
              />
            )}
          </feTurbulence>
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain-noise)" />
      </svg>
    </div>
  )
}
