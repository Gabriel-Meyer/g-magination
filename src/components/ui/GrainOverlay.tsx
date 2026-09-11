/**
 * Fixed full-screen film-grain overlay built from a static SVG turbulence
 * filter — rasterized once; an animated baseFrequency would recompute the
 * noise on the CPU every frame, which mobile devices cannot afford.
 */
export function GrainOverlay() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 hidden mix-blend-soft-light sm:block"
      style={{ opacity: 0.06 }}
    >
      <svg className="h-full w-full">
        <filter id="grain-noise">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain-noise)" />
      </svg>
    </div>
  )
}
