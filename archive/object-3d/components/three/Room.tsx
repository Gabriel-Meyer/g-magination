import {
  ContactShadows,
  Environment,
  Lightformer,
  useTexture,
} from '@react-three/drei'
import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react'
import * as THREE from 'three'

interface RoomProps {
  lowPower?: boolean
}

// Drop the rug image here (the Iznik/Persian texture). Falls back to a
// procedurally-drawn rug if the file is missing.
const RUG_TEXTURE_URL = '/textures/persian-rug.png'
const RUG_TRANSFORM = {
  rotation: [-Math.PI / 2, 0, 0] as [number, number, number],
  position: [0, 0.004, 0.2] as [number, number, number],
  // Portrait-ish to suit the medallion image (long axis runs into the room).
  size: [3.2, 4.6] as [number, number],
}

const WALL = '#cdbfa8'
const FLOOR = '#43392f'

/**
 * A warm, designer living-room setting for the "in context" view: a wood floor,
 * a patterned Persian rug, a back wall, a Togo-style armless lounge, and a floor
 * lamp that actually lights the room. Built entirely from primitives + a
 * procedural rug texture (no external assets) so it always loads. The glass
 * piece sits at the origin, acting as an accent light on the rug.
 */
export function Room({ lowPower = false }: RoomProps) {
  const rug = useMemo(() => makePersianRugTexture(), [])
  useEffect(() => () => rug.dispose(), [rug])

  return (
    <>
      <color attach="background" args={['#2a241e']} />

      {/* Warm room lighting. */}
      <ambientLight intensity={0.55} color="#fff1dd" />
      <directionalLight
        position={[3.5, 6, 3]}
        intensity={1.1}
        color="#fff0d8"
        castShadow
        shadow-mapSize={lowPower ? 1024 : 2048}
        shadow-bias={-0.0004}
      />

      {/* Warm environment for glass + mirror reflections (not shown). The
          overhead white panel gives the glass a clean white ceiling reflection. */}
      <Environment resolution={lowPower ? 128 : 256}>
        <Lightformer
          form="rect"
          intensity={1.8}
          color="#ffffff"
          position={[0, 5.6, 0]}
          scale={[7, 7, 1]}
        />
        <Lightformer
          intensity={1.0}
          color="#fff2d8"
          position={[0, 4, 3]}
          scale={[8, 4, 1]}
        />
        <Lightformer
          intensity={0.6}
          color="#bfae93"
          position={[-4, 2, -3]}
          scale={[4, 5, 1]}
        />
        <Lightformer
          intensity={0.6}
          color="#bfae93"
          position={[4, 2, -3]}
          scale={[4, 5, 1]}
        />
      </Environment>

      {/* Floor + back wall. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color={FLOOR} roughness={0.9} />
      </mesh>
      <mesh position={[0, 5, -4]} receiveShadow>
        <planeGeometry args={[40, 14]} />
        <meshStandardMaterial color={WALL} roughness={1} />
      </mesh>

      {/* White ceiling — encloses the room and gives clean white reflections. */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 6, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#f2efe9" roughness={0.85} side={THREE.DoubleSide} />
      </mesh>

      {/* Persian rug under the piece — image texture if present, else the
          procedurally-drawn rug. */}
      <RugErrorBoundary fallback={<ProceduralRug texture={rug} />}>
        <Suspense fallback={<ProceduralRug texture={rug} />}>
          <TexturedRug />
        </Suspense>
      </RugErrorBoundary>

      {/* Floor lamp to the side — a real warm source. */}
      <group position={[2.9, 0, 1.0]}>
        <mesh position={[0, 0.03, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.22, 0.06, 24]} />
          <meshStandardMaterial
            color="#2b2620"
            roughness={0.6}
            metalness={0.4}
          />
        </mesh>
        <mesh position={[0, 1.0, 0]} castShadow>
          <cylinderGeometry args={[0.018, 0.018, 1.95, 12]} />
          <meshStandardMaterial
            color="#2b2620"
            roughness={0.5}
            metalness={0.5}
          />
        </mesh>
        <mesh position={[0, 1.95, 0]}>
          <cylinderGeometry args={[0.2, 0.28, 0.36, 24, 1, true]} />
          <meshStandardMaterial
            color="#f3e6c8"
            emissive="#ffdca0"
            emissiveIntensity={0.8}
            roughness={0.7}
            side={THREE.DoubleSide}
          />
        </mesh>
        <pointLight
          position={[0, 1.85, 0]}
          intensity={6}
          color="#ffd9a0"
          distance={9}
          decay={2}
          castShadow={!lowPower}
        />
      </group>

      {/* Soft contact shadow grounding the piece on the rug. */}
      <ContactShadows
        position={[0, 0.006, 0]}
        scale={6}
        far={3}
        blur={2.6}
        opacity={0.4}
        resolution={lowPower ? 256 : 512}
        color="#000000"
      />
    </>
  )
}

/** Rug rendered from the image texture at RUG_TEXTURE_URL (suspends to load). */
function TexturedRug() {
  const tex = useTexture(RUG_TEXTURE_URL)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return (
    <mesh
      rotation={RUG_TRANSFORM.rotation}
      position={RUG_TRANSFORM.position}
      receiveShadow
    >
      <planeGeometry args={RUG_TRANSFORM.size} />
      <meshStandardMaterial map={tex} roughness={0.95} />
    </mesh>
  )
}

/** Fallback rug drawn procedurally, used while loading or if the image is absent. */
function ProceduralRug({ texture }: { texture: THREE.Texture }) {
  return (
    <mesh
      rotation={RUG_TRANSFORM.rotation}
      position={RUG_TRANSFORM.position}
      receiveShadow
    >
      <planeGeometry args={RUG_TRANSFORM.size} />
      <meshStandardMaterial map={texture} roughness={0.95} />
    </mesh>
  )
}

/** Swaps to the procedural rug if the image texture fails to load (missing file). */
class RugErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** Draws a stylised Persian rug into a canvas and returns it as a texture. */
function makePersianRugTexture(): THREE.CanvasTexture {
  const W = 600
  const H = 400
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')!

  const RED = '#7c2f24'
  const NAVY = '#21426b'
  const CREAM = '#d8c49a'
  const RUST = '#9c3b2e'

  // Field.
  g.fillStyle = RED
  g.fillRect(0, 0, W, H)

  // Nested border bands.
  const bands = [
    { w: 8, c: CREAM },
    { w: 22, c: NAVY },
    { w: 8, c: CREAM },
    { w: 30, c: RUST },
    { w: 8, c: CREAM },
  ]
  let inset = 0
  for (const b of bands) {
    g.strokeStyle = b.c
    g.lineWidth = b.w
    g.strokeRect(
      inset + b.w / 2,
      inset + b.w / 2,
      W - inset * 2 - b.w,
      H - inset * 2 - b.w,
    )
    inset += b.w
  }

  // Guard motifs along the main (navy) border.
  g.fillStyle = CREAM
  for (let x = 24; x < W - 24; x += 28) {
    diamond(g, x, 19, 5)
    diamond(g, x, H - 19, 5)
  }
  for (let y = 24; y < H - 24; y += 28) {
    diamond(g, 19, y, 5)
    diamond(g, W - 19, y, 5)
  }

  // Field lattice of small motifs.
  g.fillStyle = CREAM
  for (let x = inset + 30; x < W - inset - 20; x += 56) {
    for (let y = inset + 30; y < H - inset - 20; y += 56) {
      diamond(g, x, y, 7)
      g.fillStyle = NAVY
      diamond(g, x, y, 3)
      g.fillStyle = CREAM
    }
  }

  // Central medallion — layered diamonds with hooks.
  const cx = W / 2
  const cy = H / 2
  g.fillStyle = CREAM
  diamond(g, cx, cy, 78)
  g.fillStyle = NAVY
  diamond(g, cx, cy, 58)
  g.fillStyle = RUST
  diamond(g, cx, cy, 40)
  g.fillStyle = CREAM
  diamond(g, cx, cy, 18)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function diamond(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath()
  g.moveTo(x, y - r)
  g.lineTo(x + r, y)
  g.lineTo(x, y + r)
  g.lineTo(x - r, y)
  g.closePath()
  g.fill()
}
