import { describe, expect, it } from 'vitest'
import { mapRawAcpLineToEvent } from '../src/main/acp-client'
import {
  isAutoCompactUpdate,
  parseXaiSessionNotificationLine,
  XAI_SESSION_NOTIFICATION_METHOD
} from '../src/shared/xai-session-notification'
import { normalizeAcpUpdate } from '../src/shared/event-adapter'

describe('xAI session_notification raw parse (Scheme A)', () => {
  const liveCompactLine = JSON.stringify({
    jsonrpc: '2.0',
    method: XAI_SESSION_NOTIFICATION_METHOD,
    params: {
      sessionId: '019f6bc5-67b9-7312-b285-ff55a382e537',
      update: {
        sessionUpdate: 'auto_compact_completed',
        tokens_before: 15967,
        tokens_after: 15967,
        summary_preview: null
      },
      _meta: {
        eventId: '019f6bc5-67b9-7312-b285-ff55a382e537-29',
        agentTimestampMs: 1784219532340
      }
    }
  })

  it('parses live /compact wire shape from probe', () => {
    const parsed = parseXaiSessionNotificationLine(liveCompactLine)
    expect(parsed).toEqual({
      sessionId: '019f6bc5-67b9-7312-b285-ff55a382e537',
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
      sessionId: '019f6bc5-67b9-7312-b285-ff55a382e537',
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
})
