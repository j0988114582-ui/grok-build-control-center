import { describe, expect, it } from 'vitest'
import { parseQuickTunnelUrl } from '../src/main/remote-tunnel'

describe('remote-tunnel', () => {
  it('parses only trycloudflare quick tunnel URLs', () => {
    expect(parseQuickTunnelUrl('ok https://abc-123.trycloudflare.com world')).toBe('https://abc-123.trycloudflare.com')
    expect(parseQuickTunnelUrl('https://evil.example.com')).toBeNull()
    expect(parseQuickTunnelUrl('http://abc.trycloudflare.com')).toBeNull()
  })
})
