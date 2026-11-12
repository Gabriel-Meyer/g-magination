import { useLayoutEffect, type CSSProperties } from 'react'
import { ScrollCue } from '../ui/ScrollCue'

/** Scroll progress (in viewport heights) at which the switch clicks on. */
const LIT_AT = 0.5

/**
 * The quiet hero, with a light switch. The section is pinned for a while
 * (220svh with a sticky viewport): it starts dark — just a pendant lamp on
 * its red cable, a pull switch, and pale type. Scrolling pulls the cord 1:1;
 * at LIT_AT the switch clicks: the cord springs back, the bulb floods warm,
 * the dark veil lifts and the page becomes its blush self. Only near the end
 * of the pin does the content dissolve into light and scroll away (--hx).
 *
 * The dark phase lives as a `hero-dark` class on <html> so the top bar and
 * the bulb cursor can flip along (rules in index.css).
 */
export function Hero() {
  useLayoutEffect(() => {
    const root = document.documentElement
    let raf = 0
    const apply = () => {
      raf = 0
      // Guard the divisor: a zero height would make the ratio NaN, which
      // compares false and would silently start the hero already lit.
      const h = window.innerHeight || 1
      root.classList.toggle('hero-dark', window.scrollY / h < LIT_AT)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply)
    }
    apply()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
      root.classList.remove('hero-dark')
    }
  }, [])

  // Clicking the pull switch scrolls smoothly to the other state: into the
  // lit hold when dark (so you watch the cord pull on the way), back to the
  // top when lit.
  const toggleSwitch = () => {
    const h = window.innerHeight || 1
    const lit = window.scrollY / h >= LIT_AT
    window.scrollTo({ top: lit ? 0 : Math.round(h * 0.72), behavior: 'smooth' })
  }

  return (
    <section id="top" className="relative h-[280svh]">
      <div
        className="hero-viewport sticky top-0 flex flex-col overflow-x-clip"
        style={
          {
            // Exit progress: 0 while pinned, 1 as the section releases.
            // The light clicks on at 0.5; the long stretch until 1.3 is the
            // lit hold, then the content dissolves over the last 0.45.
            '--hx': 'clamp(0, (var(--syv, 0) - 1.3) / 0.45, 1)',
          } as CSSProperties
        }
      >
        {/* Light pools — the lamp's spill once it's on. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
        >
          <div
            className="absolute left-1/2 top-[36%]"
            style={{
              transform:
                'translate(-50%, -50%) scale(calc(0.85 + var(--hx, 0) * 2.4))',
              willChange: 'transform',
            }}
          >
            <div
              className="quiet-breath h-[42vmin] w-[42vmin] rounded-full"
              style={{
                background:
                  'radial-gradient(circle, rgba(216,167,160,0.2) 0%, rgba(216,167,160,0.1) 45%, transparent 72%)',
              }}
            />
          </div>
        </div>

        {/* The dark, until someone pulls the switch. */}
        <div aria-hidden="true" className="hero-veil" />

        <HeroBlueprint />
        <HeroLamp />
        <WallSwitch onToggle={toggleSwitch} />

        <div
          className="pointer-events-none relative z-10 flex h-full w-full flex-col items-center justify-center px-6 pt-[16svh] text-center"
          style={{
            transform: 'translateY(calc(var(--hx, 0) * -10vh))',
            opacity: 'calc(1 - var(--hx, 0))',
            willChange: 'transform, opacity',
          }}
        >
          <p
            className="animate-fade-rise quiet-label mb-10"
            style={{ animationDelay: '0.15s' }}
          >
            gabriel builds lampsssss
          </p>

          <h1
            className="hero-title animate-fade-rise text-[clamp(3rem,12vw,13rem)] font-light lowercase leading-[0.95] tracking-[-0.02em]"
            style={{ animationDelay: '0.35s' }}
          >
            g-magination
          </h1>

          <p
            className="hero-sub animate-fade-rise mt-12 max-w-sm text-balance text-sm font-light leading-relaxed sm:text-base"
            style={{ animationDelay: '0.7s' }}
          >
            a tinkerer in vienna, building cool light pieces out of pure
            passion. are you curious what comes next?
          </p>
        </div>

        <div
          className="pointer-events-none absolute bottom-10 left-1/2 z-10 -translate-x-1/2"
          style={{ opacity: 'calc(1 - var(--hx, 0) * 2.5)' }}
        >
          <div className="animate-fade-rise" style={{ animationDelay: '1.1s' }}>
            <ScrollCue />
          </div>
        </div>
      </div>
    </section>
  )
}

