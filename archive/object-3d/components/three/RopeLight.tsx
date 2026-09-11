import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { createCoil, mulberry32 } from '../../lib/coil'

const WARM = '#fff2d0'
const RADIUS = 0.03 // thick warm neon filament
const BOUNDS = { x: 0.66, y: 0.14, z: 0.38 }

interface RopeLightProps {
  /** Whether the rope light is glowing. Eased in useFrame. */
  on: boolean
}

/**
 * The serpentine rope light inside the glass case: one continuous neon tube,
 * densely coiled to fill the interior (see createCoil), glowing warm-white. It
 * is a static shape — no physics — randomized per page load. Point lights
 * threaded along it are the dominant source lighting the glass and floor;
 * emissive + light intensity ease toward the on/off state for a filmic toggle.
 */
export function RopeLight({ on }: RopeLightProps) {
  // Seed from the current time so each visit gets a distinct, stable coil.
  const seed = useMemo(() => (Date.now() & 0xffffffff) >>> 0 || 1, [])
  const curve = useMemo(() => createCoil(seed, BOUNDS, 260), [seed])

  const geometry = useMemo(
    () => new THREE.TubeGeometry(curve, 420, RADIUS, 12, false),
    [curve],
  )
  useEffect(() => () => geometry.dispose(), [geometry])

  // Spread the point lights out toward the eight interior corners of the case
  // (with a little seeded jitter) so the glow reaches the corners and lights the
  // whole cavity evenly, instead of clustering where the rope happens to sample.
  const lightPoints = useMemo(() => {
    const rand = mulberry32((seed ^ 0x9e3779b9) >>> 0)
    const f = 0.82
    const pts: THREE.Vector3[] = []
    for (const sx of [-1, 1])
      for (const sy of [-1, 1])
        for (const sz of [-1, 1])
          pts.push(
            new THREE.Vector3(
              sx * BOUNDS.x * f + (rand() - 0.5) * 0.08,
              sy * BOUNDS.y * f + (rand() - 0.5) * 0.04,
              sz * BOUNDS.z * f + (rand() - 0.5) * 0.08,
            ),
          )
    return pts
  }, [seed])
  const ends = useMemo(() => [curve.getPoint(0), curve.getPoint(1)], [curve])

  const materialRef = useRef<THREE.MeshStandardMaterial>(null)
  const capRefs = useRef<THREE.MeshStandardMaterial[]>([])
  const lightsRef = useRef<THREE.PointLight[]>([])

  useFrame((_, delta) => {
    const k = 1 - Math.pow(0.0015, delta) // frame-rate independent lerp
    const targetEmissive = on ? 3.6 : 0.04
    const targetLight = on ? 1.3 : 0.0 // 8 corner lights → lower per-light

    const mat = materialRef.current
    if (mat)
      mat.emissiveIntensity = THREE.MathUtils.lerp(
        mat.emissiveIntensity,
        targetEmissive,
        k,
      )
    for (const cap of capRefs.current)
      if (cap)
        cap.emissiveIntensity = THREE.MathUtils.lerp(
          cap.emissiveIntensity,
          targetEmissive,
          k,
        )
    for (const light of lightsRef.current)
      if (light)
        light.intensity = THREE.MathUtils.lerp(light.intensity, targetLight, k)
  })

  return (
    <group>
      {/* The filament. */}
      <mesh geometry={geometry} castShadow>
        <meshStandardMaterial
          ref={materialRef}
          color="#1c1a14"
          emissive={WARM}
          emissiveIntensity={on ? 3.6 : 0.04}
          roughness={0.4}
          metalness={0}
          toneMapped={false}
        />
      </mesh>

      {/* Glowing rounded end caps. */}
      {ends.map((p, i) => (
        <mesh key={`cap-${i}`} position={[p.x, p.y, p.z]}>
          <sphereGeometry args={[RADIUS * 1.4, 16, 16]} />
          <meshStandardMaterial
            ref={(el) => {
              if (el) capRefs.current[i] = el
            }}
            color="#1c1a14"
            emissive={WARM}
            emissiveIntensity={on ? 3.6 : 0.04}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* The dominant light source — warm point lights pushed into the eight
          interior corners so the whole cavity glows. */}
      {lightPoints.map((p, i) => (
        <pointLight
          key={`pl-${i}`}
          ref={(el) => {
            if (el) lightsRef.current[i] = el
          }}
          position={[p.x, p.y, p.z]}
          color={WARM}
          intensity={on ? 1.3 : 0}
          distance={2.8}
          decay={2}
        />
      ))}
    </group>
  )
}
