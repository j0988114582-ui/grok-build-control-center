// @vitest-environment jsdom
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CursorFX } from '../src/renderer/src/fx/CursorFX'
import { createNovaParticles, magneticOffset, shouldEnableCursorFx, shouldRunCursorFrame } from '../src/renderer/src/fx/cursor'

describe('cursor effects', () => {
  afterEach(cleanup)

  it('stays off when the setting or reduced-motion disables decoration', () => {
    expect(shouldEnableCursorFx({ enabled: false, reducedMotion: false, coarsePointer: false })).toBe(false)
    expect(shouldEnableCursorFx({ enabled: true, reducedMotion: true, coarsePointer: false })).toBe(false)
    expect(shouldEnableCursorFx({ enabled: true, reducedMotion: false, coarsePointer: true })).toBe(false)
    expect(shouldEnableCursorFx({ enabled: true, reducedMotion: false, coarsePointer: false })).toBe(true)
    expect(shouldRunCursorFrame(true, false)).toBe(true)
    expect(shouldRunCursorFrame(true, true)).toBe(false)
    expect(shouldRunCursorFrame(false, false)).toBe(false)
  })

  it('creates a bounded semantic nova burst', () => {
    const particles = createNovaParticles(100, 80, 'danger', () => 0.5)

    expect(particles).toHaveLength(10)
    expect(particles.every((particle) => particle.color === '#ef6b61')).toBe(true)
    expect(particles.every((particle) => particle.lifeMs === 400)).toBe(true)
    expect(particles[0]).toMatchObject({ x: 100, y: 80 })
  })

  it('caps magnetic movement to a subtle six pixels', () => {
    expect(magneticOffset({ x: 124, y: 100 }, { left: 100, top: 88, width: 24, height: 24 })).toEqual({ x: 6, y: 0 })
    expect(magneticOffset({ x: 200, y: 200 }, { left: 100, top: 88, width: 24, height: 24 })).toEqual({ x: 0, y: 0 })
  })

  it('does not render a pointer layer when motion is reduced', () => {
    const { rerender } = render(<CursorFX enabled reducedMotion />)
    expect(screen.queryByTestId('cursor-fx')).not.toBeInTheDocument()

    rerender(<CursorFX enabled reducedMotion={false} coarsePointer={false} />)
    expect(screen.getByTestId('cursor-fx')).toBeInTheDocument()
  })
})
