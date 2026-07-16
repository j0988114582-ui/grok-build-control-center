import React, { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Float } from '@react-three/drei'
import type { Mesh } from 'three'

export type StatusOrbMode = 'idle' | 'running' | 'error' | 'offline'

const COLORS: Record<StatusOrbMode, string> = {
  idle: '#86b987',
  running: '#e9ad47',
  error: '#ef6b61',
  offline: '#5a6572'
}

function OrbMesh({ mode, reducedMotion }: { mode: StatusOrbMode; reducedMotion: boolean }): React.JSX.Element {
  const core = useRef<Mesh>(null)
  const ring = useRef<Mesh>(null)
  const color = COLORS[mode]

  useFrame((_, delta) => {
    if (reducedMotion) return
    if (core.current) {
      const pulse = mode === 'running' ? 1 + Math.sin(performance.now() / 280) * 0.08 : 1
      core.current.scale.setScalar(pulse)
      core.current.rotation.y += delta * (mode === 'running' ? 1.4 : 0.35)
    }
    if (ring.current) {
      ring.current.rotation.z += delta * (mode === 'running' ? 1.8 : 0.45)
      ring.current.rotation.x = Math.PI / 2.4
    }
  })

  return (
    <Float speed={reducedMotion ? 0 : mode === 'running' ? 2.2 : 1} floatIntensity={reducedMotion ? 0 : 0.35} rotationIntensity={0}>
      <mesh ref={core}>
        <icosahedronGeometry args={[0.55, 1]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={mode === 'running' ? 0.85 : 0.35} metalness={0.35} roughness={0.25} />
      </mesh>
      <mesh ref={ring} scale={[1.15, 1.15, 1.15]}>
        <torusGeometry args={[0.72, 0.035, 8, 48]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} transparent opacity={0.75} />
      </mesh>
      <ambientLight intensity={0.55} />
      <pointLight position={[2, 2, 2]} intensity={1.2} color={color} />
    </Float>
  )
}

const canUseWebGL = (): boolean => {
  if (typeof document === 'undefined') return false
  if (typeof WebGLRenderingContext === 'undefined') return false
  // jsdom / vitest: no real WebGL
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return false
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
  } catch {
    return false
  }
}

export function StatusOrb({
  mode,
  reducedMotion = false,
  label,
  onClick,
  className
}: {
  mode: StatusOrbMode
  reducedMotion?: boolean
  label?: string
  onClick?: () => void
  className?: string
}): React.JSX.Element {
  const title = label ?? (mode === 'running' ? 'L2: 執行中' : mode === 'error' ? 'L2: 錯誤' : mode === 'offline' ? 'L2: 離線' : 'L2: 待命')
  const dpr = useMemo(() => (typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1), [])
  const useGl = useMemo(() => canUseWebGL(), [])

  return (
    <button
      type="button"
      className={`status-orb ${className ?? ''} mode-${mode}`}
      data-testid="status-orb"
      data-mode={mode}
      title={title}
      aria-label={title}
      onClick={onClick}
    >
      <span className="status-orb-canvas" aria-hidden>
        {useGl ? (
          <Canvas dpr={dpr} camera={{ position: [0, 0, 2.6], fov: 42 }} gl={{ antialias: true, alpha: true }}>
            <OrbMesh mode={mode} reducedMotion={reducedMotion} />
          </Canvas>
        ) : (
          <StatusOrbCanvasFallback mode={mode} reducedMotion={reducedMotion} />
        )}
      </span>
      <span className="status-orb-label">{title}</span>
    </button>
  )
}

/** Lightweight 2D fallback used in tests / when WebGL is unavailable. */
export function StatusOrbCanvasFallback({
  mode,
  reducedMotion = false
}: {
  mode: StatusOrbMode
  reducedMotion?: boolean
}): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let frame = 0
    let angle = 0
    const color = COLORS[mode]
    const draw = (): void => {
      const { width, height } = canvas
      ctx.clearRect(0, 0, width, height)
      const cx = width / 2
      const cy = height / 2
      const r = Math.min(width, height) * 0.28
      if (!reducedMotion) angle += mode === 'running' ? 0.06 : 0.02
      ctx.strokeStyle = color
      ctx.globalAlpha = 0.45
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.ellipse(cx, cy, r * 1.35, r * 0.55, angle, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
      if (!reducedMotion) frame = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(frame)
  }, [mode, reducedMotion])
  return <canvas ref={ref} width={48} height={48} data-testid="status-orb-fallback" />
}
