import type { ReactNode } from 'react'
import { useInViewOnce } from '../../hooks/useInViewOnce'

interface RevealProps {
  children: ReactNode
  /** Seconds to wait before animating in (applied as a transition delay). */
  delay?: number
  className?: string
}

/**
 * Cinematic fade-and-rise reveal triggered when the element scrolls into view.
 * Pure CSS + IntersectionObserver — no animation library, and it degrades to
 * fully visible under prefers-reduced-motion (handled in index.css).
 */
export function Reveal({ children, delay = 0, className = '' }: RevealProps) {
  const { ref, inView } = useInViewOnce<HTMLDivElement>({
    rootMargin: '0px 0px -10% 0px',
  })

  return (
    <div
      ref={ref}
      className={`reveal ${inView ? 'is-visible' : ''} ${className}`.trim()}
      style={delay ? { transitionDelay: `${delay}s` } : undefined}
    >
      {children}
    </div>
  )
}
