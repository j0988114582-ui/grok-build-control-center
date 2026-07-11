import { describe, expect, it, vi } from 'vitest'
import { GrokAcpClient } from '../src/main/acp-client'

describe('GrokAcpClient billing extension', () => {
  it('uses the verified underscore-prefixed ACP method with empty params', async () => {
    const request = vi.fn().mockResolvedValue({ config: { creditUsagePercent: 12 } })
    const client = new GrokAcpClient('grok.exe', {
      onEvent: vi.fn(), onPermission: vi.fn(), onStderr: vi.fn(), onExit: vi.fn()
    })
    ;(client as unknown as { context: { request: typeof request } }).context = { request }

    await expect(client.getBilling()).resolves.toEqual({ config: { creditUsagePercent: 12 } })
    expect(request).toHaveBeenCalledWith('_x.ai/billing', {})
  })
})
