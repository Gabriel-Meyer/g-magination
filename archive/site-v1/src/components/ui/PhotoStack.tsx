import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { LampImage } from '../../data/lamps'

/* Resting pose per stack position (0 = top card). */
const POSES = [
  { rot: '-1.6deg', x: '0px', y: '0px', sc: 1 },
  { rot: '2.6deg', x: '16px', y: '10px', sc: 0.99 },
  { rot: '-3.2deg', x: '-14px', y: '18px', sc: 0.98 },
  { rot: '1.8deg', x: '8px', y: '26px', sc: 0.97 },
  { rot: '-2.2deg', x: '-5px', y: '32px', sc: 0.965 },
]

const LEAF_MS = 720
/* The pile reorders while the card is fully out at the side — at that moment
   it overlaps nothing, so the z-index change is invisible. */
const SWAP_AT = 0.48

type Side = 'left' | 'right'
type Anim = `under-${Side}` | `onto-${Side}`
interface Leafing {
  index: number
  anim: Anim
}

/**
 * A pile of paper prints you leaf through like photos in your hand.
 *
 * Forward: the top print swipes flat out to one side — decelerating like a
 * thumb pushing it — and in the same continuous motion dives under the pile
 * and slides back in at the bottom. Backward is the mirror: the bottom print
 * pulls out sideways from underneath and lays itself on top.
 *
 * It's one keyframe animation per journey (no phase seams): the boundary
 * frames read the pose custom properties live, so when the pile reorders
 * mid-flight the card's destination updates seamlessly. Sides alternate, and
 * it stays on under prefers-reduced-motion (it only runs on click).
 */
export function PhotoStack({ images }: { images: LampImage[] }) {
  const [order, setOrder] = useState(() => images.map((_, index) => index))
  const [leafing, setLeafing] = useState<Leafing | null>(null)
  const flips = useRef(0)
  const locked = useRef(false)
  const timers = useRef<number[]>([])

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach(window.clearTimeout)
  }, [])
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }

  const nextSide = (): Side => (flips.current++ % 2 ? 'right' : 'left')

  const turn = (direction: 'forward' | 'back') => {
    if (locked.current || images.length < 2) return
    locked.current = true
    const side = nextSide()
    const moving = direction === 'forward' ? order[0] : order[order.length - 1]
    setLeafing({
      index: moving,
      anim: `${direction === 'forward' ? 'under' : 'onto'}-${side}`,
    })

    later(() => {
      setOrder((current) =>
        direction === 'forward'
          ? [...current.slice(1), current[0]]
          : [current[current.length - 1], ...current.slice(0, -1)],
      )
    }, LEAF_MS * SWAP_AT)

    later(() => {
      setLeafing(null)
      locked.current = false
    }, LEAF_MS + 40)
  }

  const top = images[order[0]]

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div className="relative w-full max-w-xl">
        <button
          type="button"
          onClick={() => turn('forward')}
          data-cursor
          aria-label="show the next photo"
          className="stack relative block w-full"
        >
          {/* DOM order stays fixed (mapping images, not order) — moving a
              node would restart its CSS animation mid-leaf. Stack position
              is derived instead. */}
          {images.map((image, imageIndex) => {
            const position = order.indexOf(imageIndex)
            const pose = POSES[Math.min(position, POSES.length - 1)]
            const isTop = position === 0
            const state =
              leafing?.index === imageIndex ? `is-leafing-${leafing.anim}` : ''
            return (
              <div
                key={image.src}
                className={`stack-card ${isTop ? 'is-top' : ''} ${state}`.trim()}
                style={
                  {
                    '--rot': pose.rot,
                    '--tx': pose.x,
                    '--ty': pose.y,
                    '--sc': pose.sc,
                    zIndex: images.length - position,
                  } as CSSProperties
                }
              >
                <img
                  src={image.src}
                  alt={isTop ? image.alt : ''}
                  loading="lazy"
                  className="aspect-[4/5] w-full object-cover"
                />
              </div>
            )
          })}
        </button>

        {/* Big floating chevrons, hanging in the air beside the pile. */}
        <button
          type="button"
          onClick={() => turn('back')}
          aria-label="show the previous photo"
          className="stack-chevron stack-chevron-left left-1 sm:-left-16"
        >
          <svg viewBox="0 0 22 36" className="h-12 sm:h-14">
            <path d="M15.5 5 L7 18 L15.5 31" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => turn('forward')}
          aria-label="show the next photo"
          className="stack-chevron stack-chevron-right right-1 sm:-right-16"
        >
          <svg viewBox="0 0 22 36" className="h-12 sm:h-14">
            <path d="M6.5 5 L15 18 L6.5 31" />
          </svg>
        </button>
      </div>

      <p
        key={top.src}
        className="stack-caption text-xs font-light lowercase italic text-ink/40"
      >
        {top.caption}
      </p>
    </div>
  )
}
