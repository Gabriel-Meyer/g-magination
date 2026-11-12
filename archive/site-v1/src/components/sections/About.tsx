import { Reveal } from '../ui/Reveal'

/**
 * Short and human — the studio in three breaths. Reference, not pitch.
 */
export function About() {
  return (
    <section id="about" className="relative px-6 py-32">
      <div className="mx-auto flex max-w-xl flex-col items-center gap-8 text-center">
        <Reveal>
          <p className="quiet-label">about</p>
        </Reveal>

        <Reveal delay={0.1}>
          <h2 className="text-balance text-2xl font-light lowercase leading-snug tracking-tight text-ink sm:text-3xl">
            software engineer by day.
            <br />
            lamp person on saturdays.
          </h2>
        </Reveal>

        <Reveal delay={0.2}>
          <p className="text-balance text-sm font-light leading-relaxed text-taupe sm:text-base">
            hi, i'm gabriel. i argue with steel, plywood and the occasional ikea
            aisle until something glows. vienna is home, the workshop is small,
            and every lamp gets filmed while it happens — fails included.
          </p>
        </Reveal>

        <Reveal delay={0.3}>
          <p className="text-balance text-sm font-light leading-relaxed text-taupe">
            want one, or want to talk lamps? no shop, no waitlist — just{' '}
            <a
              href="#hi"
              className="text-rose-deep underline decoration-rose/50 underline-offset-4 transition-colors hover:text-ink"
            >
              say hi
            </a>
            .
          </p>
        </Reveal>
      </div>
    </section>
  )
}
