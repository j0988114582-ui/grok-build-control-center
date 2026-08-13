import { describe, expect, it } from 'vitest'
import { isTranscriptVisibleEvent, normalizeAcpUpdate, normalizeInterjectionNotification } from '../src/shared/event-adapter'

describe('normalizeAcpUpdate', () => {
  it('maps assistant message chunks to stable message events', () => {
    expect(normalizeAcpUpdate('s1', {
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: 'hello' }
    })).toEqual({ id: expect.any(String), sessionId: 's1', kind: 'message', role: 'assistant', text: 'hello' })
  })

  it('preserves unknown update types without exposing arbitrary objects to the UI', () => {
    expect(normalizeAcpUpdate('s1', { sessionUpdate: 'future_event', secret: 'hidden' })).toEqual({
      id: expect.any(String), sessionId: 's1', kind: 'unknown', updateType: 'future_event', summary: 'Unsupported Grok event: future_event'
    })
  })

  it('treats session_info_update as silent (no Unsupported Grok event card)', () => {
    expect(normalizeAcpUpdate('s1', { sessionUpdate: 'session_info_update', model: 'grok-4.6' })).toBeNull()
  })

  it('keeps commands/mode/usage for state but not as transcript rows', () => {
    const commands = normalizeAcpUpdate('s', { sessionUpdate: 'available_commands_update', availableCommands: [] })
    const mode = normalizeAcpUpdate('s', { sessionUpdate: 'current_mode_update', currentModeId: 'plan' })
    const usage = normalizeAcpUpdate('s', { sessionUpdate: 'usage_update', used: 1 })
    expect(commands).toMatchObject({ kind: 'commands' })
    expect(mode).toMatchObject({ kind: 'mode' })
    expect(usage).toMatchObject({ kind: 'usage' })
    expect(isTranscriptVisibleEvent(commands!)).toBe(false)
    expect(isTranscriptVisibleEvent(mode!)).toBe(false)
    expect(isTranscriptVisibleEvent(usage!)).toBe(false)
    expect(isTranscriptVisibleEvent(normalizeAcpUpdate('s', { sessionUpdate: 'auto_compact_completed', tokens_before: 2, tokens_after: 1 })!)).toBe(true)
    expect(isTranscriptVisibleEvent(normalizeAcpUpdate('s', { sessionUpdate: 'subagent_spawned', child_session_id: 'c' })!)).toBe(true)
  })

  it('maps tool, plan, subagent and turn completion events', () => {
    expect(normalizeAcpUpdate('s', { sessionUpdate: 'tool_call', toolCallId: 't', title: 'Read file', rawInput: { path: 'a' } })).toMatchObject({ kind: 'tool', toolCallId: 't', title: 'Read file' })
    expect(normalizeAcpUpdate('s', { sessionUpdate: 'plan', entries: [{ content: 'Build', status: 'pending' }] })).toMatchObject({ kind: 'plan', entries: [{ content: 'Build', status: 'pending' }] })
    expect(normalizeAcpUpdate('s', { sessionUpdate: 'subagent_spawned', subagent_id: 'a', description: 'Review' })).toMatchObject({ kind: 'subagent', subagentId: 'a', status: 'running' })
    expect(normalizeAcpUpdate('s', { sessionUpdate: 'subagent_spawned', child_session_id: 'child-1', description: 'Review' })).toMatchObject({ kind: 'subagent', subagentId: 'child-1', status: 'running' })
    expect(normalizeAcpUpdate('s', { sessionUpdate: 'subagent_finished', child_session_id: 'child-1', output: 'done' })).toMatchObject({ kind: 'subagent', subagentId: 'child-1', status: 'completed', output: 'done' })
    expect(normalizeAcpUpdate('s', { sessionUpdate: 'turn_completed', stop_reason: 'end_turn' })).toMatchObject({ kind: 'turn', status: 'completed', stopReason: 'end_turn' })
  })

  it('extracts nested ACP text content from tool progress updates', () => {
    expect(normalizeAcpUpdate('s', { sessionUpdate: 'tool_call_update', toolCallId: 't', status: 'completed', content: [{ type: 'content', content: { type: 'text', text: 'command output' } }] })).toMatchObject({
      kind: 'tool', toolCallId: 't', status: 'completed', output: 'command output'
    })
  })

  it('maps commands, mode, usage and compaction updates for desktop controls', () => {
    expect(normalizeAcpUpdate('s', { sessionUpdate: 'available_commands_update', availableCommands: [{ name: 'compact', description: 'Compact context', inputHint: 'optional' }] })).toMatchObject({ kind: 'commands', commands: [{ name: 'compact', description: 'Compact context', inputHint: 'optional' }] })
    expect(normalizeAcpUpdate('s', { sessionUpdate: 'current_mode_update', currentModeId: 'plan' })).toMatchObject({ kind: 'mode', modeId: 'plan' })
    expect(normalizeAcpUpdate('s', { sessionUpdate: 'usage_update', used: 120, size: 1000 })).toMatchObject({ kind: 'usage' })
    expect(normalizeAcpUpdate('s', { sessionUpdate: 'auto_compact_completed', tokens_before: 900, tokens_after: 300 })).toMatchObject({ kind: 'compact', before: 900, after: 300, source: 'official' })
  })

  it('maps official interjection notifications to user messages with origin interject', () => {
    expect(normalizeInterjectionNotification('s1', { text: 'steer', interjectionId: 'i-9' })).toEqual({
      id: 's1:interject:i-9',
      sessionId: 's1',
      kind: 'message',
      role: 'user',
      text: 'steer',
      origin: 'interject',
      interjectionId: 'i-9'
    })
  })
})

