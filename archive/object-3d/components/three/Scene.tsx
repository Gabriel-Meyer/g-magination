import {
  AdaptiveDpr,
  AdaptiveEvents,
  OrbitControls,
} from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { CameraRig } from './CameraRig'
import { GlassBlock } from './GlassBlock'
import { Room } from './Room'
import { RopeLight } from './RopeLight'
import { Studio } from './Studio'

export type SceneSetting = 'studio' | 'room'

interface SceneProps {
  /** Rope light on/off. */
  lightOn: boolean
  /** Backdrop: dark gallery studio, or a warm living-room set. */
  setting?: SceneSetting
  /** Honor reduced motion: no auto-rotate, no parallax. */
  reducedMotion?: boolean
  /** Trim sampling/resolution on small or low-power devices. */
  lowPower?: boolean
}

const BLOCK_HEIGHT = 0.4
const TARGET = new THREE.Vector3(0, 0.22, 0)
const IDLE_RESUME_MS = 2500

/**
 * The interactive product scene. Default export so it can be `React.lazy`-loaded
 * — this is the only module that pulls in three.js, keeping the hero featherweight.
 */
export default function Scene({
  lightOn,
  setting = 'studio',
  reducedMotion = false,
  lowPower = false,
}: SceneProps) {
  // Auto-rotate when idle; pause on interaction; resume after a quiet beat.
  const [autoRotate, setAutoRotate] = useState(!reducedMotion)
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setAutoRotate(!reducedMotion)
    return () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current)
    }
  }, [reducedMotion])

  const handleStart = () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current)
    setAutoRotate(false)
  }
  const handleEnd = () => {
    if (reducedMotion) return
    if (resumeTimer.current) clearTimeout(resumeTimer.current)
    resumeTimer.current = setTimeout(() => setAutoRotate(true), IDLE_RESUME_MS)
  }

  return (
    <Canvas
      shadows
      dpr={[1, lowPower ? 1.5 : 2]}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
      }}
      camera={{ position: [2.6, 1.25, 3.1], fov: 35, near: 0.1, far: 100 }}
    >
      <Suspense fallback={null}>
        <CameraRig enabled={!reducedMotion}>
          {/* Lift the product so the block's underside rests on the floor (y=0). */}
          <group position={[0, BLOCK_HEIGHT / 2, 0]}>
            <GlassBlock lowPower={lowPower} />
            <RopeLight on={lightOn} />
          </group>
        </CameraRig>

        {setting === 'room' ? (
          <Room lowPower={lowPower} />
        ) : (
          <Studio lowPower={lowPower} />
        )}
      </Suspense>

      <OrbitControls
        makeDefault
        target={TARGET}
        enablePan={false}
        // Zoom disabled so the wheel/trackpad scrolls the page, not the model.
        enableZoom={false}
        minPolarAngle={0.65}
        maxPolarAngle={1.46}
        autoRotate={autoRotate}
        autoRotateSpeed={0.45}
        rotateSpeed={0.6}
        enableDamping
        dampingFactor={0.06}
        onStart={handleStart}
        onEnd={handleEnd}
      />

      <AdaptiveDpr pixelated />
      <AdaptiveEvents />
    </Canvas>
  )
}
