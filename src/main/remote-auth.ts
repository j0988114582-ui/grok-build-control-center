import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import {
  REMOTE_PAIRING_TTL_MS,
  REMOTE_SESSION_ABSOLUTE_MS,
  REMOTE_SESSION_IDLE_MS,
  type RemoteErrorCode
} from '../shared/remote-protocol'

const PIN_FAIL_LIMIT = 5

export type AuthResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: RemoteErrorCode; message: string }

type PairingRecord = {
  secretHash: string
  pinHash: string
  pinSalt: string
  createdAt: number
  expiresAt: number
  generation: number
  failures: number
  closed: boolean
}

type SessionRecord = {
  tokenHash: string
  createdAt: number
  lastSeenAt: number
  absoluteExpiresAt: number
  generation: number
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function hashPin(pin: string, salt: string): string {
  return scryptSync(pin, salt, 32).toString('hex')
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a, 'hex')
    const right = Buffer.from(b, 'hex')
    if (left.length !== right.length) return false
    return timingSafeEqual(left, right)
  } catch {
    return false
  }
}

/** In-memory pairing + session auth (R-SEC-1–6). Nothing persisted. */
export class RemoteAuthStore {
  private pairing: PairingRecord | null = null
  private sessions = new Map<string, SessionRecord>()
  private generation = 0
  private rateBuckets = new Map<string, { count: number; resetAt: number }>()

  /** Create a new pairing secret + PIN. Closes previous pairing. */
  openPairing(now = Date.now()): { pairingSecret: string; pin: string; expiresAt: number; generation: number } {
    this.generation += 1
    const pairingSecret = randomBytes(24).toString('base64url') // ≥128-bit
    const pin = String(Math.floor(100000 + Math.random() * 900000)) // 6 digits
    const pinSalt = randomBytes(16).toString('hex')
    this.pairing = {
      secretHash: sha256(pairingSecret),
      pinHash: hashPin(pin, pinSalt),
      pinSalt,
      createdAt: now,
      expiresAt: now + REMOTE_PAIRING_TTL_MS,
      generation: this.generation,
      failures: 0,
      closed: false
    }
    return { pairingSecret, pin, expiresAt: this.pairing.expiresAt, generation: this.generation }
  }

  closePairing(): void {
    if (this.pairing) this.pairing.closed = true
  }

  getPairingPublic(now = Date.now()): { pairable: boolean; expiresAt: number | null; generation: number } {
    const pairing = this.pairing
    if (!pairing || pairing.closed || now > pairing.expiresAt) {
      return { pairable: false, expiresAt: null, generation: this.generation }
    }
    return { pairable: true, expiresAt: pairing.expiresAt, generation: pairing.generation }
  }

  /** Single successful pair closes pairing (R-SEC-2b). */
  pair(pairingSecret: string, pin: string, now = Date.now()): AuthResult<{ sessionToken: string }> {
    const pairing = this.pairing
    if (!pairing || pairing.closed) {
      return { ok: false, code: 'pairing_closed', message: '配對已關閉，請在桌面重新產生' }
    }
    if (now > pairing.expiresAt) {
      pairing.closed = true
      return { ok: false, code: 'pairing_expired', message: '配對已過期，請在桌面重新產生' }
    }
    if (!safeEqualHex(sha256(pairingSecret), pairing.secretHash)) {
      pairing.failures += 1
      if (pairing.failures >= PIN_FAIL_LIMIT) pairing.closed = true
      return { ok: false, code: 'unauthorized', message: '配對失敗' }
    }
    const pinHash = hashPin(pin.trim(), pairing.pinSalt)
    if (!safeEqualHex(pinHash, pairing.pinHash)) {
      pairing.failures += 1
      if (pairing.failures >= PIN_FAIL_LIMIT) {
        pairing.closed = true
        return { ok: false, code: 'pin_invalid', message: 'PIN 錯誤次數過多，請在桌面重新產生' }
      }
      return { ok: false, code: 'pin_invalid', message: 'PIN 錯誤' }
    }

    const sessionToken = randomBytes(32).toString('base64url')
    const tokenHash = sha256(sessionToken)
    this.sessions.clear() // default one active device
    this.sessions.set(tokenHash, {
      tokenHash,
      createdAt: now,
      lastSeenAt: now,
      absoluteExpiresAt: now + REMOTE_SESSION_ABSOLUTE_MS,
      generation: pairing.generation
    })
    pairing.closed = true
    return { ok: true, value: { sessionToken } }
  }

  validateSession(sessionToken: string | null | undefined, now = Date.now()): AuthResult<{ tokenHash: string }> {
    if (!sessionToken) return { ok: false, code: 'unauthorized', message: '未登入' }
    const tokenHash = sha256(sessionToken)
    const session = this.sessions.get(tokenHash)
    if (!session) return { ok: false, code: 'unauthorized', message: '工作階段無效' }
    if (now > session.absoluteExpiresAt) {
      this.sessions.delete(tokenHash)
      return { ok: false, code: 'unauthorized', message: '工作階段已過期' }
    }
    if (now - session.lastSeenAt > REMOTE_SESSION_IDLE_MS) {
      this.sessions.delete(tokenHash)
      return { ok: false, code: 'unauthorized', message: '工作階段閒置過久' }
    }
    session.lastSeenAt = now
    return { ok: true, value: { tokenHash } }
  }

  revokeAll(): void {
    this.sessions.clear()
    this.closePairing()
    this.generation += 1
  }

  hasActiveSession(now = Date.now()): boolean {
    for (const [hash, session] of this.sessions) {
      if (now > session.absoluteExpiresAt || now - session.lastSeenAt > REMOTE_SESSION_IDLE_MS) {
        this.sessions.delete(hash)
        continue
      }
      return true
    }
    return false
  }

  /** Simple fixed-window rate limit. */
  rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
    const current = this.rateBuckets.get(key)
    if (!current || now >= current.resetAt) {
      this.rateBuckets.set(key, { count: 1, resetAt: now + windowMs })
      return true
    }
    if (current.count >= limit) return false
    current.count += 1
    return true
  }
}

export function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=')
    if (rawKey === name) return decodeURIComponent(rest.join('=') || '')
  }
  return null
}

export function buildSessionCookie(token: string, maxAgeSec: number, secure = true): string {
  // Host-only (no Domain), HttpOnly, SameSite=Strict, Path=/api
  // Secure required for HTTPS tunnels; loopback HTTP tests may pass secure=false.
  const securePart = secure ? '; Secure' : ''
  return `grok_remote_session=${encodeURIComponent(token)}; Path=/api; HttpOnly${securePart}; SameSite=Strict; Max-Age=${maxAgeSec}`
}

export function buildClearSessionCookie(secure = true): string {
  const securePart = secure ? '; Secure' : ''
  return `grok_remote_session=; Path=/api; HttpOnly${securePart}; SameSite=Strict; Max-Age=0`
}
