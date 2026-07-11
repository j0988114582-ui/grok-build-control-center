import { describe, expect, it } from 'vitest'
import { createSessionState, sessionReducer } from '../src/shared/session-state'

describe('sessionReducer', () => {
  it('merges adjacent streaming message chunks from the same role', () => {
    const initial = createSessionState('s1')
    const first = sessionReducer(initial, { type: 'event', event: { id: '1', sessionId: 's1', kind: 'message', role: 'assistant', text: 'Hel' } })
    const second = sessionReducer(first, { type: 'event', event: { id: '2', sessionId: 's1', kind: 'message', role: 'assistant', text: 'lo' } })
    expect(second.events).toHaveLength(1)
    expect(second.events[0]).toMatchObject({ text: 'Hello' })
  })

  it('tracks running state and unread events while follow-tail is disabled', () => {
    let state = createSessionState('s1')
    state = sessionReducer(state, { type: 'followTail', value: false })
    state = sessionReducer(state, { type: 'event', event: { id: '1', sessionId: 's1', kind: 'turn', status: 'running' } })
    expect(state.running).toBe(true)
    expect(state.unread).toBe(1)
    state = sessionReducer(state, { type: 'event', event: { id: '2', sessionId: 's1', kind: 'turn', status: 'completed' } })
    expect(state.running).toBe(false)
  })

  it('collapses duplicate turn markers with the same status', () => {
    let state = createSessionState('s1')
    state = sessionReducer(state, { type: 'event', event: { id: '1', sessionId: 's1', kind: 'turn', status: 'running' } })
    state = sessionReducer(state, { type: 'event', event: { id: '2', sessionId: 's1', kind: 'turn', status: 'completed', stopReason: 'end_turn' } })
    state = sessionReducer(state, { type: 'event', event: { id: '3', sessionId: 's1', kind: 'turn', status: 'completed', stopReason: 'end_turn' } })
    expect(state.events).toHaveLength(2)
    expect(state.events[1]).toMatchObject({ kind: 'turn', status: 'completed' })
  })

  it('updates an existing tool card instead of appending duplicate progress cards', () => {
    let state = createSessionState('s1')
    state = sessionReducer(state, { type: 'event', event: { id: '1', sessionId: 's1', kind: 'tool', toolCallId: 't1', title: 'Read', status: 'pending' } })
    state = sessionReducer(state, { type: 'event', event: { id: '2', sessionId: 's1', kind: 'tool', toolCallId: 't1', title: 'Read file', status: 'completed', output: 'ok' } })
    expect(state.events).toHaveLength(1)
    expect(state.events[0]).toMatchObject({ status: 'completed', output: 'ok' })
  })
})
