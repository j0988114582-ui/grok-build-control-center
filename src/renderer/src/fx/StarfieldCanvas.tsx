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

/** Minimum laid-out size before WebGL/2d init (avoids 1×1 iron-gray cold start). */
const MIN_LAYOUT_PX = 8

function hasUsableLayout(canvas: HTMLCanvasElement): boolean {
  return canvas.clientWidth >= MIN_LAYOUT_PX && canvas.clientHeight >= MIN_LAYOUT_PX
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

  // Defer engine create until canvas has real layout size (cold-start 1×1 → flat iron gray).
  useEffect(() => {
    if (!visible) {
      engineRef.current?.destroy()
      engineRef.current = null
      setRenderer('none')
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return

    let cancelled = false
    let launchTimer = 0
    let rafId = 0
    let ro: ResizeObserver | null = null

    const tearDownEngine = (): void => {
      window.clearTimeout(launchTimer)
      engineRef.current?.destroy()
      engineRef.current = null
    }

    const startEngine = (): void => {
      if (cancelled || engineRef.current || !hasUsableLayout(canvas)) return
      const engine = createStarfield(canvas, { density, static: staticFrame })
      engineRef.current = engine
      setRenderer(engine.renderer)
      launchRef.current = !staticFrame
      engine.setActivity(staticFrame ? 'idle' : 'launch')
      launchTimer = window.setTimeout(() => {
        if (cancelled) return
        launchRef.current = false
        engine.setActivity(runningRef.current ? 'running' : 'idle')
      }, 1650)
    }

    const tryStart = (): void => {
      if (cancelled) return
      if (hasUsableLayout(canvas)) {
        startEngine()
        return
      }
      // Layout not ready: retry next frame (first paint / Electron shell).
      rafId = window.requestAnimationFrame(tryStart)
    }

    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        if (cancelled) return
        if (engineRef.current) return
        if (hasUsableLayout(canvas)) startEngine()
      })
      ro.observe(canvas)
    }

    // Double-rAF: wait one frame for CSS absolute inset sizing after mount.
    rafId = window.requestAnimationFrame(() => {
      rafId = window.requestAnimationFrame(tryStart)
    })

    return () => {
      cancelled = true
      window.cancelAnimationFrame(rafId)
      ro?.disconnect()
      tearDownEngine()
      setRenderer('none')
    }
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
