import * as THREE from 'three'

const TAU = Math.PI * 2

/** Tiny deterministic PRNG (mulberry32) — seed it to vary the coil per load. */
export function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface CoilBounds {
  x: number
  y: number
  z: number
}

/**
 * Builds one wandering axis as a sum of three sine octaves with seeded
 * frequencies and phases — organic, not a clean sinusoid.
 */
function makeAxis(rand: () => number, base: number): (t: number) => number {
  const octaves = [
    { f: base * (0.8 + 0.5 * rand()), a: 1.0, p: rand() * TAU },
    { f: base * (1.9 + 0.7 * rand()), a: 0.55, p: rand() * TAU },
    { f: base * (3.4 + 1.0 * rand()), a: 0.3, p: rand() * TAU },
  ]
  return (t) => octaves.reduce((s, o) => s + o.a * Math.sin(o.f * t + o.p), 0)
}

/** Generate raw (un-normalised) coil samples for one seed. */
function rawCoil(rand: () => number, points: number): THREE.Vector3[] {
  const fx = makeAxis(rand, 3.0)
  const fy = makeAxis(rand, 6.5)
  const fz = makeAxis(rand, 4.5)
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= points; i++) {
    const t = (i / points) * TAU
    pts.push(new THREE.Vector3(fx(t), fy(t), fz(t)))
  }
  return pts
}

/**
 * Stretch each axis independently to fill the interior bounds (min → -bound,
 * max → +bound), so the coil actually reaches the walls instead of hovering
 * near the centre. `margin` keeps a small gap so the thick tube never pokes out.
 */
function fillBounds(pts: THREE.Vector3[], bounds: CoilBounds, margin = 0.96) {
  const axes: (keyof CoilBounds)[] = ['x', 'y', 'z']
  for (const ax of axes) {
    let min = Infinity
    let max = -Infinity
    for (const p of pts) {
      if (p[ax] < min) min = p[ax]
      if (p[ax] > max) max = p[ax]
    }
    const range = max - min || 1e-5
    const limit = bounds[ax] * margin
    for (const p of pts) {
      p[ax] = THREE.MathUtils.lerp(-limit, limit, (p[ax] - min) / range)
    }
  }
}

/**
 * Coverage score: how many cells of a voxel grid the coil passes through.
 * Higher = the coil is spread more evenly through the whole volume. Used to
 * reward well-distributed candidates over ones that bunch up in one region.
 */
function coverageScore(pts: THREE.Vector3[], bounds: CoilBounds, res = 7): number {
  const seen = new Set<number>()
  for (const p of pts) {
    const ix = Math.min(res - 1, Math.max(0, Math.floor(((p.x / bounds.x + 1) / 2) * res)))
    const iy = Math.min(res - 1, Math.max(0, Math.floor(((p.y / bounds.y + 1) / 2) * res)))
    const iz = Math.min(res - 1, Math.max(0, Math.floor(((p.z / bounds.z + 1) / 2) * res)))
    seen.add((ix * res + iy) * res + iz)
  }
  return seen.size
}

/**
 * A single continuous neon tube densely coiled to fill the interior of the glass
 * case — the look from the reference photos. Each candidate is stretched to span
 * the whole box, then several seeds are generated and the best-distributed one
 * (most voxels covered) is kept, so the coil reliably spreads through the volume
 * rather than bunching up. Seeded, so each page load is distinct but stable.
 */
export function createCoil(
  seed = 1,
  bounds: CoilBounds = { x: 0.66, y: 0.14, z: 0.38 },
  points = 500,
): THREE.CatmullRomCurve3 {
  let best: THREE.Vector3[] | null = null
  let bestScore = -1

  for (let k = 0; k < 8; k++) {
    const s = (seed + k * 0x9e3779b9) >>> 0 || 1
    const pts = rawCoil(mulberry32(s), points)
    fillBounds(pts, bounds)
    const score = coverageScore(pts, bounds)
    if (score > bestScore) {
      bestScore = score
      best = pts
    }
  }

  return new THREE.CatmullRomCurve3(best!, false, 'catmullrom', 0.5)
}
