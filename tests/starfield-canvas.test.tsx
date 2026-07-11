// @vitest-environment jsdom
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StarfieldCanvas } from '../src/renderer/src/fx/StarfieldCanvas'

describe('StarfieldCanvas', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks() })

  it('does not allocate a canvas when galaxy effects are off or theme is light', () => {
    const { rerender } = render(<StarfieldCanvas enabled={false} theme="dark" density="medium" reducedMotion={false} running={false} connected={false} errorPulse={0} />)
    expect(screen.queryByTestId('starfield-canvas')).not.toBeInTheDocument()
    rerender(<StarfieldCanvas enabled theme="light" density="medium" reducedMotion={false} running={false} connected={false} errorPulse={0} />)
    expect(screen.queryByTestId('starfield-canvas')).not.toBeInTheDocument()
  })

  it('marks a reduced-motion galaxy as static and keeps it pointer transparent', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    render(<StarfieldCanvas enabled theme="dark" density="low" reducedMotion running={false} connected={false} errorPulse={0} />)
    const canvas = screen.getByTestId('starfield-canvas')
    expect(canvas).toHaveAttribute('data-static', 'true')
    expect(canvas).toHaveAttribute('data-density', 'low')
    expect(canvas).toHaveAttribute('data-renderer', 'none')
    expect(canvas).toHaveAttribute('aria-hidden', 'true')
  })
})
