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
      root.classList.toggle(
        'hero-dark',
        window.scrollY / window.innerHeight < LIT_AT,
      )
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
    const h = window.innerHeight
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

        <HeroLamp onToggle={toggleSwitch} />

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
            a tiny studio in vienna, turning ordinary things into lamps. two
            exist so far — a third is being argued with.
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

/**
 * The lamp: a grand old fabric shade — pleated, scallop-trimmed, fringed —
 * hanging on its red cable at the left edge of the screen, only half in
 * frame. The pull switch hangs from the shade's rim and is clickable — it\n * scroll-toggles the light. The lamp fades out with the
 * hero text, a touch earlier (--hx). Colors flip with the dark phase in
 * index.css.
 */
function HeroLamp({ onToggle }: { onToggle: () => void }) {
  return (
    <div
      className="hero-lamp pointer-events-none absolute right-0 top-0 z-[5] h-[52svh] translate-x-1/2 sm:h-[66svh]"
      style={{
        rotate: 'calc(var(--nx, 0) * 1.2deg)',
        transformOrigin: 'top center',
        opacity: 'calc(1 - clamp(0, var(--hx, 0) * 1.5, 1))',
      }}
    >
      {/* The light pooling out from under the shade. */}
      <div
        aria-hidden="true"
        className="lamp-glow-wrap absolute left-1/2 top-[56%] -translate-x-1/2 -translate-y-1/2"
      >
        <div
          className="quiet-breath h-[72vmin] w-[72vmin] rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(255,223,158,0.55) 0%, rgba(247,201,138,0.28) 42%, rgba(247,201,138,0.1) 62%, transparent 75%)',
          }}
        />
      </div>

      {/* Invisible click target over the pull cord (x≈33% of the shade). */}
      <button
        type="button"
        onClick={onToggle}
        data-cursor
        aria-label="pull the light switch"
        className="pointer-events-auto absolute bottom-0 left-[33%] top-[58%] z-10 w-12 -translate-x-1/2"
      />
      <svg
        aria-hidden="true"
        viewBox="0 0 400 620"
        className="hero-lamp-svg relative h-full"
      >
        <defs>
          <linearGradient id="shade-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f8ecca" />
            <stop offset="55%" stopColor="#f2dfae" />
            <stop offset="100%" stopColor="#e8c98a" />
          </linearGradient>
        </defs>
        {/* Red textile cable — long, so the shade hangs below the top bar. */}
        <line className="lamp-cord" x1="200" y1="0" x2="200" y2="112" />
        {/* Top cap. */}
        <rect
          className="lamp-cap"
          x="181"
          y="110"
          width="38"
          height="18"
          rx="5"
        />
        {/* The pull switch — painted behind the shade, so the long cord
            disappears up into the lamp: dragged down by scroll it never
            shows a gap, and it springs back when the light clicks on. */}
        <g className="hero-pull">
          <line
            className="lamp-pull-line"
            x1="132"
            y1="172"
            x2="132"
            y2="414"
          />
          <rect
            className="lamp-pull-handle"
            x="127.5"
            y="414"
            width="9"
            height="20"
            rx="4"
          />
        </g>
        {/* The shade: bell silhouette with a scalloped hem. */}
        <path
          className="lamp-shade"
          fill="url(#shade-grad)"
          d="M162 128 L238 128
             C298 156 338 242 346 322
             q -18.25 17 -36.5 0 q -18.25 17 -36.5 0 q -18.25 17 -36.5 0 q -18.25 17 -36.5 0
             q -18.25 17 -36.5 0 q -18.25 17 -36.5 0 q -18.25 17 -36.5 0 q -18.25 17 -36.5 0
             C 62 242 102 156 162 128 Z"
        />
        {/* Pleat seams. */}
        <path
          className="lamp-seams"
          d="M174 130 C 142 184 104 264 86 326
             M188 129 C 170 194 148 274 138 330
             M200 128 V 326
             M212 129 C 230 194 252 274 262 330
             M226 130 C 258 184 296 264 314 326"
        />
        {/* Fringe below the hem. */}
        <path
          className="lamp-fringe"
          d="M62 330 v20 M76 334 v24 M90 336 v20 M104 332 v24 M118 336 v21 M132 333 v24
             M146 337 v20 M160 333 v24 M174 337 v21 M188 334 v24 M202 337 v20 M216 334 v24
             M230 337 v21 M244 333 v24 M258 337 v20 M272 333 v24 M286 336 v21 M300 332 v24
             M314 336 v20 M328 333 v22 M340 329 v20"
        />
      </svg>
    </div>
  )
}
