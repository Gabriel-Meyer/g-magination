import { Footer } from './components/layout/Footer'
import { TopBar } from './components/layout/TopBar'
import { About } from './components/sections/About'
import { Hero } from './components/sections/Hero'
import { Work } from './components/sections/Work'
import { GrainOverlay } from './components/ui/GrainOverlay'
import { NotifyBlock } from './components/ui/NotifyBlock'
import { QuietCursor } from './components/ui/QuietCursor'
import { QuietField } from './components/ui/QuietField'
import { useHashRoute } from './hooks/useHashRoute'
import { useParallaxInput } from './hooks/useParallaxInput'
import { useScrollProgress } from './hooks/useScrollProgress'
import { LampPage } from './pages/LampPage'

/**
 * One quiet site, two kinds of pages: home and one page per lamp
 * (`#/lamp/<id>`, see useHashRoute). Two hooks publish the global motion
 * signals as CSS vars (--sp/--syv from scroll, --nx/--ny from cursor or
 * device tilt); the field, hero and cards read them directly — no per-frame
 * React renders.
 */
export default function App() {
  useScrollProgress()
  useParallaxInput()
  const route = useHashRoute()

  return (
    <>
      <QuietField />
      <TopBar />

      <main>
        {route.page === 'lamp' ? (
          <LampPage id={route.id} />
        ) : (
          <>
            <Hero />
            <Work />
            <About />
            <section id="notify" className="relative px-6 pb-32">
              <NotifyBlock
                heading="want a heads-up when the next lamp exists?"
                topic="new lamps"
              />
            </section>
          </>
        )}
        <Footer />
      </main>

      {/* A breath of paper texture over everything. */}
      <GrainOverlay />
      <QuietCursor />
    </>
  )
}
