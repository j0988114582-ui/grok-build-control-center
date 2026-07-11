import { describe, expect, it } from 'vitest'
import { densityToStarCount, motionProfile, shouldRenderStatic } from '../src/renderer/src/fx/starfield'

describe('starfield performance contract', () => {
  it('maps density settings to bounded particle budgets', () => {
    expect(densityToStarCount('low')).toBe(600)
    expect(densityToStarCount('medium')).toBe(1000)
    expect(densityToStarCount('high')).toBe(1500)
  })

  it('uses a short cinematic launch before settling into readable motion', () => {
    expect(motionProfile('launch')).toEqual({ speed: 5.5, stretch: 1, flash: 0.9, redshift: 0 })
    expect(motionProfile('idle')).toEqual({ speed: 0.16, stretch: 0.03, flash: 0, redshift: 0 })
    expect(motionProfile('running').speed).toBeGreaterThan(motionProfile('idle').speed)
    expect(motionProfile('error').redshift).toBe(1)
  })

  it('renders one static frame for OS or in-app reduced motion', () => {
    expect(shouldRenderStatic(true, false)).toBe(true)
    expect(shouldRenderStatic(false, true)).toBe(true)
    expect(shouldRenderStatic(false, false)).toBe(false)
  })
})
