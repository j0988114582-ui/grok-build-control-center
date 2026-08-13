/**
 * Grok CLI extension notifications that are NOT on standard ACP `session/update`.
 * Live probe (CLI 0.2.101, 2026-07-17): `/compact` emits
 *   method: `_x.ai/session_notification`
 *   params.update.sessionUpdate: `auto_compact_completed`
 * with tokens_before / tokens_after / summary_preview.
 * CLI 1.0.3 also emits `subagent_spawned` / `subagent_finished` on the same
 * method (sometimes `x.ai/session_notification`, sometimes nested
 * `params.params`), plus `_x.ai/session/interjection` for official TUI echoes.
 * SDK 1.2.1 never delivers these to session/update handlers — tee raw NDJSON.
 */

export const XAI_SESSION_NOTIFICATION_METHOD = '_x.ai/session_notification'
export const XAI_SESSION_NOTIFICATION_METHOD_BARE = 'x.ai/session_notification'
export const XAI_INTERJECTION_METHOD = '_x.ai/session/interjection'
export const XAI_INTERJECTION_METHOD_BARE = 'x.ai/session/interjection'

export type XaiSessionNotification = {
  sessionId: string
  update: Record<string, unknown>
}

export type XaiInterjectionNotification = {
  sessionId: string
  text: string
  interjectionId?: string
}

export function tryParseJsonLine(line: string): unknown | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('{')) return null
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return null
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function isSessionNotificationMethod(method: unknown): boolean {
  return method === XAI_SESSION_NOTIFICATION_METHOD || method === XAI_SESSION_NOTIFICATION_METHOD_BARE
}

function isInterjectionMethod(method: unknown): boolean {
  return method === XAI_INTERJECTION_METHOD || method === XAI_INTERJECTION_METHOD_BARE
}

function payloadCandidates(record: Record<string, unknown>): unknown[] {
  const params = asRecord(record.params)
  const out: unknown[] = [record.params]
  if (params?.params !== undefined) out.push(params.params)
  return out
}

/**
 * Extract a session update from a raw NDJSON line if it is an xAI session_notification.
 * Accepts `_x.ai/session_notification` and `x.ai/session_notification`, including a
 * nested wrap `params: { method, params: { sessionId, update } }`.
 * Returns null for unrelated lines / parse failures.
 */
export function parseXaiSessionNotificationLine(line: string): XaiSessionNotification | null {
  const msg = tryParseJsonLine(line)
  if (!msg || typeof msg !== 'object') return null
  const record = msg as Record<string, unknown>
  const params = asRecord(record.params)
  if (!isSessionNotificationMethod(record.method) && !isSessionNotificationMethod(params?.method)) return null
  for (const candidate of payloadCandidates(record)) {
    const p = asRecord(candidate)
    if (!p) continue
    if (typeof p.sessionId !== 'string' || !p.sessionId) continue
    if (!p.update || typeof p.update !== 'object') continue
    return { sessionId: p.sessionId, update: p.update as Record<string, unknown> }
  }
  return null
}

/** Official TUI interjection broadcast: `{ sessionId, text, interjectionId? }`. */
export function parseXaiInterjectionLine(line: string): XaiInterjectionNotification | null {
  const msg = tryParseJsonLine(line)
  if (!msg || typeof msg !== 'object') return null
  const record = msg as Record<string, unknown>
  const params = asRecord(record.params)
  if (!isInterjectionMethod(record.method) && !isInterjectionMethod(params?.method)) return null
  for (const candidate of payloadCandidates(record)) {
    const p = asRecord(candidate)
    if (!p) continue
    if (typeof p.sessionId !== 'string' || !p.sessionId) continue
    if (typeof p.text !== 'string') continue
    const interjectionId = typeof p.interjectionId === 'string' && p.interjectionId.trim()
      ? p.interjectionId.trim()
      : undefined
    return { sessionId: p.sessionId, text: p.text, ...(interjectionId ? { interjectionId } : {}) }
  }
  return null
}

/** True when the update is auto_compact_completed (manual /compact or auto). */
export function isAutoCompactUpdate(update: Record<string, unknown>): boolean {
  return update.sessionUpdate === 'auto_compact_completed'
}

/** Compact + subagent lifecycle — the only session_notification kinds the raw tee forwards. */
export function isForwardedXaiSessionUpdate(update: Record<string, unknown>): boolean {
  return update.sessionUpdate === 'auto_compact_completed'
    || update.sessionUpdate === 'subagent_spawned'
    || update.sessionUpdate === 'subagent_finished'
}