/* The bubblegum cluster: back globes first (painted darker), front on top.
   Cluster center ≈ (200, 258); the cable and pull cord vanish behind it. */
const GLOBES_BACK = [
  { cx: 152, cy: 182, r: 40 },
  { cx: 252, cy: 178, r: 38 },
  { cx: 300, cy: 242, r: 42 },
  { cx: 102, cy: 248, r: 40 },
  { cx: 282, cy: 322, r: 40 },
  { cx: 126, cy: 322, r: 38 },
]
const GLOBES_FRONT = [
  { cx: 200, cy: 168, r: 46 },
  { cx: 148, cy: 258, r: 50 },
  { cx: 256, cy: 254, r: 52 },
  { cx: 196, cy: 336, r: 50 },
  { cx: 206, cy: 252, r: 42 },
]

/**
 * The hero lamp is the bubblegum: a cluster of glass globes on its red cable,
 * hanging at the right edge, half in frame. Dark: dusty outlines. Lit: the
 * globes glow vivid orange, like the real thing. The pull switch hangs from
 * inside the cluster and is clickable — it scroll-toggles the light. Fades
 * with the hero text, a touch earlier (--hx).
 */
function HeroLamp() {
  return (
    <div
      className="hero-lamp pointer-events-none absolute right-0 top-0 z-[5] h-[52svh] translate-x-[30%] sm:h-[66svh]"
      style={{
        rotate: 'calc(var(--nx, 0) * 1.2deg)',
        transformOrigin: 'top center',
        opacity: 'calc(1 - clamp(0, var(--hx, 0) * 1.5, 1))',
      }}
    >
      {/* The light pooling out of the cluster. */}
      <div
        aria-hidden="true"
        className="lamp-glow-wrap absolute left-1/2 top-[41%] -translate-x-1/2 -translate-y-1/2"
      >
        <div
          className="quiet-breath h-[76vmin] w-[76vmin] rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(255,166,90,0.5) 0%, rgba(255,150,80,0.26) 42%, rgba(247,180,120,0.1) 62%, transparent 75%)',
          }}
        />
      </div>

      <svg
        aria-hidden="true"
        viewBox="0 0 400 620"
        className="hero-lamp-svg relative h-full"
      >
        <defs>
          <radialGradient id="globe-grad" cx="0.42" cy="0.38" r="0.75">
            <stop offset="0%" stopColor="#ffc27d" />
            <stop offset="45%" stopColor="#ff9a3f" />
            <stop offset="100%" stopColor="#f07322" />
          </radialGradient>
          <radialGradient id="globe-grad-back" cx="0.45" cy="0.4" r="0.75">
            <stop offset="0%" stopColor="#f2953c" />
            <stop offset="100%" stopColor="#d65e1d" />
          </radialGradient>
        </defs>
        {/* Red textile cable, vanishing into the cluster. */}
        <line className="lamp-cord" x1="200" y1="0" x2="200" y2="170" />
        {GLOBES_BACK.map((g) => (
          <circle
            key={`${g.cx}-${g.cy}`}
            className="lamp-globe lamp-globe-back"
            fill="url(#globe-grad-back)"
            cx={g.cx}
            cy={g.cy}
            r={g.r}
          />
        ))}
        {GLOBES_FRONT.map((g) => (
          <circle
            key={`${g.cx}-${g.cy}`}
            className="lamp-globe"
            fill="url(#globe-grad)"
            cx={g.cx}
            cy={g.cy}
            r={g.r}
          />
        ))}
      </svg>
    </div>
  )
}

