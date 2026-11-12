import { Reveal } from '../ui/Reveal'

/**
 * The closing "say hi" — an email, two instagram handles, and a wink.
 * Contact, not conversion.
 */
export function Footer() {
  return (
    <footer
      id="hi"
      className="relative flex min-h-[70svh] flex-col items-center justify-center gap-10 px-6 py-32 text-center"
    >
      <Reveal>
        <p className="quiet-label mb-8">say hi</p>
        <a
          href="mailto:studio@g-magination.com?subject=hi%20—%20lamps"
          className="inline-block break-all text-[clamp(1.6rem,6vw,4.5rem)] font-light lowercase tracking-[-0.02em] text-ink transition-colors hover:text-rose-deep"
        >
          studio@g-magination.com
        </a>
      </Reveal>

      <Reveal delay={0.15}>
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          <a
            href="https://www.instagram.com/sankt_lampriel/"
            target="_blank"
            rel="noreferrer"
            className="wiggle-hover inline-block text-sm font-light lowercase text-taupe transition-colors hover:text-ink"
          >
            @sankt_lampriel — the lamps
          </a>
          <a
            href="https://www.instagram.com/g_magination/"
            target="_blank"
            rel="noreferrer"
            className="wiggle-hover inline-block text-sm font-light lowercase text-taupe transition-colors hover:text-ink"
          >
            @g_magination — everything else
          </a>
        </div>
      </Reveal>

      <Reveal delay={0.25}>
        <p className="max-w-md text-balance text-sm font-light leading-relaxed text-taupe">
          dms are read eventually, emails slightly faster. lamps are built one
          at a time, in whichever order feels right.
        </p>
      </Reveal>

      <Reveal delay={0.35} className="mt-8">
        <p className="text-[0.6rem] font-medium lowercase tracking-[0.3em] text-ink/30">
          g-magination&ensp;·&ensp;vienna&ensp;·&ensp;no shop, no spam — just
          lamps
        </p>
      </Reveal>
    </footer>
  )
}
