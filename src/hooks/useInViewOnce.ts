import { useEffect, useRef, useState } from 'react'

interface Options {
  /** Margin around the root, e.g. "200px" to trigger before the element enters. */
  rootMargin?: string
  threshold?: number
}

/**
 * Returns a ref and a boolean that flips to `true` the first time the element
 * approaches the viewport, then stops observing. Used to lazy-mount the heavy
 * 3D canvas only once the product section is near.
 */
export function useInViewOnce<T extends HTMLElement>({
  rootMargin = '200px',
  threshold = 0,
}: Options = {}) {
  const ref = useRef<T>(null)
  // No IntersectionObserver (very old engines / SSR): reveal immediately.
  const [inView, setInView] = useState(
    () => typeof IntersectionObserver === 'undefined',
  )

  useEffect(() => {
    const node = ref.current
    if (!node || inView) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin, threshold },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [inView, rootMargin, threshold])

  return { ref, inView }
}
