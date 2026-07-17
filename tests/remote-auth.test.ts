import { describe, expect, it } from 'vitest'
import { RemoteAuthStore, buildSessionCookie, parseCookie } from '../src/main/remote-auth'
import { REMOTE_PAIRING_TTL_MS } from '../src/shared/remote-protocol'

describe('remote-auth (R-SEC pairing / session)', () => {
  it('pairs with secret+PIN and issues opaque session token (not in pairing response body store)', () => {
    const auth = new RemoteAuthStore()
    const opened = auth.openPairing(1_000)
    expect(opened.pin).toMatch(/^\d{6}$/)
    const result = auth.pair(opened.pairingSecret, opened.pin, 1_100)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.sessionToken.length).toBeGreaterThan(20)
    // pairing closed after success
    const again = auth.pair(opened.pairingSecret, opened.pin, 1_200)
    expect(again.ok).toBe(false)
  })

  it('expires pairing after TTL', () => {
    const auth = new RemoteAuthStore()
    const opened = auth.openPairing(0)
    const result = auth.pair(opened.pairingSecret, opened.pin, REMOTE_PAIRING_TTL_MS + 1)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('pairing_expired')
  })

  it('invalidates pairing after 5 PIN failures', () => {
    const auth = new RemoteAuthStore()
    const opened = auth.openPairing(0)
    for (let i = 0; i < 5; i += 1) {
      const fail = auth.pair(opened.pairingSecret, '000000', i)
      expect(fail.ok).toBe(false)
    }
    const last = auth.pair(opened.pairingSecret, opened.pin, 10)
    expect(last.ok).toBe(false)
  })

  it('validates session cookie token and revokes all', () => {
    const auth = new RemoteAuthStore()
    const opened = auth.openPairing(0)
    const paired = auth.pair(opened.pairingSecret, opened.pin, 1)
    expect(paired.ok).toBe(true)
    if (!paired.ok) return
    const ok = auth.validateSession(paired.value.sessionToken, 2)
    expect(ok.ok).toBe(true)
    auth.revokeAll()
    const bad = auth.validateSession(paired.value.sessionToken, 3)
    expect(bad.ok).toBe(false)
  })

  it('builds HttpOnly Secure SameSite cookie (HTTPS default)', () => {
    const cookie = buildSessionCookie('tok', 3600, true)
    expect(cookie).toMatch(/HttpOnly/)
    expect(cookie).toMatch(/Secure/)
    expect(cookie).toMatch(/SameSite=Strict/)
    expect(cookie).toMatch(/Path=\/api/)
    expect(parseCookie(`a=1; ${cookie}`, 'grok_remote_session')).toBe('tok')
  })

  it('can omit Secure for loopback HTTP', () => {
    const cookie = buildSessionCookie('tok', 3600, false)
    expect(cookie).toMatch(/HttpOnly/)
    expect(cookie).not.toMatch(/Secure/)
  })
})