/**
 * A faint technical sketch of the other lamp (sr01) on the left — thin
 * construction lines, dashed dimensions, a wink of an annotation. Colors flip
 * with the dark phase (.bp-*), and it fades out with the lamp (--hx).
 */
function HeroBlueprint() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-[8svh] z-[2] h-[27svh] -translate-x-[18%] sm:top-[15svh] sm:h-[46svh] sm:-translate-x-[50%]"
      style={{
        rotate: '-2deg',
        opacity: 'calc(0.5 * (1 - clamp(0, var(--hx, 0) * 1.5, 1)))',
      }}
    >
      <svg viewBox="0 0 320 400" className="h-full">
        <text className="bp-text" x="24" y="30">
          sr01 · steel reflector one — sketch
        </text>

        {/* Front view: steel panel with the plywood body dashed behind. */}
        <rect className="bp-stroke" x="24" y="66" width="136" height="178" />
        <rect
          className="bp-stroke bp-dash"
          x="38"
          y="80"
          width="108"
          height="150"
        />
        <text className="bp-text" x="24" y="262">
          front
        </text>

        {/* Dimension above. */}
        <path className="bp-stroke" d="M24 50 h136 M24 45 v10 M160 45 v10" />
        <text className="bp-text" x="80" y="44">
          600
        </text>

        {/* Side view: wall, plywood body, floating panel, the gap. */}
        <path className="bp-stroke" d="M292 66 V244" />
        <path
          className="bp-stroke"
          d="M292 74 l10 -8 M292 96 l10 -8 M292 118 l10 -8 M292 140 l10 -8 M292 162 l10 -8 M292 184 l10 -8 M292 206 l10 -8 M292 228 l10 -8"
        />
        <rect className="bp-stroke" x="252" y="92" width="40" height="126" />
        <rect className="bp-stroke" x="234" y="74" width="10" height="162" />
        <text className="bp-text" x="238" y="262">
          side
        </text>

        {/* The gap, annotated honestly. */}
        <path className="bp-stroke bp-dash" d="M247 155 H200 V310 H120" />
        <text className="bp-text" x="24" y="314">
          ← the glow lives in here
        </text>

        {/* Stray construction marks. */}
        <path
          className="bp-stroke"
          d="M190 40 h10 M195 35 v10 M40 350 h10 M45 345 v10"
        />
        <text className="bp-text" x="190" y="368">
          scale: good enough
        </text>
      </svg>
    </div>
  )
}

/**
 * The wall switch. Lever down while dark — scrolling presses it upward a
 * little (--syv), and when the light clicks on it snaps up with a spring
 * (.ws-lever in index.css). Clicking scroll-toggles the light.
 */
function WallSwitch({ onToggle }: { onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      data-cursor
      aria-label="flip the light switch"
      className="pointer-events-auto absolute right-[13%] top-[74%] z-[6] h-20 sm:right-[17%] sm:top-[70%] sm:h-24"
      style={{ opacity: 'calc(1 - clamp(0, var(--hx, 0) * 1.5, 1))' }}
    >
      <svg viewBox="0 0 80 120" className="h-full">
        {/* Plate with its two screws. */}
        <rect
          className="ws-plate"
          x="14"
          y="12"
          width="52"
          height="84"
          rx="9"
        />
        <circle className="ws-screw" cx="40" cy="22" r="2.2" />
        <circle className="ws-screw" cx="40" cy="86" r="2.2" />
        {/* Toggle lever — rotation lives in CSS. */}
        <g className="ws-lever">
          <rect x="35" y="26" width="10" height="30" rx="4" />
          <circle cx="40" cy="27" r="4" />
        </g>
        {/* Pivot dome. */}
        <circle className="ws-pivot" cx="40" cy="54" r="7" />
      </svg>
    </button>
  )
}
