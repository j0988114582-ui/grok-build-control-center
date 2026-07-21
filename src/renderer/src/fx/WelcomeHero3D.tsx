import React, { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment } from '@react-three/drei'
import * as THREE from 'three'

/**
 * Obsidian prow prism — Obsidian Voyage welcome centerpiece (concept 02 finish).
 * Physical black-gem material with a procedural studio environment (no network):
 * a warm champagne softbox + cool ice strip reflect off the facets so it reads
 * as polished obsidian, not a wireframe. Lazy 3D chunk; callers gate WebGL/motion.
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
          <meshPhysicalMaterial
            color="#05070d"
            metalness={0.9}
            roughness={0.16}
            clearcoat={1}
            clearcoatRoughness={0.14}
            envMapIntensity={1.7}
            flatShading
          />
        </mesh>
        <lineSegments geometry={edges}>
          <lineBasicMaterial color="#e9ad47" transparent opacity={0.38} />
        </lineSegments>
      </group>
      <mesh ref={ringA} rotation={[Math.PI / 2.12, 0, 0.42]}>
        <torusGeometry args={[1.58, 0.011, 8, 120]} />
        <meshStandardMaterial color="#e9ad47" metalness={1} roughness={0.28} envMapIntensity={1.4} transparent opacity={0.85} />
      </mesh>
      <mesh ref={ringB} rotation={[Math.PI / 1.86, 0, -0.52]}>
        <torusGeometry args={[1.82, 0.007, 8, 120]} />
        <meshBasicMaterial color="#7fb4e8" transparent opacity={0.26} />
      </mesh>
    </group>
  )
}

/** Offline studio: dark void + champagne key softbox + gold kicker + ice strip. */
function StudioEnvironment(): React.JSX.Element {
  return (
    <Environment resolution={128} frames={1}>
      <mesh scale={30}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial color="#04060c" side={THREE.BackSide} />
      </mesh>
      <mesh position={[4, 5, 3]} rotation={[-0.6, -0.4, 0]}>
        <planeGeometry args={[7, 5]} />
        <meshBasicMaterial color="#fff0d2" />
      </mesh>
      <mesh position={[-3, -2, 4]} rotation={[0.3, 0.5, 0]}>
        <planeGeometry args={[2.2, 7]} />
        <meshBasicMaterial color="#6fa8dc" />
      </mesh>
      <mesh position={[0, -5, -3]} rotation={[1.2, 0, 0]}>
        <planeGeometry args={[8, 2]} />
        <meshBasicMaterial color="#a8792e" />
      </mesh>
    </Environment>
  )
}

export default function WelcomeHero3D(): React.JSX.Element {
  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
      camera={{ position: [0, 0, 3.6], fov: 38 }}
    >
      <StudioEnvironment />
      <ambientLight intensity={0.22} color="#8fb7de" />
      <directionalLight position={[2.4, 2.2, 2]} intensity={1.0} color="#f5d9a0" />
      <pointLight position={[-1.6, -1.5, 1.7]} intensity={0.7} color="#69b7ff" />
      <ObsidianPrism />
    </Canvas>
  )
}
