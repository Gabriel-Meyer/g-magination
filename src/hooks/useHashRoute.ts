import { useEffect, useState } from 'react'

export type Route = { page: 'home' } | { page: 'lamp'; id: string }

function parse(): Route {
  const match = window.location.hash.match(/^#\/lamp\/([\w-]+)/)
  return match ? { page: 'lamp', id: match[1] } : { page: 'home' }
}

/**
 * Minimal hash router. `#/lamp/<id>` renders a lamp page; everything else is
 * home, so plain section anchors (`#lamps`, `#hi`) keep working. When a
 * navigation lands on home via an anchor while home wasn't rendered yet (e.g.
 * top-bar link from a lamp page), we scroll to the target after the paint.
 */
export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(parse)

  useEffect(() => {
    const onChange = () => setRoute(parse())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  useEffect(() => {
    if (route.page === 'lamp') {
      window.scrollTo(0, 0)
      return
    }
    const anchor = window.location.hash.replace(/^#\/?/, '')
    if (anchor) {
      // Double rAF: let React paint home first, then land on the section.
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          document.getElementById(anchor)?.scrollIntoView({ behavior: 'auto' }),
        ),
      )
    }
  }, [route])

  return route
}
