import { describe, expect, it } from 'vitest'
import { normalizeAcpUpdate } from '../src/shared/event-adapter'

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

  it('maps tool, plan, subagent and turn completion events', () => {
    expect(normalizeAcpUpdate('s', { sessionUpdate: 'tool_call', toolCallId: 't', title: 'Read file', rawInput: { path: 'a' } })).toMatchObject({ kind: 'tool', toolCallId: 't', title: 'Read file' })
    expect(normalizeAcpUpdate('s', { sessionUpdate: 'plan', entries: [{ content: 'Build', status: 'pending' }] })).toMatchObject({ kind: 'plan', entries: [{ content: 'Build', status: 'pending' }] })
    expect(normalizeAcpUpdate('s', { sessionUpdate: 'subagent_spawned', subagent_id: 'a', description: 'Review' })).toMatchObject({ kind: 'subagent', subagentId: 'a', status: 'running' })
    expect(normalizeAcpUpdate('s', { sessionUpdate: 'turn_completed', stop_reason: 'end_turn' })).toMatchObject({ kind: 'turn', status: 'completed', stopReason: 'end_turn' })
  })

  it('extracts nested ACP text content from tool progress updates', () => {
    expect(normalizeAcpUpdate('s', { sessionUpdate: 'tool_call_update', toolCallId: 't', status: 'completed', content: [{ type: 'content', content: { type: 'text', text: 'command output' } }] })).toMatchObject({
      kind: 'tool', toolCallId: 't', status: 'completed', output: 'command output'
    })
  })

  it('maps commands, mode, usage and compaction updates for desktop controls', () => {
    expect(normalizeAcpUpdate('s', { sessionUpdate: 'available_commands_update', availableCommands: [{ name: 'compact', description: 'Compact context' }] })).toMatchObject({ kind: 'commands', commands: [{ name: 'compact', description: 'Compact context' }] })
    expect(normalizeAcpUpdate('s', { sessionUpdate: 'current_mode_update', currentModeId: 'plan' })).toMatchObject({ kind: 'mode', modeId: 'plan' })
    expect(normalizeAcpUpdate('s', { sessionUpdate: 'usage_update', used: 120, size: 1000 })).toMatchObject({ kind: 'usage' })
    expect(normalizeAcpUpdate('s', { sessionUpdate: 'auto_compact_completed', tokens_before: 900, tokens_after: 300 })).toMatchObject({ kind: 'compact', before: 900, after: 300 })
  })
})
