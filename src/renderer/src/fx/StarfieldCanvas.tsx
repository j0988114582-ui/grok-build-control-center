import React, { useEffect, useRef, useState } from 'react'
import { createStarfield, shouldRenderStatic, type StarDensity, type StarfieldEngine } from './starfield'

type StarfieldCanvasProps = {
  enabled: boolean
  theme: 'dark' | 'light'
  density: StarDensity
  reducedMotion: boolean
  running: boolean
  connected: boolean
  errorPulse: number
}

export function StarfieldCanvas({ enabled, theme, density, reducedMotion, running, connected, errorPulse }: StarfieldCanvasProps): React.JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<StarfieldEngine | null>(null)
  const launchRef = useRef(true)
  const runningRef = useRef(running)
  const connectedRef = useRef(connected)
  const errorRef = useRef(errorPulse)
  const [osReducedMotion, setOsReducedMotion] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [renderer, setRenderer] = useState<'webgl' | 'canvas2d' | 'none'>('none')
  const staticFrame = shouldRenderStatic(reducedMotion, osReducedMotion)
  const visible = enabled && theme === 'dark'
  runningRef.current = running

  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const update = (): void => setOsReducedMotion(media.matches)
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [])

  useEffect(() => {
    if (!visible || !canvasRef.current) return
    const engine = createStarfield(canvasRef.current, { density, static: staticFrame })
    engineRef.current = engine
    setRenderer(engine.renderer)
    launchRef.current = !staticFrame
    engine.setActivity(staticFrame ? 'idle' : 'launch')
    const launchTimer = window.setTimeout(() => {
      launchRef.current = false
      engine.setActivity(runningRef.current ? 'running' : 'idle')
    }, 1650)
    return () => { window.clearTimeout(launchTimer); engine.destroy(); engineRef.current = null }
  }, [visible, density, staticFrame])

  useEffect(() => {
    if (!launchRef.current) engineRef.current?.setActivity(running ? 'running' : 'idle')
  }, [running])

  useEffect(() => {
    if (!connectedRef.current && connected) engineRef.current?.pulse('connect')
    connectedRef.current = connected
  }, [connected])

  useEffect(() => {
    if (errorPulse > errorRef.current) engineRef.current?.pulse('error')
    errorRef.current = errorPulse
  }, [errorPulse])

  if (!visible) return null
  return <canvas
    ref={canvasRef}
    className="starfield-canvas"
    data-testid="starfield-canvas"
    data-static={String(staticFrame)}
    data-density={density}
    data-renderer={renderer}
    aria-hidden="true"
  />
}
