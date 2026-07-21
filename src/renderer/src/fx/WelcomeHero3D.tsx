import React, { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Obsidian prow prism — the Obsidian Voyage welcome centerpiece.
 * Lazy-loaded 3D chunk; callers gate on WebGL availability / reduced motion / dark theme.
 */
function ObsidianPrism(): React.JSX.Element {
  const group = useRef<THREE.Group>(null)
  const ringA = useRef<THREE.Mesh>(null)
  const ringB = useRef<THREE.Mesh>(null)
  const geometry = useMemo(() => new THREE.IcosahedronGeometry(1.02, 0), [])
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry])
  const pointer = useRef({ x: 0, y: 0 })

  useFrame((state, delta) => {
    const node = group.current
    if (!node) return
    pointer.current.x += (state.pointer.x - pointer.current.x) * 0.055
    pointer.current.y += (state.pointer.y - pointer.current.y) * 0.055
    node.rotation.y += delta * 0.22
    node.rotation.x = 0.4 + pointer.current.y * 0.16
    node.rotation.z = pointer.current.x * 0.1
    node.position.y = Math.sin(state.clock.elapsedTime * 0.7) * 0.055
    if (ringA.current) ringA.current.rotation.z += delta * 0.12
    if (ringB.current) ringB.current.rotation.z -= delta * 0.08
  })

  return (
    <group>
      <group ref={group}>
        <mesh geometry={geometry}>
          <meshStandardMaterial color="#0b0f16" metalness={0.92} roughness={0.26} flatShading />
        </mesh>
        <lineSegments geometry={edges}>
          <lineBasicMaterial color="#e9ad47" transparent opacity={0.82} />
        </lineSegments>
      </group>
      <mesh ref={ringA} rotation={[Math.PI / 2.12, 0, 0.42]}>
        <torusGeometry args={[1.58, 0.011, 8, 120]} />
        <meshBasicMaterial color="#e9ad47" transparent opacity={0.5} />
      </mesh>
      <mesh ref={ringB} rotation={[Math.PI / 1.86, 0, -0.52]}>
        <torusGeometry args={[1.82, 0.007, 8, 120]} />
        <meshBasicMaterial color="#7fb4e8" transparent opacity={0.28} />
      </mesh>
    </group>
  )
}

export default function WelcomeHero3D(): React.JSX.Element {
  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
      camera={{ position: [0, 0, 3.6], fov: 38 }}
    >
      <ambientLight intensity={0.4} color="#8fb7de" />
      <directionalLight position={[2.4, 2.2, 2]} intensity={1.2} color="#f5d9a0" />
      <pointLight position={[-1.6, -1.5, 1.7]} intensity={0.85} color="#69b7ff" />
      <ObsidianPrism />
    </Canvas>
  )
}
