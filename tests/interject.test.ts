import { describe, expect, it, vi } from 'vitest'
import { GrokAcpClient } from '../src/main/acp-client'
import {
  buildInterjectParams,
  INTERJECT_METHOD,
  INTERJECT_QUEUED_NOTICE,
  isMethodNotFoundError,
  parseInterjectResult
} from '../src/shared/interject'

describe('interject helpers', () => {
  it('builds camelCase params for the underscore-prefixed wire method', () => {
    expect(buildInterjectParams('sess-1', '  steer left  ', { interjectionId: 'i1' })).toEqual({
      sessionId: 'sess-1',
      text: 'steer left',
      interjectionId: 'i1'
    })
    expect(INTERJECT_METHOD).toBe('_x.ai/interject')
    expect(INTERJECT_QUEUED_NOTICE).toBe('已排入，下一個安全點生效')
  })

  it('rejects empty text and non-queued responses', () => {
    expect(() => buildInterjectParams('s1', '   ')).toThrow(/不可為空/)
    expect(parseInterjectResult({ status: 'queued' })).toEqual({ status: 'queued' })
    expect(() => parseInterjectResult({ status: 'delivered' })).toThrow(/未預期/)
  })

  it('detects method-not-found without treating every error as unsupported', () => {
    expect(isMethodNotFoundError(new Error('Method not found'))).toBe(true)
    expect(isMethodNotFoundError(new Error('ACP error -32601: Method not found'))).toBe(true)
    expect(isMethodNotFoundError(new Error('session not found'))).toBe(false)
    expect(isMethodNotFoundError(new Error('network timeout'))).toBe(false)
  })
})

describe('GrokAcpClient interject extension', () => {
  it('calls _x.ai/interject with sessionId+text and never uses cancel', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'queued' })
    const notify = vi.fn()
    const client = new GrokAcpClient('grok.exe', {
      onEvent: vi.fn(), onPermission: vi.fn(), onStderr: vi.fn(), onExit: vi.fn()
    })
    ;(client as unknown as { context: { request: typeof request; notify: typeof notify } }).context = { request, notify }

    await expect(client.interject('s1', 'change direction')).resolves.toEqual({ status: 'queued' })
    expect(request).toHaveBeenCalledWith('_x.ai/interject', { sessionId: 's1', text: 'change direction' })
    expect(notify).not.toHaveBeenCalled()
  })

  it('propagates method-not-found without cancelling the turn', async () => {
    const request = vi.fn().mockRejectedValue(new Error('Method not found'))
    const notify = vi.fn()
    const client = new GrokAcpClient('grok.exe', {
      onEvent: vi.fn(), onPermission: vi.fn(), onStderr: vi.fn(), onExit: vi.fn()
    })
    ;(client as unknown as { context: { request: typeof request; notify: typeof notify } }).context = { request, notify }

    await expect(client.interject('s1', 'hello')).rejects.toThrow(/Method not found/)
    expect(notify).not.toHaveBeenCalled()
  })
})
