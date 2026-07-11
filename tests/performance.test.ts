import { describe, expect, it } from 'vitest'
import { createSessionState, sessionReducer } from '../src/shared/session-state'

describe('long transcript performance', () => {
  it('normalizes 10,000 structured events within the smoke-test budget', () => {
    const started = performance.now()
    let state = createSessionState('perf')
    for (let index = 0; index < 10_000; index += 1) {
      state = sessionReducer(state, { type: 'event', event: {
        id: String(index), sessionId: 'perf', kind: 'tool', toolCallId: String(index), title: `Tool ${index}`, status: 'completed'
      } })
    }
    const elapsed = performance.now() - started
    expect(state.events).toHaveLength(10_000)
    expect(elapsed).toBeLessThan(2_000)
  })
})
