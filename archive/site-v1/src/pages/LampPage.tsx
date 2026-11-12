import { useEffect, type CSSProperties } from 'react'
import { lampById } from '../data/lamps'
import { NotifyBlock } from '../components/ui/NotifyBlock'
import { PhotoStack } from '../components/ui/PhotoStack'
import { Reveal } from '../components/ui/Reveal'
import { CoffeeRing, Pencil, Screw, ZipTie } from '../components/ui/TableBits'

/* Resting angles for the masking-tape labels. */
const TAPE_ANGLES = ['-2deg', '1.5deg', '-1deg', '2.2deg', '-1.6deg']

/**
 * One lamp as its spot on the studio table: prints of it scattered around, a
 * taped note with the story, masking-tape labels for the facts, and the small
 * mess a workbench earns — a coffee ring, a pencil, a stray zip tie.
 * Reference, not product page: nothing here sells anything.
 */
export function LampPage({ id }: { id: string }) {
  const lamp = lampById(id)

  // Unknown lamp → gently back home.
  useEffect(() => {
    if (!lamp) window.location.hash = '#/'
  }, [lamp])
  if (!lamp) return null

  return (
    <article className="relative overflow-x-clip px-6 pb-32 pt-32 sm:pt-40">
      <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-16">
        {/* The mess on the table. */}
        <CoffeeRing
          className="right-[-2%] top-40 w-24 sm:w-32"
          rotate="-10deg"
        />
        <ZipTie
          className="left-[-1%] top-[46%] hidden w-20 sm:block"
          rotate="30deg"
        />
        <Pencil
          className="bottom-[26rem] right-[-3%] hidden w-36 md:block"
          rotate="18deg"
        />
        <Screw className="bottom-40 left-[8%] w-5" rotate="40deg" />
        <Screw className="bottom-56 left-[12%] w-4" rotate="-15deg" />

        <Reveal className="w-full">
          <a
            href="#lamps"
            className="text-sm font-light lowercase text-taupe transition-colors hover:text-ink"
          >
            ← back to the table
          </a>
        </Reveal>

        <header className="flex flex-col items-center gap-5 text-center">
          <Reveal>
            <p className="quiet-label">{lamp.number}</p>
          </Reveal>
          <Reveal delay={0.1}>
            <h1 className="text-balance text-[clamp(2.2rem,7vw,4.5rem)] font-light lowercase leading-tight tracking-[-0.02em] text-ink">
              {lamp.name}
            </h1>
          </Reveal>
          <Reveal delay={0.2}>
            <p className="text-base font-light lowercase text-taupe sm:text-lg">
              {lamp.tagline}
            </p>
          </Reveal>
        </header>

        {/* The pile of prints — click to leaf through. */}
        <Reveal className="w-full">
          <PhotoStack images={[lamp.hero, ...lamp.gallery]} />
        </Reveal>

        {/* The story, taped down. */}
        <Reveal className="w-full max-w-xl">
          <div className="paper-note px-8 py-10 sm:px-10">
            <span className="tape-strip" aria-hidden="true" />
            <div className="flex flex-col gap-5">
              {lamp.story.map((paragraph) => (
                <p
                  key={paragraph.slice(0, 24)}
                  className="text-sm font-light leading-relaxed text-taupe sm:text-base"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </Reveal>

        {/* Facts on masking tape. */}
        <Reveal>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {lamp.chips.map((chip, index) => (
              <span
                key={chip}
                className="tape"
                style={
                  {
                    '--rot': TAPE_ANGLES[index % TAPE_ANGLES.length],
                  } as CSSProperties
                }
              >
                {chip}
              </span>
            ))}
          </div>
        </Reveal>

        {/* The build reel, framed like another print on the table. */}
        <Reveal className="flex w-full flex-col items-center gap-5">
          <p className="quiet-label">watch the build</p>
          <div
            className="paper-print w-full max-w-[360px]"
            style={{ '--rot': '1.1deg' } as CSSProperties}
          >
            <iframe
              src={lamp.video.embed}
              title={`${lamp.name} — build video on instagram`}
              loading="lazy"
              allowFullScreen
              className="h-[640px] w-full rounded-[2px] border-0 bg-white sm:h-[700px]"
            />
          </div>
          <p className="text-xs font-light lowercase italic text-ink/40">
            {lamp.video.caption}
          </p>
        </Reveal>

        <Reveal>
          <a
            href={lamp.instagram.href}
            target="_blank"
            rel="noreferrer"
            className="wiggle-hover inline-block lowercase tracking-[0.18em] text-rose-deep underline decoration-rose/50 underline-offset-8 transition-colors hover:text-ink"
          >
            {lamp.instagram.label} ↗
          </a>
        </Reveal>

        <div className="mt-8 w-full border-t border-ink/8 pt-16">
          <NotifyBlock
            heading={`want a heads-up when ${lamp.id} gets a sibling?`}
            topic={lamp.id}
          />
        </div>
      </div>
    </article>
  )
}
