// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { StatusOrb, StatusOrbCanvasFallback } from '../src/renderer/src/fx/StatusOrb'

describe('StatusOrb', () => {
  afterEach(cleanup)

  it('renders L2 status with mode attribute (jsdom uses canvas fallback)', () => {
    render(<StatusOrb mode="running" reducedMotion />)
    const orb = screen.getByTestId('status-orb')
    expect(orb).toHaveAttribute('data-mode', 'running')
    expect(orb).toHaveAccessibleName(/L2/)
    expect(screen.getByTestId('status-orb-fallback')).toBeInTheDocument()
  })

  it('canvas fallback mounts without throwing', () => {
    render(<StatusOrbCanvasFallback mode="idle" reducedMotion />)
    expect(screen.getByTestId('status-orb-fallback')).toBeInTheDocument()
  })
})
