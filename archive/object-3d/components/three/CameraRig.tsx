import { useFrame } from '@react-three/fiber'
import type { ReactNode } from 'react'
import { useRef } from 'react'
import type { Group } from 'three'
import * as THREE from 'three'

interface CameraRigProps {
  children: ReactNode
  /** Disable the parallax tilt (reduced motion). */
  enabled?: boolean
  /** Maximum tilt in radians. */
  amount?: number
}

/**
 * Wraps the scene in a group that eases a subtle tilt toward the pointer,
 * giving a gentle parallax on mouse move. It tilts the *scene*, not the camera,
 * so it never fights OrbitControls. No-op (and re-centred) when disabled.
 */
export function CameraRig({
  children,
  enabled = true,
  amount = 0.06,
}: CameraRigProps) {
  const groupRef = useRef<Group>(null)

  useFrame((state, delta) => {
    const group = groupRef.current
    if (!group) return

    const k = 1 - Math.pow(0.0025, delta) // frame-rate independent ease
    const targetX = enabled ? -state.pointer.y * amount : 0
    const targetY = enabled ? state.pointer.x * amount : 0

    group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, targetX, k)
    group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, targetY, k)
  })

  return <group ref={groupRef}>{children}</group>
}
