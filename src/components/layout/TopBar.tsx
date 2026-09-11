import { useEffect, useState } from 'react'

/**
 * Minimal fixed top bar: lowercase wordmark left, two understated links right.
 * Once the user scrolls it becomes a strip of frosted glass — blurring the
 * light field drifting behind it — with a hairline underneath.
 */
export function TopBar() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        scrolled
          ? 'border-b border-ink/5 bg-paper/70 py-4 backdrop-blur-md'
          : 'border-b border-transparent py-6'
      }`}
    >
      <nav className="mx-auto flex max-w-[1600px] items-center justify-between px-6 sm:px-10">
        <a
          href="#top"
          className="text-lg font-medium lowercase tracking-tight text-ink transition-opacity hover:opacity-60 sm:text-xl"
        >
          g&#8202;-&#8202;magination
        </a>
        <div className="flex items-center gap-5 sm:gap-7">
          <a
            href="#lamps"
            className="wiggle-hover inline-block text-[0.65rem] font-medium lowercase tracking-[0.25em] text-taupe transition-colors hover:text-ink"
          >
            lamps
          </a>
          <a
            href="#about"
            className="wiggle-hover inline-block text-[0.65rem] font-medium lowercase tracking-[0.25em] text-taupe transition-colors hover:text-ink"
          >
            about
          </a>
          <a
            href="#hi"
            className="wiggle-hover inline-block text-[0.65rem] font-medium lowercase tracking-[0.25em] text-taupe transition-colors hover:text-ink"
          >
            say hi
          </a>
        </div>
      </nav>
    </header>
  )
}
