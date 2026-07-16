import { describe, expect, it } from 'vitest'
import {
  bumpConnectionGeneration,
  clearSessionReady,
  invalidateAllReadiness,
  isSessionReady,
  markSessionReady,
  sessionActionAllowed
} from '../src/shared/session-readiness'

describe('session-readiness', () => {
  it('marks create/load ready only for current generation', () => {
    let gen = 1
    let ready = invalidateAllReadiness()
    ready = markSessionReady(ready, 'new-session', gen)
    expect(isSessionReady(ready, 'new-session', gen)).toBe(true)
    expect(sessionActionAllowed(ready, 'new-session', gen)).toEqual({ ok: true })

    gen = bumpConnectionGeneration(gen)
    expect(isSessionReady(ready, 'new-session', gen)).toBe(false)
    expect(sessionActionAllowed(ready, 'new-session', gen).ok).toBe(false)

    ready = markSessionReady(ready, 'new-session', gen)
    expect(isSessionReady(ready, 'new-session', gen)).toBe(true)
  })

  it('rejects loading and reconnecting states', () => {
    const ready = markSessionReady({}, 's1', 1)
    expect(sessionActionAllowed(ready, 's1', 1, { loading: true }).ok).toBe(false)
    expect(sessionActionAllowed(ready, 's1', 1, { reconnecting: true }).ok).toBe(false)
  })

  it('clears one session without dropping peers', () => {
    let ready = markSessionReady({}, 'a', 1)
    ready = markSessionReady(ready, 'b', 1)
    ready = clearSessionReady(ready, 'a')
    expect(isSessionReady(ready, 'a', 1)).toBe(false)
    expect(isSessionReady(ready, 'b', 1)).toBe(true)
  })
})
