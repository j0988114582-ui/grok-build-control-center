import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import {
  REMOTE_ELEVATE_PIN_FAIL_LIMIT,
  REMOTE_ELEVATE_RATE_LIMIT,
  REMOTE_ELEVATE_RATE_WINDOW_MS,
  REMOTE_PAIRING_TTL_MS,
  REMOTE_SESSION_ABSOLUTE_MS,
  type RemoteErrorCode
} from '../shared/remote-protocol'

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

/** PIN material retained after pair for YOLO elevation (v0.9). */
type ElevationPinRecord = {
  pinHash: string
  pinSalt: string
  failures: number
  locked: boolean
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

/** In-memory pairing + session auth. Nothing persisted. */
export class RemoteAuthStore {
  private pairing: PairingRecord | null = null
  private elevationPin: ElevationPinRecord | null = null
  private sessions = new Map<string, SessionRecord>()
  private generation = 0
  private rateBuckets = new Map<string, { count: number; resetAt: number }>()

  /** Create a new pairing secret + PIN. Resets elevation pin material. */
  openPairing(now = Date.now()): { pairingSecret: string; pin: string; expiresAt: number; generation: number } {
    this.generation += 1
    const pairingSecret = randomBytes(24).toString('base64url')
    const pin = String(Math.floor(100000 + Math.random() * 900000))
    const pinSalt = randomBytes(16).toString('hex')
    const pinHash = hashPin(pin, pinSalt)
    this.pairing = {
      secretHash: sha256(pairingSecret),
      pinHash,
      pinSalt,
      createdAt: now,
      expiresAt: now + REMOTE_PAIRING_TTL_MS,
      generation: this.generation,
      failures: 0,
      closed: false
    }
    // Fresh PIN also unlocks elevation (desktop regenerate)
    this.elevationPin = { pinHash, pinSalt, failures: 0, locked: false }
    // Clear elevate rate buckets so regenerate is immediately usable
    for (const key of [...this.rateBuckets.keys()]) {
      if (key.startsWith('elevate:')) this.rateBuckets.delete(key)
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

  isElevationLocked(): boolean {
    return this.elevationPin?.locked === true
  }

  /** Single successful pair closes pairing for new devices but keeps elevation PIN. */
  pair(pairingSecret: string, pin: string, now = Date.now()): AuthResult<{ sessionToken: string; expiresAt: number }> {
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
      if (pairing.failures >= REMOTE_ELEVATE_PIN_FAIL_LIMIT) pairing.closed = true
      return { ok: false, code: 'unauthorized', message: '配對失敗' }
    }
    const pinHash = hashPin(pin.trim(), pairing.pinSalt)
    if (!safeEqualHex(pinHash, pairing.pinHash)) {
      pairing.failures += 1
      if (pairing.failures >= REMOTE_ELEVATE_PIN_FAIL_LIMIT) {
        pairing.closed = true
        return { ok: false, code: 'pin_invalid', message: 'PIN 錯誤次數過多，請在桌面重新產生' }
      }
      return { ok: false, code: 'pin_invalid', message: 'PIN 錯誤' }
    }

    const sessionToken = randomBytes(32).toString('base64url')
    const tokenHash = sha256(sessionToken)
    const absoluteExpiresAt = now + REMOTE_SESSION_ABSOLUTE_MS
    this.sessions.clear()
    this.sessions.set(tokenHash, {
      tokenHash,
      createdAt: now,
      lastSeenAt: now,
      absoluteExpiresAt,
      generation: pairing.generation
    })
    pairing.closed = true
    // Keep elevation PIN (same as pairing PIN) until remote disabled / regenerate
    this.elevationPin = {
      pinHash: pairing.pinHash,
      pinSalt: pairing.pinSalt,
      failures: 0,
      locked: false
    }
    return { ok: true, value: { sessionToken, expiresAt: absoluteExpiresAt } }
  }

  /**
   * Verify PIN for YOLO elevation while Remote session is active.
   * Does not create a new session; does not require pairing to be open.
   */
  verifyElevationPin(pin: string, tokenHash: string, now = Date.now()): AuthResult<{ ok: true }> {
    if (!this.sessions.has(tokenHash)) {
      return { ok: false, code: 'unauthorized', message: '工作階段無效' }
    }
    const session = this.sessions.get(tokenHash)!
    if (now > session.absoluteExpiresAt) {
      this.sessions.delete(tokenHash)
      return { ok: false, code: 'unauthorized', message: '工作階段已過期' }
    }
    const elev = this.elevationPin
    if (!elev) {
      return { ok: false, code: 'elevation_locked', message: '請在桌面重新產生 PIN' }
    }
    if (elev.locked) {
      return { ok: false, code: 'elevation_locked', message: 'PIN 錯誤次數過多，請在桌面重新產生 PIN' }
    }
    // Failure lock (5 wrong PINs) is the primary anti-bruteforce; optional soft rate limit after each try.
    const pinHash = hashPin(pin.trim(), elev.pinSalt)
    if (!safeEqualHex(pinHash, elev.pinHash)) {
      elev.failures += 1
      void this.rateLimit(`elevate:${tokenHash}`, REMOTE_ELEVATE_RATE_LIMIT + 5, REMOTE_ELEVATE_RATE_WINDOW_MS, now)
      if (elev.failures >= REMOTE_ELEVATE_PIN_FAIL_LIMIT) {
        elev.locked = true
        return { ok: false, code: 'elevation_locked', message: 'PIN 錯誤次數過多，請在桌面重新產生 PIN' }
      }
      return { ok: false, code: 'pin_invalid', message: 'PIN 錯誤' }
    }
    elev.failures = 0
    return { ok: true, value: { ok: true } }
  }

  validateSession(sessionToken: string | null | undefined, now = Date.now()): AuthResult<{ tokenHash: string; expiresAt: number }> {
    if (!sessionToken) return { ok: false, code: 'unauthorized', message: '未登入' }
    const tokenHash = sha256(sessionToken)
    const session = this.sessions.get(tokenHash)
    if (!session) return { ok: false, code: 'unauthorized', message: '工作階段無效' }
    if (now > session.absoluteExpiresAt) {
      this.sessions.delete(tokenHash)
      return { ok: false, code: 'unauthorized', message: '工作階段已過期' }
    }
    // v0.9: no idle timeout — only absolute 72h
    session.lastSeenAt = now
    return { ok: true, value: { tokenHash, expiresAt: session.absoluteExpiresAt } }
  }

  getSessionExpiresAt(now = Date.now()): number | null {
    for (const session of this.sessions.values()) {
      if (now <= session.absoluteExpiresAt) return session.absoluteExpiresAt
    }
    return null
  }

  revokeAll(): void {
    this.sessions.clear()
    this.closePairing()
    this.elevationPin = null
    this.generation += 1
  }

  hasActiveSession(now = Date.now()): boolean {
    for (const [hash, session] of this.sessions) {
      if (now > session.absoluteExpiresAt) {
        this.sessions.delete(hash)
        continue
      }
      return true
    }
    return false
  }

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
  const securePart = secure ? '; Secure' : ''
  return `grok_remote_session=${encodeURIComponent(token)}; Path=/api; HttpOnly${securePart}; SameSite=Strict; Max-Age=${maxAgeSec}`
}

export function buildClearSessionCookie(secure = true): string {
  const securePart = secure ? '; Secure' : ''
  return `grok_remote_session=; Path=/api; HttpOnly${securePart}; SameSite=Strict; Max-Age=0`
}
