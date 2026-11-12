import { LAMPS, type Lamp } from '../../data/lamps'
import { PaperPrint } from '../ui/PaperPrint'
import { CoffeeRing, Pencil } from '../ui/TableBits'
import { Reveal } from '../ui/Reveal'

/* Each print rests at its own angle; hovering picks it up. */
const RESTING_ANGLES = ['-2.2deg', '1.8deg', '-1.4deg', '2.4deg']

/**
 * The lamps as prints lying on the studio table — white-bordered photos with
 * the name written on the paper margin, a coffee ring and a pencil between
 * them. Each print links to the lamp's own page.
 */
export function Work() {
  return (
    <section id="lamps" className="relative px-6 py-32">
      <div className="relative mx-auto max-w-5xl">
        {/* Stuff on the table. */}
        <CoffeeRing
          className="-top-10 right-[6%] w-24 sm:w-28"
          rotate="14deg"
        />
        <Pencil
          className="bottom-[-4.5rem] left-[4%] hidden w-36 md:block"
          rotate="-24deg"
        />

        <Reveal>
          <p className="quiet-label text-center">the lamps (so far)</p>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mt-6 text-center text-sm font-light text-taupe">
            built on saturdays. filmed on a shaky tripod. pick one up.
          </p>
        </Reveal>

        <div className="mt-20 grid gap-16 md:grid-cols-2 md:gap-12">
          {LAMPS.map((lamp, index) => (
            <LampPrint key={lamp.id} lamp={lamp} index={index} />
          ))}
        </div>
      </div>
    </section>
  )
}

function LampPrint({ lamp, index }: { lamp: Lamp; index: number }) {
  return (
    <Reveal delay={index * 0.12} className={index % 2 ? 'md:mt-14' : ''}>
      <a href={`#/lamp/${lamp.id}`} data-cursor className="group block">
        <PaperPrint
          src={lamp.hero.src}
          alt={lamp.hero.alt}
          rotate={RESTING_ANGLES[index % RESTING_ANGLES.length]}
          caption={
            <>
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-base font-medium lowercase tracking-tight text-ink sm:text-lg">
                  {lamp.name}
                </h3>
                <span className="shrink-0 text-[0.62rem] font-medium lowercase tracking-[0.18em] text-rose-deep">
                  {lamp.number}
                </span>
              </div>
              <p className="mt-1 text-sm font-light lowercase text-taupe">
                {lamp.tagline}
              </p>
              <p className="mt-2 text-xs font-light lowercase text-rose-deep opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                take a look →
              </p>
            </>
          }
        />
      </a>
    </Reveal>
  )
}
