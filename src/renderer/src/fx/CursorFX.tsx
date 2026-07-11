import React, { useEffect, useMemo, useRef } from 'react'
import { createNovaParticles, magneticOffset, shouldEnableCursorFx, shouldRunCursorFrame, type NovaParticle, type NovaTone } from './cursor'

type LiveParticle = NovaParticle & { ageMs: number }

export function CursorFX({ enabled, reducedMotion, coarsePointer }: { enabled: boolean; reducedMotion: boolean; coarsePointer?: boolean }): React.JSX.Element | null {
  const inferredCoarse = useMemo(() => coarsePointer ?? window.matchMedia?.('(pointer: coarse)').matches ?? false, [coarsePointer])
  const active = shouldEnableCursorFx({ enabled, reducedMotion, coarsePointer: inferredCoarse })
  const trailRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!active) return
    const trail = trailRef.current
    const canvas = canvasRef.current
    if (!trail || !canvas) return

    const context = canvas.getContext('2d')
    let targetX = window.innerWidth / 2
    let targetY = window.innerHeight / 2
    let currentX = targetX
    let currentY = targetY
    let previousTime = performance.now()
    let frame = 0
    let particles: LiveParticle[] = []
    let magneticElement: HTMLElement | null = null

    const resize = (): void => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr))
      canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr))
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      context?.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const releaseMagnet = (): void => {
      if (magneticElement) magneticElement.style.removeProperty('--magnetic-transform')
      magneticElement = null
    }

    const move = (event: PointerEvent): void => {
      targetX = event.clientX
      targetY = event.clientY
      trail.dataset.visible = 'true'
      const candidate = (event.target as Element | null)?.closest<HTMLElement>('[data-magnetic]') ?? null
      if (candidate !== magneticElement) releaseMagnet()
      magneticElement = candidate
      if (candidate) {
        const offset = magneticOffset({ x: event.clientX, y: event.clientY }, candidate.getBoundingClientRect())
        candidate.style.setProperty('--magnetic-transform', `translate3d(${offset.x}px, ${offset.y}px, 0)`)
      }
    }

    const burst = (event: PointerEvent): void => {
      const target = (event.target as Element | null)?.closest<HTMLElement>('[data-nova-tone]')
      const tone = (target?.dataset.novaTone as NovaTone | undefined) ?? 'neutral'
      particles.push(...createNovaParticles(event.clientX, event.clientY, tone).map((particle) => ({ ...particle, ageMs: 0 })))
    }

    const draw = (time: number): void => {
      const delta = Math.min(32, time - previousTime)
      previousTime = time
      currentX += (targetX - currentX) * 0.22
      currentY += (targetY - currentY) * 0.22
      trail.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`

      if (context) {
        context.clearRect(0, 0, window.innerWidth, window.innerHeight)
        particles = particles.flatMap((particle) => {
          const ageMs = particle.ageMs + delta
          if (ageMs >= particle.lifeMs) return []
          const progress = ageMs / particle.lifeMs
          const next = { ...particle, ageMs, x: particle.x + particle.vx * delta * 0.07, y: particle.y + particle.vy * delta * 0.07 }
          context.globalAlpha = 1 - progress
          context.fillStyle = particle.color
          context.beginPath()
          context.arc(next.x, next.y, Math.max(0.2, particle.size * (1 - progress)), 0, Math.PI * 2)
          context.fill()
          return [next]
        })
        context.globalAlpha = 1
      }
      frame = shouldRunCursorFrame(active, document.hidden) ? window.requestAnimationFrame(draw) : 0
    }

    const visibility = (): void => {
      if (!shouldRunCursorFrame(active, document.hidden)) {
        if (frame) window.cancelAnimationFrame(frame)
        frame = 0
        return
      }
      if (!frame && typeof window.requestAnimationFrame === 'function') {
        previousTime = performance.now()
        frame = window.requestAnimationFrame(draw)
      }
    }

    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerdown', burst, { passive: true })
    document.addEventListener('visibilitychange', visibility)
    document.documentElement.dataset.cursorFx = 'true'
    visibility()
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', burst)
      document.removeEventListener('visibilitychange', visibility)
      releaseMagnet()
      delete document.documentElement.dataset.cursorFx
    }
  }, [active])

  if (!active) return null
  return <div className="cursor-fx" data-testid="cursor-fx" aria-hidden="true">
    <canvas ref={canvasRef} className="cursor-nova-layer" />
    <div ref={trailRef} className="cursor-trail" />
  </div>
}
