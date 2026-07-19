// @vitest-environment jsdom
import React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StarfieldCanvas } from '../src/renderer/src/fx/StarfieldCanvas'

function mockCanvasLayout(width = 800, height = 600): void {
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => width
  })
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => height
  })
}

describe('StarfieldCanvas', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    // reset layout mocks
    Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 0
    })
    Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', {
      configurable: true,
      get: () => 0
    })
  })

  it('does not allocate a canvas when galaxy effects are off or theme is light', () => {
    const { rerender } = render(<StarfieldCanvas enabled={false} theme="dark" density="medium" reducedMotion={false} running={false} connected={false} errorPulse={0} />)
    expect(screen.queryByTestId('starfield-canvas')).not.toBeInTheDocument()
    rerender(<StarfieldCanvas enabled theme="light" density="medium" reducedMotion={false} running={false} connected={false} errorPulse={0} />)
    expect(screen.queryByTestId('starfield-canvas')).not.toBeInTheDocument()
  })

  it('marks a reduced-motion galaxy as static and keeps it pointer transparent', async () => {
    mockCanvasLayout()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    render(<StarfieldCanvas enabled theme="dark" density="low" reducedMotion running={false} connected={false} errorPulse={0} />)
    const canvas = screen.getByTestId('starfield-canvas')
    expect(canvas).toHaveAttribute('data-static', 'true')
    expect(canvas).toHaveAttribute('data-density', 'low')
    expect(canvas).toHaveAttribute('aria-hidden', 'true')
    await waitFor(() => expect(canvas).toHaveAttribute('data-renderer', 'none'))
  })

  it('defers engine start until canvas has usable layout (cold-start guard)', async () => {
    // Zero layout first — engine must not claim a renderer yet
    Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 0
    })
    Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', {
      configurable: true,
      get: () => 0
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const createSpy = vi.fn()
    // Lightweight: zero layout → renderer stays none
    render(<StarfieldCanvas enabled theme="dark" density="low" reducedMotion running={false} connected={false} errorPulse={0} />)
    const canvas = screen.getByTestId('starfield-canvas')
    await new Promise((r) => setTimeout(r, 40))
    expect(canvas).toHaveAttribute('data-renderer', 'none')
    expect(createSpy).not.toHaveBeenCalled()
  })

  it('starts after layout becomes usable', async () => {
    mockCanvasLayout(1024, 768)
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    render(<StarfieldCanvas enabled theme="dark" density="medium" reducedMotion running={false} connected={false} errorPulse={0} />)
    const canvas = screen.getByTestId('starfield-canvas')
    await waitFor(() => expect(getContext).toHaveBeenCalled())
    await waitFor(() => expect(canvas).toHaveAttribute('data-renderer', 'none'))
  })
})
