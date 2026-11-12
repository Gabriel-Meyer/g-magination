import type { CSSProperties } from 'react'

/**
 * The fixed, soft light living behind the whole page: three large pools of
 * rose and cream drifting on slow independent paths. Layers carry a depth
 * factor (--qd) so the field parallaxes with scroll (--syv) and leans with
 * the cursor or device tilt (--nx/--ny) — see useParallaxInput /
 * useScrollProgress.
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
    </div>
  )
}
