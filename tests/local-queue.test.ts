import { describe, expect, it } from 'vitest'
import {
  hasQueuedPayload,
  remoteQueueStatusLabel,
  REMOTE_QUEUE_STATUS_DESKTOP,
  REMOTE_QUEUE_STATUS_MOBILE,
  shouldDrainLocalQueue,
  takeQueueForSession,
  type LocalQueuedPrompt
} from '../src/shared/local-queue'

describe('local next-turn queue (F-INT-4)', () => {
  it('detects payload presence', () => {
    expect(hasQueuedPayload(null)).toBe(false)
    expect(hasQueuedPayload({ sessionId: 's1', attachments: [] })).toBe(false)
    expect(hasQueuedPayload({ sessionId: 's1', text: '  hi  ', attachments: [] })).toBe(true)
    expect(hasQueuedPayload({ sessionId: 's1', attachments: [{ type: 'image', data: 'x', mimeType: 'image/png' }] })).toBe(true)
  })

  it('drains on completed/cancelled/error only', () => {
    expect(shouldDrainLocalQueue('completed')).toBe(true)
    expect(shouldDrainLocalQueue('cancelled')).toBe(true)
    expect(shouldDrainLocalQueue('error')).toBe(true)
    expect(shouldDrainLocalQueue('running')).toBe(false)
  })

  it('takes queue only for matching session', () => {
    const queue: LocalQueuedPrompt = { sessionId: 's1', text: 'next', attachments: [] }
    expect(takeQueueForSession(queue, 's2')).toEqual({ next: queue, drained: null })
    expect(takeQueueForSession(queue, 's1')).toEqual({ next: null, drained: queue })
  })

  it('labels remote queue provenance for desktop chrome', () => {
    expect(remoteQueueStatusLabel('mobile-remote')).toBe(REMOTE_QUEUE_STATUS_MOBILE)
    expect(remoteQueueStatusLabel('desktop')).toBe(REMOTE_QUEUE_STATUS_DESKTOP)
  })
})
