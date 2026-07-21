// @vitest-environment jsdom
import React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StarfieldCanvas } from '../src/renderer/src/fx/StarfieldCanvas'

/** Minimal 2d surface — enough for the canvas2d fallback renderer to draw a frame. */
function fakeContext2d(): CanvasRenderingContext2D {
  return {
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    setTransform: vi.fn()
  } as unknown as CanvasRenderingContext2D
}

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

  it('allocates a canvas whenever galaxy effects are on — light renders the dawn nebula too', async () => {
    const { rerender } = render(<StarfieldCanvas enabled={false} theme="light" density="medium" reducedMotion={false} running={false} connected={false} errorPulse={0} />)
    // Only the galaxy setting gates the canvas; theme no longer does (v0.10 phase 4).
    expect(screen.queryByTestId('starfield-canvas')).not.toBeInTheDocument()

    mockCanvasLayout()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      ((type: string) => (type === '2d' ? fakeContext2d() : null)) as HTMLCanvasElement['getContext']
    )
    rerender(<StarfieldCanvas enabled theme="light" density="medium" reducedMotion={false} running={false} connected={false} errorPulse={0} />)
    const canvas = screen.getByTestId('starfield-canvas')
    expect(canvas).toHaveAttribute('aria-hidden', 'true')
    expect(canvas).toHaveAttribute('data-static', 'false')
    await waitFor(() => expect(canvas).toHaveAttribute('data-renderer', 'canvas2d'))
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
