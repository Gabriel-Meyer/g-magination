import { MeshReflectorMaterial, RoundedBox } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

interface GlassBlockProps {
  /** Slightly cheaper material on small / low-power devices. */
  lowPower?: boolean
}

// Outer case dimensions — the exact real-world proportions of 150 × 90 × 40 cm.
const W = 1.5 // width  (X)
const H = 0.4 // height (Y)
const D = 0.9 // depth  (Z)
const T = 0.02 // glass wall thickness — 2 cm on every side
const BEVEL = 0.016 // chamfered/rounded corner radius

/**
 * The product: a legless rectangular glass case resting on the floor — a hollow
 * 2 cm-walled vitrine, not a solid block. The rope light is suspended in the
 * empty interior and refracts through the glass.
 *
 * Corner trick: instead of six butt-jointed panels (whose corners never quite
 * meet), the glass is one continuous beveled outer shell with a second inner
 * shell offset inward by the 2 cm wall thickness. Because each shell is a single
 * RoundedBox, every corner aligns perfectly and is softly chamfered like a
 * polished glass edge. Thin refraction `thickness` keeps it reading as glass
 * sheets rather than a solid mass.
 *
 * Built centred on the origin (y ∈ [-H/2, H/2]); the parent group lifts it by
 * H/2 so the base rests on the floor at y = 0.
 */
export function GlassBlock({ lowPower = false }: GlassBlockProps) {
  const material = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#eef1f4'),
        metalness: 0,
        roughness: 0.06,
        transmission: 1,
        thickness: T,
        ior: 1.5,
        attenuationColor: new THREE.Color('#e6eaef'),
        attenuationDistance: 6,
        clearcoat: lowPower ? 0 : 0.85,
        clearcoatRoughness: 0.1,
        envMapIntensity: 1.15,
        specularIntensity: 1,
        transparent: true,
        side: THREE.DoubleSide,
      }),
    [lowPower],
  )
  useEffect(() => () => material.dispose(), [material])

  return (
    <group>
      {/* Outer shell — single beveled box, so all corners meet perfectly. */}
      <RoundedBox
        args={[W, H, D]}
        radius={BEVEL}
        smoothness={5}
        steps={1}
        material={material}
        castShadow
        receiveShadow
      />

      {/* Inner cavity wall, inset by the 2 cm wall thickness, so the hollow
          interior and the real wall depth read clearly. */}
      <RoundedBox
        args={[W - T * 2, H - T * 2, D - T * 2]}
        radius={Math.max(0.004, BEVEL - T)}
        smoothness={5}
        steps={1}
        material={material}
      />

      {/* Mirrored base panel — a dark mirror just above the inner floor that
          reflects the coil and doubles the light. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -H / 2 + T + 0.002, 0]}
      >
        <planeGeometry args={[W - T * 2, D - T * 2]} />
        <MeshReflectorMaterial
          mirror={1}
          resolution={lowPower ? 512 : 1024}
          mixBlur={0}
          mixStrength={3}
          blur={[0, 0]}
          roughness={0.02}
          metalness={1}
          color="#d8dadd"
        />
      </mesh>
    </group>
  )
}
