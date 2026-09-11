import {
  ContactShadows,
  Environment,
  Lightformer,
  MeshReflectorMaterial,
} from '@react-three/drei'

interface StudioProps {
  lowPower?: boolean
}

/**
 * The dark studio the block sits in: a near-black reflective floor, soft
 * contact shadows, very low ambient fill, and a monochrome environment of dim
 * rim Lightformers that give the glass edges definition without adding colour.
 * The rope light (elsewhere) stays the dominant source.
 */
export function Studio({ lowPower = false }: StudioProps) {
  return (
    <>
      <color attach="background" args={['#050505']} />

      {/* Barely-there fill so the silhouette never goes fully black. */}
      <ambientLight intensity={0.12} color="#cfd2d6" />

      {/* Cool, dim key from above-front for a sculptural edge. */}
      <spotLight
        position={[2.5, 4, 3]}
        angle={0.5}
        penumbra={1}
        intensity={6}
        color="#aab0b8"
        distance={14}
        castShadow
        shadow-mapSize={lowPower ? 1024 : 2048}
        shadow-bias={-0.0004}
      />

      {/* Monochrome environment — only used for glass reflections, never shown. */}
      <Environment resolution={lowPower ? 128 : 256}>
        <color attach="background" args={['#050505']} />
        <Lightformer
          intensity={1.2}
          color="#dfe3e8"
          position={[0, 3, 2]}
          scale={[6, 3, 1]}
        />
        <Lightformer
          intensity={0.6}
          color="#8a8f96"
          position={[-4, 1, -2]}
          scale={[3, 4, 1]}
        />
        <Lightformer
          intensity={0.5}
          color="#8a8f96"
          position={[4, 1, -2]}
          scale={[3, 4, 1]}
        />
      </Environment>

      {/* Reflective near-black floor at y = 0 — the block rests directly on it. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <MeshReflectorMaterial
          mirror={0.5}
          resolution={lowPower ? 512 : 1024}
          mixBlur={8}
          mixStrength={1.2}
          blur={[300, 80]}
          roughness={0.9}
          depthScale={1.1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.2}
          color="#070707"
          metalness={0.55}
        />
      </mesh>

      {/* Soft pool of contact shadow directly under the block. */}
      <ContactShadows
        position={[0, 0.001, 0]}
        scale={6}
        far={3}
        blur={3}
        opacity={0.55}
        resolution={lowPower ? 256 : 512}
        color="#000000"
      />
    </>
  )
}
