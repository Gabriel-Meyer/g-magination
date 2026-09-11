import type { CSSProperties } from 'react'

/* Tiny specks of light, hand-placed so the drift never looks seeded.
   left/size in %, px · duration/delay in s · opacity peak. */
const MOTES = [
  { left: 12, size: 7, duration: 74, delay: -12, opacity: 0.32 },
  { left: 22, size: 4, duration: 96, delay: -51, opacity: 0.22 },
  { left: 31, size: 9, duration: 66, delay: -30, opacity: 0.38 },
  { left: 44, size: 5, duration: 88, delay: -70, opacity: 0.26 },
  { left: 55, size: 11, duration: 58, delay: -9, opacity: 0.42 },
  { left: 63, size: 4, duration: 102, delay: -44, opacity: 0.2 },
  { left: 72, size: 6, duration: 80, delay: -63, opacity: 0.3 },
  { left: 84, size: 8, duration: 70, delay: -25, opacity: 0.36 },
  { left: 92, size: 5, duration: 92, delay: -81, opacity: 0.24 },
]

/**
 * The fixed, blurred light living behind the whole page: three large pools of
 * rose and cream drifting on slow independent paths, and a handful of tiny
 * blurred motes rising through them. Layers carry a depth factor (--qd) so the
 * field parallaxes with scroll (--syv) and leans with the cursor or device
 * tilt (--nx/--ny) — see useParallaxInput / useScrollProgress.
 *
 * Purely decorative; body paint (blush paper) propagates to the canvas behind
 * it, so -z-10 keeps it under all content while staying visible.
 */
export function QuietField() {
  return (
    <div aria-hidden="true" className="fixed inset-0 -z-10 overflow-hidden">
      {/* Far layer — the big, soft ground light. Barely moves. */}
      <div className="qf-layer" style={{ '--qd': 0.5 } as CSSProperties}>
        <div
          className="qf-orb qf-drift-a left-[8%] top-[12%] h-[58vmin] w-[58vmin]"
          style={{
            background:
              'radial-gradient(circle, rgba(216,167,160,0.32) 0%, rgba(216,167,160,0.16) 42%, transparent 72%)',
          }}
        />
        <div
          className="qf-orb qf-drift-b left-[58%] top-[52%] h-[64vmin] w-[64vmin]"
          style={{
            background:
              'radial-gradient(circle, rgba(247,233,215,0.5) 0%, rgba(247,233,215,0.24) 42%, transparent 72%)',
          }}
        />
      </div>

      {/* Mid layer — a warmer, smaller pool with more parallax. */}
      <div className="qf-layer" style={{ '--qd': 1.4 } as CSSProperties}>
        <div
          className="qf-orb qf-drift-c left-[30%] top-[64%] h-[36vmin] w-[36vmin]"
          style={{
            background:
              'radial-gradient(circle, rgba(216,167,160,0.28) 0%, rgba(216,167,160,0.13) 42%, transparent 70%)',
          }}
        />
      </div>

      {/* Near layer — the tiny rising motes. Moves the most. */}
      <div className="qf-layer" style={{ '--qd': 2.6 } as CSSProperties}>
        {MOTES.map((mote) => (
          <div
            key={mote.left}
            className="qf-mote top-[108%]"
            style={
              {
                left: `${mote.left}%`,
                width: mote.size,
                height: mote.size,
                '--md': `${mote.duration}s`,
                '--mdel': `${mote.delay}s`,
                '--mo': mote.opacity,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  )
}
