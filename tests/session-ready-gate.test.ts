import { describe, expect, it } from 'vitest'
import { SessionReadyGate } from '../src/main/session-ready-gate'
import { markSessionReadyIfCurrent } from '../src/shared/session-readiness'

describe('SessionReadyGate (main)', () => {
  it('requires create/load under current generation for prompt actions', () => {
    const gate = new SessionReadyGate()
    gate.beginConnection()
    expect(() => gate.assertReady('s1')).toThrow(/就緒/)
    gate.markReady('s1')
    expect(gate.isReady('s1')).toBe(true)
    gate.invalidate()
    expect(gate.isReady('s1')).toBe(false)
    expect(() => gate.assertReady('s1')).toThrow(/就緒/)
  })

  it('markReadyIfCurrent refuses a stale connection generation', () => {
    const gate = new SessionReadyGate()
    const gen = gate.beginConnection()
    expect(gate.markReadyIfCurrent('s1', gen)).toBe(true)
    expect(gate.isReady('s1')).toBe(true)
    gate.invalidate()
    expect(gate.markReadyIfCurrent('s2', gen)).toBe(false)
    expect(gate.isReady('s2')).toBe(false)
  })

  it('stale load failure does not clear a newer successful ready mark', () => {
    const gate = new SessionReadyGate()
    gate.beginConnection()
    const first = gate.beginLoad('s1')
    gate.invalidate()
    gate.beginConnection()
    const second = gate.beginLoad('s1')
    expect(gate.markReadyIfCurrent('s1', gate.currentGeneration)).toBe(true)
    expect(gate.isReady('s1')).toBe(true)
    gate.clearIfCurrentLoad('s1', first)
    expect(gate.isReady('s1')).toBe(true)
    gate.clearIfCurrentLoad('s1', second)
    expect(gate.isReady('s1')).toBe(false)
  })

  it('markSessionReadyIfCurrent drops stale generations', () => {
    let ready = markSessionReadyIfCurrent({}, 'a', 1, 1)
    expect(ready.a).toBe(1)
    ready = markSessionReadyIfCurrent(ready, 'b', 1, 2)
    expect(ready.b).toBeUndefined()
    expect(ready.a).toBe(1)
  })
})
