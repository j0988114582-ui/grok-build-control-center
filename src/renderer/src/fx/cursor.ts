export type CursorFxDecision = { enabled: boolean; reducedMotion: boolean; coarsePointer: boolean }
export type NovaTone = 'primary' | 'danger' | 'neutral'
export type NovaParticle = { x: number; y: number; vx: number; vy: number; size: number; lifeMs: number; color: string }
export type RectLike = { left: number; top: number; width: number; height: number }

const NOVA_COLORS: Record<NovaTone, string> = {
  primary: '#e9ad47',
  danger: '#ef6b61',
  neutral: '#93c7e7'
}

export const shouldEnableCursorFx = (decision: CursorFxDecision): boolean =>
  decision.enabled && !decision.reducedMotion && !decision.coarsePointer

export const shouldRunCursorFrame = (active: boolean, documentHidden: boolean): boolean => active && !documentHidden

export const createNovaParticles = (x: number, y: number, tone: NovaTone, random = Math.random): NovaParticle[] => {
  const count = 8 + Math.floor(random() * 5)
  return Array.from({ length: count }, (_value, index) => {
    const angle = (index / count) * Math.PI * 2 + (random() - 0.5) * 0.2
    const speed = 1.8 + random() * 2.2
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 1.4 + random() * 1.8,
      lifeMs: 400,
      color: NOVA_COLORS[tone]
    }
  })
}

export const magneticOffset = (pointer: { x: number; y: number }, rect: RectLike): { x: number; y: number } => {
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  const dx = pointer.x - centerX
  const dy = pointer.y - centerY
  if (Math.hypot(dx, dy) > 24) return { x: 0, y: 0 }
  return {
    x: Math.max(-6, Math.min(6, dx * 0.5)),
    y: Math.max(-6, Math.min(6, dy * 0.5))
  }
}