/**
 * R2 rework: exact `update` payloads from a real-CLI capture (2026-08-03, `/loop 15s echo
 * grok_loop_probe_tick` against a live Grok Build CLI). These are the three sequential
 * updates the SDK delivered for the single scheduler_create toolCallId, byte-for-byte minus
 * the outer envelope's capture-only `_meta.updateParams` summary (normalizeAcpUpdate only
 * ever sees the `update` object, never that outer envelope).
 */
describe('normalizeAcpUpdate — real scheduler_create capture', () => {
  const toolCallId = 'call-0dd47cf8-9112-45b5-b7bb-00b3ee434628-0'
  const prompt = 'You are a detached loop probe. One fire only — do not poll or wait.'

  it('update 1/3 (tool_call, Pending): carries toolName + rawInput even before any status', () => {
    const event = normalizeAcpUpdate('s', {
      toolCallId,
      title: 'scheduler_create',
      rawInput: { interval: '60s', prompt, fire_immediately: true },
      _meta: { 'x.ai/tool': { version: 1, name: 'scheduler_create', kind: 'other', namespace: 'grok_build', label: 'Tool', read_only: false } },
      sessionUpdate: 'tool_call'
    })
    expect(event).toMatchObject({
      kind: 'tool',
      toolCallId,
      title: 'scheduler_create',
      status: 'pending',
      toolName: 'scheduler_create',
      rawInput: { interval: '60s', fire_immediately: true }
    })
  })

  it('update 2/3 (tool_call_update): title mutates to human text but toolName stays exact', () => {
    const event = normalizeAcpUpdate('s', {
      toolCallId,
      kind: 'other',
      title: 'Create scheduled task (every 60s)',
      locations: [],
      rawInput: { variant: 'SchedulerCreate', task_id: null, interval: '60s', prompt, recurring: true, durable: null, foreground: null, fire_immediately: true },
      _meta: { 'x.ai/tool': { version: 1, name: 'scheduler_create', kind: 'other', namespace: 'grok_build', label: 'Tool', read_only: false } },
      sessionUpdate: 'tool_call_update'
    })
    expect(event).toMatchObject({
      kind: 'tool',
      toolCallId,
      title: 'Create scheduled task (every 60s)',
      toolName: 'scheduler_create',
      rawInput: { variant: 'SchedulerCreate', recurring: true }
    })
  })

  it('update 3/3 (tool_call_update, completed): rawOutput carries the recurring loop id; no _meta on this one', () => {
    const event = normalizeAcpUpdate('s', {
      toolCallId,
      status: 'completed',
      rawOutput: { type: 'SchedulerCreate', id: '019fc84ace8a', humanSchedule: 'every 1 minute', updated: false },
      sessionUpdate: 'tool_call_update'
    })
    expect(event).toMatchObject({
      kind: 'tool',
      toolCallId,
      status: 'completed',
      rawOutput: { type: 'SchedulerCreate', id: '019fc84ace8a', humanSchedule: 'every 1 minute' }
    })
    // Real capture: the completed update omits _meta entirely — the adapter must not invent one.
    expect((event as { toolName?: string }).toolName).toBeUndefined()
  })

  it('a control/query call (get_command_or_subagent_output) gets the same exact toolName treatment', () => {
    const event = normalizeAcpUpdate('s', {
      toolCallId: 'call-3d8becd4-d14b-4848-b90e-77b7aa9a1428-1',
      title: 'get_command_or_subagent_output',
      rawInput: { task_ids: ['019fc84a-ce8b-7690-b590-a440ec43d6c2'] },
      _meta: { 'x.ai/tool': { version: 1, name: 'get_command_or_subagent_output', kind: 'background_task_action', namespace: 'grok_build', label: 'Background Task', read_only: true } },
      sessionUpdate: 'tool_call'
    })
    expect(event).toMatchObject({ kind: 'tool', toolName: 'get_command_or_subagent_output' })
  })
})
