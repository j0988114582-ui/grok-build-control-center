import { describe, expect, it, vi } from 'vitest'
import { GrokAcpClient } from '../src/main/acp-client'

describe('GrokAcpClient startup failures', () => {
  it('rejects start() instead of crashing the main process when the executable is missing', async () => {
    const client = new GrokAcpClient('C:\\definitely\\missing\\grok-nonexistent.exe', {
      onEvent: vi.fn(), onPermission: vi.fn(), onStderr: vi.fn(), onExit: vi.fn()
    })
    await expect(client.start()).rejects.toThrow(/無法啟動 Grok CLI|啟動後立即結束/)
  }, 20_000)
})
