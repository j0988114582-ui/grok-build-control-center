import { describe, expect, it } from 'vitest'
import { RemoteAuthStore, buildSessionCookie, parseCookie } from '../src/main/remote-auth'
import { REMOTE_SESSION_ABSOLUTE_MS } from '../src/shared/remote-protocol'

describe('remote-auth (v0.9 72h + elevation PIN)', () => {
  it('pairs with secret+PIN and issues opaque session token', () => {
    const auth = new RemoteAuthStore()
    const opened = auth.openPairing(1_000)
    expect(opened.pin).toMatch(/^\d{6}$/)
    const result = auth.pair(opened.pairingSecret, opened.pin, 1_100)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.sessionToken.length).toBeGreaterThan(20)
    expect(result.value.expiresAt).toBe(1_100 + REMOTE_SESSION_ABSOLUTE_MS)
    const again = auth.pair(opened.pairingSecret, opened.pin, 1_200)
    expect(again.ok).toBe(false)
  })

  it('does not idle-expire within absolute window', () => {
    const auth = new RemoteAuthStore()
    const opened = auth.openPairing(0)
    const paired = auth.pair(opened.pairingSecret, opened.pin, 0)
    expect(paired.ok).toBe(true)
    if (!paired.ok) return
    // far future but within 72h
    const mid = 24 * 60 * 60_000
    const ok = auth.validateSession(paired.value.sessionToken, mid)
    expect(ok.ok).toBe(true)
  })

  it('absolute 72h expiry kicks session', () => {
    const auth = new RemoteAuthStore()
    const opened = auth.openPairing(0)
    const paired = auth.pair(opened.pairingSecret, opened.pin, 0)
    expect(paired.ok).toBe(true)
    if (!paired.ok) return
    const expired = auth.validateSession(paired.value.sessionToken, REMOTE_SESSION_ABSOLUTE_MS + 1)
    expect(expired.ok).toBe(false)
  })

  it('re-pair resets absolute clock', () => {
    const auth = new RemoteAuthStore()
    const first = auth.openPairing(0)
    const p1 = auth.pair(first.pairingSecret, first.pin, 0)
    expect(p1.ok).toBe(true)
    if (!p1.ok) return
    auth.revokeAll()
    const second = auth.openPairing(1_000_000)
    const p2 = auth.pair(second.pairingSecret, second.pin, 1_000_000)
    expect(p2.ok).toBe(true)
    if (!p2.ok) return
    expect(p2.value.expiresAt).toBe(1_000_000 + REMOTE_SESSION_ABSOLUTE_MS)
  })

  it('elevation PIN works after pairing closed; locks after 5 fails', () => {
    const auth = new RemoteAuthStore()
    const opened = auth.openPairing(0)
    const paired = auth.pair(opened.pairingSecret, opened.pin, 1)
    expect(paired.ok).toBe(true)
    if (!paired.ok) return
    const tokenHash = auth.validateSession(paired.value.sessionToken, 2)
    expect(tokenHash.ok).toBe(true)
    if (!tokenHash.ok) return

    const good = auth.verifyElevationPin(opened.pin, tokenHash.value.tokenHash, 3)
    expect(good.ok).toBe(true)

    for (let i = 0; i < 5; i += 1) {
      const fail = auth.verifyElevationPin('000000', tokenHash.value.tokenHash, 10 + i)
      expect(fail.ok).toBe(false)
    }
    expect(auth.isElevationLocked()).toBe(true)
    const locked = auth.verifyElevationPin(opened.pin, tokenHash.value.tokenHash, 20)
    expect(locked.ok).toBe(false)
    if (locked.ok) return
    expect(locked.code).toBe('elevation_locked')
  })

  it('regenerate pairing unlocks elevation', () => {
    const auth = new RemoteAuthStore()
    const opened = auth.openPairing(0)
    const paired = auth.pair(opened.pairingSecret, opened.pin, 1)
    if (!paired.ok) return
    const v = auth.validateSession(paired.value.sessionToken, 2)
    if (!v.ok) return
    for (let i = 0; i < 5; i += 1) auth.verifyElevationPin('000000', v.value.tokenHash, 10 + i)
    expect(auth.isElevationLocked()).toBe(true)
    const next = auth.openPairing(100)
    expect(auth.isElevationLocked()).toBe(false)
    // old session cleared only on revoke; openPairing alone keeps sessions but new elev pin
    const elev = auth.verifyElevationPin(next.pin, v.value.tokenHash, 101)
    // session still valid from before
    expect(elev.ok).toBe(true)
  })

  it('invalidates pairing after 5 PIN failures on pair', () => {
    const auth = new RemoteAuthStore()
    const opened = auth.openPairing(0)
    for (let i = 0; i < 5; i += 1) {
      const fail = auth.pair(opened.pairingSecret, '000000', i)
      expect(fail.ok).toBe(false)
    }
    const last = auth.pair(opened.pairingSecret, opened.pin, 10)
    expect(last.ok).toBe(false)
  })

  it('revokeAll clears sessions and elevation', () => {
    const auth = new RemoteAuthStore()
    const opened = auth.openPairing(0)
    const paired = auth.pair(opened.pairingSecret, opened.pin, 1)
    expect(paired.ok).toBe(true)
    if (!paired.ok) return
    auth.revokeAll()
    const bad = auth.validateSession(paired.value.sessionToken, 3)
    expect(bad.ok).toBe(false)
    expect(auth.isElevationLocked()).toBe(false)
  })

  it('builds HttpOnly Secure SameSite cookie', () => {
    const cookie = buildSessionCookie('tok', 3600)
    expect(cookie).toMatch(/HttpOnly/)
    expect(cookie).toMatch(/Secure/)
    expect(cookie).toMatch(/SameSite=Strict/)
    expect(cookie).toMatch(/Path=\/api/)
    expect(parseCookie(`a=1; ${cookie}`, 'grok_remote_session')).toBe('tok')
  })
})
