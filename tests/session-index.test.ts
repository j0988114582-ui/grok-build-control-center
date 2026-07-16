import { describe, expect, it } from 'vitest'
import { parseSessionSummary, parseSessionUsage } from '../src/main/session-index'

describe('parseSessionSummary', () => {
  it('normalizes Grok summary.json metadata', () => {
    expect(parseSessionSummary({
      info: { id: 's1', cwd: 'C:\\repo' },
      generated_title: 'Fix tests',
      session_summary: 'fallback',
      current_model_id: 'grok-4.5',
      agent_name: 'grok-build-plan',
      created_at: '2026-07-10T01:00:00Z',
      updated_at: '2026-07-10T02:00:00Z',
      num_chat_messages: 4
    })).toEqual({
      id: 's1', cwd: 'C:\\repo', title: 'Fix tests', model: 'grok-4.5', agentName: 'grok-build-plan',
      createdAt: '2026-07-10T01:00:00Z', updatedAt: '2026-07-10T02:00:00Z', messageCount: 4
    })
  })

  it('rejects malformed summaries without an id or cwd', () => {
    expect(parseSessionSummary({ info: { id: 's1' } })).toBeNull()
  })
})

describe('parseSessionUsage', () => {
  it('extracts context quota fields from signals.json', () => {
    expect(parseSessionUsage('s1', {
      contextTokensUsed: 186783,
      contextWindowTokens: 500000,
      contextWindowUsage: 37,
      turnCount: 7,
      toolCallCount: 79,
      compactionCount: 2,
      toolsUsed: ['grep']
    })).toEqual({
      sessionId: 's1', contextTokensUsed: 186783, contextWindowTokens: 500000,
      contextWindowUsage: 37, turnCount: 7, toolCallCount: 79, compactionCount: 2
    })
  })

  it('tolerates missing or malformed signals payloads', () => {
    expect(parseSessionUsage('s1', null)).toEqual({ sessionId: 's1' })
    expect(parseSessionUsage('s1', { contextTokensUsed: 'nope' })).toEqual({ sessionId: 's1' })
  })
})
