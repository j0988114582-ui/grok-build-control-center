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
    let recreates = 0
    let webglFailures = 0
    let lastRecreateAt = 0
    const mountAt = performance.now()

    const tearDownEngine = (): void => {
      window.clearTimeout(launchTimer)
      engineRef.current?.destroy()
      engineRef.current = null
    }

    const startEngine = (forceCanvas2d = false): void => {
      if (cancelled || engineRef.current || !hasUsableLayout(canvas)) return
      canvas.style.opacity = '1'
      const engine = createStarfield(canvas, { density, static: staticFrame, theme, forceCanvas2d })
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

    // Self-healing watchdog: a stalled loop must never freeze a frame on screen
    // (cold-start GPU context loss was frozen mid-launch before v0.10).
    const watchdog = window.setInterval(() => {
      if (cancelled) return
      const engine = engineRef.current
      if (!engine) {
        if (hasUsableLayout(canvas)) startEngine()
        return
      }
      const health = engine.getHealth()
      ;(window as unknown as Record<string, unknown>).__grokStarfieldHealth = { ...health, recreates, webglFailures }
      const now = performance.now()
      const stalled =
        (engine.shouldBeAnimating() && now - health.lastFrameAt > 1_600) ||
        (health.renderer !== 'none' && health.frames === 0 && now - mountAt > 1_500) ||
        (health.contextLostAt !== null && now - health.contextLostAt > 3_000)
      if (!stalled) return
      if (engine.revive()) return
      // Cooldown-gated rebuilds, forever — a GPU that keeps killing WebGL on
      // resize gets demoted to the canvas2d engine (cannot context-lose).
      if (now - lastRecreateAt < 4_000) return
      lastRecreateAt = now
      if (health.renderer === 'webgl') webglFailures += 1
      recreates += 1
      tearDownEngine()
      startEngine(webglFailures >= 3)
    }, 2_000)

    return () => {
      cancelled = true
      window.cancelAnimationFrame(rafId)
      window.clearInterval(watchdog)
      ro?.disconnect()
      tearDownEngine()
      setRenderer('none')
    }
  }, [visible, density, staticFrame, theme])

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
