import { describe, expect, it } from 'vitest'
import { probeSessionCapabilities } from '../src/shared/session-capabilities'

describe('session-capabilities probe', () => {
  it('maps loadSession and bounded keys without inventing features', () => {
    const probe = probeSessionCapabilities({
      loadSession: true,
      sessionCapabilities: { fork: true, weirdFutureFlag: true }
    })
    expect(probe.loadSession).toBe(true)
    expect(probe.bounded.fork).toBe(true)
    expect(probe.unknownKeys).toContain('weirdFutureFlag')
    expect(probe.matrix.find((row) => row.id === 'fork')?.route).toBe('native')
    expect(probe.matrix.find((row) => row.id === 'list')?.route).toBe('tui')
  })

  it('does not treat an empty capability object as available', () => {
    const probe = probeSessionCapabilities({
      loadSession: true,
      sessionCapabilities: { list: {} }
    })
    expect(probe.bounded.list).not.toBe(true)
    expect(probe.matrix.find((row) => row.id === 'list')?.route).toBe('tui')
  })
})
