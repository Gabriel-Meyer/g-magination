import { useEffect } from 'react'

interface OrientationPermission {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

const clamp = (v: number) => Math.min(Math.max(v, -1), 1)

/**
 * Publishes a damped "where is the visitor leaning" signal as `--nx` / `--ny`
 * on the document root, normalized to -1..1 from the viewport center.
 *
 * Source depends on the device:
 *  - fine pointers  → cursor position
 *  - coarse pointers → device tilt (deviceorientation; gamma = x, beta = y)
 *
 * The raw input is eased toward with a lerp inside a rAF loop that sleeps once
 * settled, so the field reacts with a soft lag instead of sticking to the
 * input. iOS requires a user gesture to grant orientation access — we request
 * it silently on the first touch and stay still if it's declined.
 * No-op under prefers-reduced-motion.
 */
export function useParallaxInput() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const root = document.documentElement.style
    let targetX = 0
    let targetY = 0
    let x = 0
    let y = 0
    let raf = 0

    const tick = () => {
      x += (targetX - x) * 0.055
      y += (targetY - y) * 0.055
      root.setProperty('--nx', x.toFixed(4))
      root.setProperty('--ny', y.toFixed(4))
      if (Math.abs(targetX - x) > 0.002 || Math.abs(targetY - y) > 0.002) {
        raf = requestAnimationFrame(tick)
      } else {
        raf = 0
      }
    }
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(tick)
    }

    const fine = window.matchMedia('(pointer: fine)').matches

    // Desktop — the cursor is the light source's counterweight.
    const onMove = (e: PointerEvent) => {
      targetX = clamp((e.clientX / window.innerWidth) * 2 - 1)
      targetY = clamp((e.clientY / window.innerHeight) * 2 - 1)
      wake()
    }

    // Touch — tilting the device leans the light. beta ≈ 45° is a natural
    // holding angle, so that's the resting center.
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return
      targetX = clamp(e.gamma / 28)
      targetY = clamp((e.beta - 45) / 28)
      wake()
    }

    const listenOrientation = () =>
      window.addEventListener('deviceorientation', onOrient, true)

    const askPermission = () => {
      ;(DeviceOrientationEvent as unknown as OrientationPermission)
        .requestPermission?.()
        .then((state) => {
          if (state === 'granted') listenOrientation()
        })
        .catch(() => {
          /* declined or unavailable — the field simply rests */
        })
    }

    let asksOnGesture = false
    if (fine) {
      window.addEventListener('pointermove', onMove, { passive: true })
    } else if (
      typeof (DeviceOrientationEvent as unknown as OrientationPermission)
        ?.requestPermission === 'function'
    ) {
      // iOS: permission prompts are only allowed inside a user gesture.
      asksOnGesture = true
      window.addEventListener('pointerdown', askPermission, { once: true })
    } else if ('DeviceOrientationEvent' in window) {
      listenOrientation()
    }

    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('deviceorientation', onOrient, true)
      if (asksOnGesture)
        window.removeEventListener('pointerdown', askPermission)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])
}
