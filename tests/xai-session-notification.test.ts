import { describe, expect, it } from 'vitest'
import { mapRawAcpLineToEvent } from '../src/main/acp-client'
import {
  isAutoCompactUpdate,
  parseXaiInterjectionLine,
  parseXaiSessionNotificationLine,
  XAI_INTERJECTION_METHOD,
  XAI_SESSION_NOTIFICATION_METHOD
} from '../src/shared/xai-session-notification'
import { normalizeAcpUpdate } from '../src/shared/event-adapter'

describe('xAI session_notification raw parse (Scheme A)', () => {
  const liveCompactLine = JSON.stringify({
    jsonrpc: '2.0',
    method: XAI_SESSION_NOTIFICATION_METHOD,
    params: {
      sessionId: '019f0000-0000-7000-8000-000000000006',
      update: {
        sessionUpdate: 'auto_compact_completed',
        tokens_before: 15967,
        tokens_after: 15967,
        summary_preview: null
      },
      _meta: {
        eventId: '019f0000-0000-7000-8000-000000000006-29',
        agentTimestampMs: 1784219532340
      }
    }
  })

  it('parses live /compact wire shape from probe', () => {
    const parsed = parseXaiSessionNotificationLine(liveCompactLine)
    expect(parsed).toEqual({
      sessionId: '019f0000-0000-7000-8000-000000000006',
      update: {
        sessionUpdate: 'auto_compact_completed',
        tokens_before: 15967,
        tokens_after: 15967,
        summary_preview: null
      }
    })
    expect(isAutoCompactUpdate(parsed!.update)).toBe(true)
  })

  it('maps raw NDJSON line → kind compact with official source (does not rely on SDK path)', () => {
    const event = mapRawAcpLineToEvent(liveCompactLine)
    expect(event).toMatchObject({
      sessionId: '019f0000-0000-7000-8000-000000000006',
      kind: 'compact',
      before: 15967,
      after: 15967,
      source: 'official'
    })
    expect(event && 'summary' in event ? event.summary : undefined).toBeUndefined()
  })

  it('maps reducing compact with summary_preview', () => {
    const line = JSON.stringify({
      jsonrpc: '2.0',
      method: XAI_SESSION_NOTIFICATION_METHOD,
      params: {
        sessionId: 's1',
        update: {
          sessionUpdate: 'auto_compact_completed',
          tokens_before: 90000,
          tokens_after: 22000,
          summary_preview: 'Kept project goals and open bugs'
        }
      }
    })
    expect(mapRawAcpLineToEvent(line)).toMatchObject({
      kind: 'compact',
      before: 90000,
      after: 22000,
      summary: 'Kept project goals and open bugs',
      source: 'official'
    })
  })

  it('ignores non-compact xAI notifications and standard session/update lines', () => {
    const turn = JSON.stringify({
      jsonrpc: '2.0',
      method: XAI_SESSION_NOTIFICATION_METHOD,
      params: {
        sessionId: 's1',
        update: { sessionUpdate: 'turn_completed', stop_reason: 'end_turn' }
      }
    })
    expect(mapRawAcpLineToEvent(turn)).toBeNull()

    const standard = JSON.stringify({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 's1',
        update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'hi' } }
      }
    })
    expect(mapRawAcpLineToEvent(standard)).toBeNull()
    expect(parseXaiSessionNotificationLine('not-json')).toBeNull()
  })

  it('normalizeAcpUpdate still handles auto_compact_completed if ever delivered via session/update', () => {
    expect(normalizeAcpUpdate('s', {
      sessionUpdate: 'auto_compact_completed',
      tokens_before: 900,
      tokens_after: 300,
      summary_preview: 'x'
    })).toMatchObject({ kind: 'compact', before: 900, after: 300, summary: 'x', source: 'official' })
  })

  it('parses underscore, bare, and nested-wrap session_notification methods', () => {
    const update = { sessionUpdate: 'auto_compact_completed', tokens_before: 1, tokens_after: 1 }
    const underscore = JSON.stringify({
      method: '_x.ai/session_notification',
      params: { sessionId: 's1', update }
    })
    const bare = JSON.stringify({
      method: 'x.ai/session_notification',
      params: { sessionId: 's1', update }
    })
    const nested = JSON.stringify({
      method: '_x.ai/session_notification',
      params: { method: 'x.ai/session_notification', params: { sessionId: 's1', update } }
    })
    expect(parseXaiSessionNotificationLine(underscore)).toEqual({ sessionId: 's1', update })
    expect(parseXaiSessionNotificationLine(bare)).toEqual({ sessionId: 's1', update })
    expect(parseXaiSessionNotificationLine(nested)).toEqual({ sessionId: 's1', update })
  })

  it('maps subagent_spawned / subagent_finished from the raw tee using child_session_id', () => {
    const spawned = JSON.stringify({
      jsonrpc: '2.0',
      method: XAI_SESSION_NOTIFICATION_METHOD,
      params: {
        sessionId: 's1',
        update: { sessionUpdate: 'subagent_spawned', child_session_id: 'child-9', description: 'Review PR' }
      }
    })
    const finished = JSON.stringify({
      jsonrpc: '2.0',
      method: 'x.ai/session_notification',
      params: {
        method: 'x.ai/session_notification',
        params: {
          sessionId: 's1',
          update: { sessionUpdate: 'subagent_finished', child_session_id: 'child-9', status: 'completed', output: 'ok' }
        }
      }
    })
    expect(mapRawAcpLineToEvent(spawned)).toMatchObject({
      kind: 'subagent',
      subagentId: 'child-9',
      status: 'running',
      description: 'Review PR'
    })
    expect(mapRawAcpLineToEvent(finished)).toMatchObject({
      kind: 'subagent',
      subagentId: 'child-9',
      status: 'completed',
      output: 'ok'
    })
  })

  it('maps official interjection lines to a user message with origin interject', () => {
    const line = JSON.stringify({
      jsonrpc: '2.0',
      method: XAI_INTERJECTION_METHOD,
      params: { sessionId: 's1', text: 'steer left', interjectionId: 'i-22' }
    })
    expect(parseXaiInterjectionLine(line)).toEqual({
      sessionId: 's1',
      text: 'steer left',
      interjectionId: 'i-22'
    })
    expect(mapRawAcpLineToEvent(line)).toMatchObject({
      kind: 'message',
      role: 'user',
      text: 'steer left',
      origin: 'interject',
      interjectionId: 'i-22'
    })
    const nested = JSON.stringify({
      method: '_x.ai/session/interjection',
      params: { method: 'x.ai/session/interjection', params: { sessionId: 's1', text: 'nested' } }
    })
    expect(mapRawAcpLineToEvent(nested)).toMatchObject({
      kind: 'message',
      role: 'user',
      origin: 'interject',
      text: 'nested'
    })
  })
})
