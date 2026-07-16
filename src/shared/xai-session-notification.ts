/**
 * Grok CLI extension notifications that are NOT on standard ACP `session/update`.
 * Live probe (CLI 0.2.101, 2026-07-17): `/compact` emits
 *   method: `_x.ai/session_notification`
 *   params.update.sessionUpdate: `auto_compact_completed`
 * with tokens_before / tokens_after / summary_preview.
 * SDK 1.2.1 never delivers these to session/update handlers — tee raw NDJSON.
 */

export const XAI_SESSION_NOTIFICATION_METHOD = '_x.ai/session_notification'

export type XaiSessionNotification = {
  sessionId: string
  update: Record<string, unknown>
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

/**
 * Extract a session update from a raw NDJSON line if it is an xAI session_notification.
 * Returns null for unrelated lines / parse failures.
 */
export function parseXaiSessionNotificationLine(line: string): XaiSessionNotification | null {
  const msg = tryParseJsonLine(line)
  if (!msg || typeof msg !== 'object') return null
  const record = msg as Record<string, unknown>
  if (record.method !== XAI_SESSION_NOTIFICATION_METHOD) return null
  const params = record.params
  if (!params || typeof params !== 'object') return null
  const p = params as Record<string, unknown>
  if (typeof p.sessionId !== 'string' || !p.sessionId) return null
  if (!p.update || typeof p.update !== 'object') return null
  return { sessionId: p.sessionId, update: p.update as Record<string, unknown> }
}

/** True when the update is auto_compact_completed (manual /compact or auto). */
export function isAutoCompactUpdate(update: Record<string, unknown>): boolean {
  return update.sessionUpdate === 'auto_compact_completed'
}
