import React, { useEffect, useRef } from 'react'

export type StatusOrbMode = 'idle' | 'running' | 'error' | 'offline'

const LABELS: Record<StatusOrbMode, string> = {
  idle: '待命',
  running: '執行中',
  error: '錯誤',
  offline: '離線'
}

/** Lightweight canvas ring — no WebGL (avoids GPU cache / disk errors looking broken). */
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
    const colors: Record<StatusOrbMode, string> = {
      idle: '#86b987',
      running: '#e9ad47',
      error: '#ef6b61',
      offline: '#6b7582'
    }
    const color = colors[mode]
    const draw = (): void => {
      const { width, height } = canvas
      ctx.clearRect(0, 0, width, height)
      const cx = width / 2
      const cy = height / 2
      const r = Math.min(width, height) * 0.28
      if (!reducedMotion) angle += mode === 'running' ? 0.05 : 0.015
      // soft halo
      const grad = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.6)
      grad.addColorStop(0, color)
      grad.addColorStop(1, 'transparent')
      ctx.globalAlpha = 0.25
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
      // orbit ring
      ctx.strokeStyle = color
      ctx.globalAlpha = 0.45
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.ellipse(cx, cy, r * 1.25, r * 0.48, angle, 0, Math.PI * 2)
      ctx.stroke()
      // core
      ctx.globalAlpha = 1
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.beginPath()
      ctx.arc(cx - r * 0.25, cy - r * 0.25, r * 0.35, 0, Math.PI * 2)
      ctx.fill()
      if (!reducedMotion) frame = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(frame)
  }, [mode, reducedMotion])
  return <canvas ref={ref} width={48} height={48} data-testid="status-orb-fallback" />
}

/**
 * Compact L2 status pill — CSS + 2D canvas only (no R3F/WebGL).
 * Cleaner in titlebar; survives GPU disk-cache issues on Windows.
 */
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
  const displayLabel = label ?? LABELS[mode]
  const title = label ?? `狀態 · ${LABELS[mode]}`
  const body = (
    <>
      <span className="status-orb-canvas" aria-hidden>
        <StatusOrbCanvasFallback mode={mode} reducedMotion={reducedMotion} />
      </span>
      <span className="status-orb-label">{displayLabel}</span>
    </>
  )
  if (onClick) {
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
        {body}
      </button>
    )
  }
  return (
    <div
      className={`status-orb ${className ?? ''} mode-${mode}`}
      data-testid="status-orb"
      data-mode={mode}
      title={title}
      aria-label={title}
      role="status"
    >
      {body}
    </div>
  )
}
