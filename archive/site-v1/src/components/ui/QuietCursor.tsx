import { useEffect, useRef } from 'react'

/**
 * The cursor is a small light bulb — glass, filament, screw base. It follows
 * the pointer exactly (it only ever moves with the visitor's own hand, so it
 * stays on under prefers-reduced-motion). Hovering something clickable makes
 * the filament glimmer; pressing switches the bulb fully on, glow and all.
 *
 * Renders nothing on coarse pointers — the system cursor is restored via the
 * `quiet-cursor` class on <html> (index.css).
 */
export function QuietCursor() {
  const bulbRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return
    const bulb = bulbRef.current
    const wrap = wrapRef.current
    if (!bulb || !wrap) return

    document.documentElement.classList.add('quiet-cursor')

    let x = -100
    let y = -100
    let raf = 0

    const apply = () => {
      raf = 0
      bulb.style.transform = `translate3d(${x}px, ${y}px, 0)`
    }

    const onMove = (e: PointerEvent) => {
      x = e.clientX
      y = e.clientY
      wrap.classList.add('is-visible')
      if (!raf) raf = requestAnimationFrame(apply)
    }

    const onOver = (e: PointerEvent) => {
      const interactive = (e.target as Element | null)?.closest?.(
        'a, button, input, [data-cursor]',
      )
      wrap.classList.toggle('is-active', !!interactive)
    }

    const onDown = () => wrap.classList.add('is-down')
    const onUp = () => wrap.classList.remove('is-down')
    const onLeave = () => wrap.classList.remove('is-visible')

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerover', onOver, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    document.documentElement.addEventListener('mouseleave', onLeave)

    return () => {
      document.documentElement.classList.remove('quiet-cursor')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerover', onOver)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      document.documentElement.removeEventListener('mouseleave', onLeave)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div ref={wrapRef} aria-hidden="true" className="qc max-sm:hidden">
      <div ref={bulbRef} className="fixed left-0 top-0">
        <svg className="qc-bulb" viewBox="0 0 30 40">
          <defs>
            <radialGradient id="qc-glow-grad" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0%" stopColor="#ffdf9e" stopOpacity="0.9" />
              <stop offset="45%" stopColor="#f7c98a" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#f7c98a" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* The light itself — a soft pool behind the glass, no outline. */}
          <circle
            className="qc-glow"
            cx="15"
            cy="14"
            r="22"
            fill="url(#qc-glow-grad)"
          />

          {/* Glass — classic pear shape narrowing into the neck. */}
          <path
            className="qc-glass"
            d="M15 2.5
               C8.2 2.5 3.8 7.6 3.8 13.6
               C3.8 18 6.3 20.9 8.4 23
               C9.9 24.5 10.5 25.6 10.5 27.2
               L19.5 27.2
               C19.5 25.6 20.1 24.5 21.6 23
               C23.7 20.9 26.2 18 26.2 13.6
               C26.2 7.6 21.8 2.5 15 2.5 Z"
          />

          {/* Filament: two support wires and the coil between them. */}
          <path className="qc-wires" d="M12.2 26.5 V18.5 M17.8 26.5 V18.5" />
          <path
            className="qc-filament"
            d="M12.2 18.5 L13.3 15.6 L14.4 18.3 L15.6 15.6 L16.7 18.3 L17.8 15.6"
          />

          {/* Screw base with threads, and the contact tip. */}
          <path
            className="qc-base"
            d="M10.8 27.2 H19.2 L19 33.6 C19 33.6 17.6 35.2 15 35.2 C12.4 35.2 11 33.6 11 33.6 Z"
          />
          <path
            className="qc-threads"
            d="M10.9 29.2 L19.1 28.4 M11 31.2 L19 30.4 M11.2 33.2 L18.8 32.4"
          />
          <ellipse className="qc-tip" cx="15" cy="36" rx="2.2" ry="1.3" />
        </svg>
      </div>
    </div>
  )
}
