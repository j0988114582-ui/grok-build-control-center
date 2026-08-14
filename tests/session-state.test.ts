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
    expect(state.events[0]).toMatchObject({ id: '1', status: 'completed', output: 'ok' })
  })

  it('merges background task updates into one card and keeps the original description', () => {
    let state = createSessionState('s1')
    state = sessionReducer(state, { type: 'event', event: { id: '1', sessionId: 's1', kind: 'task', taskId: 'task-1', description: 'npm run build', status: 'running' } })
    state = sessionReducer(state, { type: 'event', event: { id: '2', sessionId: 's1', kind: 'task', taskId: 'task-1', description: 'Background task', status: 'completed' } })
    expect(state.events).toHaveLength(1)
    expect(state.events[0]).toMatchObject({ kind: 'task', description: 'npm run build', status: 'completed' })
  })

  it('appends task events without an id instead of merging unrelated tasks', () => {
    let state = createSessionState('s1')
    state = sessionReducer(state, { type: 'event', event: { id: '1', sessionId: 's1', kind: 'task', taskId: '', description: 'A', status: 'running' } })
    state = sessionReducer(state, { type: 'event', event: { id: '2', sessionId: 's1', kind: 'task', taskId: '', description: 'B', status: 'running' } })
    expect(state.events).toHaveLength(2)
  })

  it('does not regress a completed task or erase its useful description on replay', () => {
    let state = createSessionState('s1')
    state = sessionReducer(state, { type: 'event', event: { id: '1', sessionId: 's1', kind: 'task', taskId: 'task-1', description: 'npm test', status: 'completed' } })
    state = sessionReducer(state, { type: 'event', event: { id: '2', sessionId: 's1', kind: 'task', taskId: 'task-1', description: '  ', status: 'running' } })
    expect(state.events[0]).toMatchObject({ description: 'npm test', status: 'completed' })
  })

  it('R2: carries toolName/rawOutput forward across a real scheduler_create update sequence (2026-08-03 capture)', () => {
    // Real capture: only the first two updates for this toolCallId carry _meta['x.ai/tool'];
    // the final "completed" update carries rawOutput but omits _meta entirely.
    let state = createSessionState('s1')
    state = sessionReducer(state, { type: 'event', event: { id: '1', sessionId: 's1', kind: 'tool', toolCallId: 't-0', title: 'scheduler_create', status: 'pending', toolName: 'scheduler_create', rawInput: { interval: '60s' } } })
    state = sessionReducer(state, { type: 'event', event: { id: '2', sessionId: 's1', kind: 'tool', toolCallId: 't-0', title: 'Create scheduled task (every 60s)', status: 'running', toolName: 'scheduler_create', rawInput: { variant: 'SchedulerCreate', recurring: true } } })
    state = sessionReducer(state, { type: 'event', event: { id: '3', sessionId: 's1', kind: 'tool', toolCallId: 't-0', title: 'Tool call', status: 'completed', rawOutput: { type: 'SchedulerCreate', id: '019f00000001', humanSchedule: 'every 1 minute' } } })
    expect(state.events).toHaveLength(1)
    expect(state.events[0]).toMatchObject({
      title: 'Create scheduled task (every 60s)',
      status: 'completed',
      toolName: 'scheduler_create',
      rawOutput: { id: '019f00000001', humanSchedule: 'every 1 minute' },
      rawInput: { variant: 'SchedulerCreate', recurring: true }
    })
  })

  it('does not concatenate an interject message onto the previous user prompt', () => {
    let state = createSessionState('s1')
    state = sessionReducer(state, { type: 'event', event: { id: '1', sessionId: 's1', kind: 'message', role: 'user', text: 'original prompt' } })
    state = sessionReducer(state, { type: 'event', event: { id: '2', sessionId: 's1', kind: 'message', role: 'user', text: 'steer left', origin: 'interject', interjectionId: 'i-1' } })
    expect(state.events).toHaveLength(2)
    expect(state.events[0]).toMatchObject({ text: 'original prompt' })
    expect(state.events[1]).toMatchObject({ text: 'steer left', origin: 'interject' })
  })

  it('dedups an official interjection echo against the optimistic message by interjectionId', () => {
    let state = createSessionState('s1')
    state = sessionReducer(state, { type: 'event', event: { id: 'opt', sessionId: 's1', kind: 'message', role: 'user', text: 'steer left', origin: 'interject', interjectionId: 'i-1' } })
    state = sessionReducer(state, { type: 'event', event: { id: 'echo', sessionId: 's1', kind: 'message', role: 'user', text: 'steer left', origin: 'interject', interjectionId: 'i-1' } })
    expect(state.events).toHaveLength(1)
    expect(state.events[0]).toMatchObject({ id: 'opt', text: 'steer left', origin: 'interject' })
  })

  it('merges later subagent updates with the same subagentId', () => {
    let state = createSessionState('s1')
    state = sessionReducer(state, { type: 'event', event: { id: '1', sessionId: 's1', kind: 'subagent', subagentId: 'child-1', description: 'Review PR', status: 'running' } })
    state = sessionReducer(state, { type: 'event', event: { id: '2', sessionId: 's1', kind: 'subagent', subagentId: 'child-1', description: 'Subagent', status: 'completed', output: 'lgtm' } })
    expect(state.events).toHaveLength(1)
    expect(state.events[0]).toMatchObject({ id: '1', subagentId: 'child-1', description: 'Review PR', status: 'completed', output: 'lgtm' })
  })
})
