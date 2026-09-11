import { useEffect } from 'react'

/**
 * Publishes scroll position as CSS custom properties on the document root so
 * children can drive scroll-linked motion with `var()` — no React re-renders:
 *
 *   --sp    progress through the first viewport, clamped 0..1 (hero exit)
 *   --syv   viewport-heights scrolled, unclamped (field parallax)
 *
 * Updates are coalesced with requestAnimationFrame.
 */
export function useScrollProgress() {
  useEffect(() => {
    let raf = 0

    const apply = () => {
      raf = 0
      const h = window.innerHeight || 1
      const y = window.scrollY / h
      const root = document.documentElement.style
      root.setProperty('--sp', Math.min(Math.max(y, 0), 1).toFixed(4))
      root.setProperty('--syv', y.toFixed(4))
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
    }
  }, [])
}
