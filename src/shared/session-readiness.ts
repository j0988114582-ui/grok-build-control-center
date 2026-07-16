/**
 * ACP connection-generation readiness for Agents Team / single session.
 * A session is ready only if it was successfully created (session/new) or loaded
 * (session/load) under the *current* connection generation.
 */

export type SessionReadyMap = Record<string, number>

export const SESSION_NOT_READY_NOTICE = '此對話尚未在目前連線就緒（載入中、失敗或已斷線），請重新開啟後再送出'
export const SESSION_LOADING_NOTICE = '對話載入中，請稍候再送出'
export const RECONNECT_IN_PROGRESS_NOTICE = '連線重建中，請稍候再操作 Agents Team'

export function bumpConnectionGeneration(current: number): number {
  return current + 1
}

export function markSessionReady(
  ready: SessionReadyMap,
  sessionId: string,
  generation: number
): SessionReadyMap {
  if (!sessionId || generation < 1) return ready
  return { ...ready, [sessionId]: generation }
}

/**
 * Only mark ready if the generation captured at operation start still matches
 * the live generation (prevents stale create/load after disconnect).
 */
export function markSessionReadyIfCurrent(
  ready: SessionReadyMap,
  sessionId: string,
  generationAtStart: number,
  liveGeneration: number
): SessionReadyMap {
  if (generationAtStart !== liveGeneration) return ready
  return markSessionReady(ready, sessionId, liveGeneration)
}

export function clearSessionReady(ready: SessionReadyMap, sessionId: string): SessionReadyMap {
  if (!(sessionId in ready)) return ready
  const next = { ...ready }
  delete next[sessionId]
  return next
}

/** Disconnect or generation bump: nothing is ready until create/load again. */
export function invalidateAllReadiness(): SessionReadyMap {
  return {}
}

export function isSessionReady(
  ready: SessionReadyMap,
  sessionId: string,
  generation: number
): boolean {
  return Boolean(sessionId) && generation >= 1 && ready[sessionId] === generation
}

/** Guard for send / interject / do-now / cancel. */
export function sessionActionAllowed(
  ready: SessionReadyMap,
  sessionId: string,
  generation: number,
  options?: { loading?: boolean; reconnecting?: boolean }
): { ok: true } | { ok: false; notice: string } {
  if (options?.reconnecting) return { ok: false, notice: RECONNECT_IN_PROGRESS_NOTICE }
  if (options?.loading) return { ok: false, notice: SESSION_LOADING_NOTICE }
  if (!isSessionReady(ready, sessionId, generation)) {
    return { ok: false, notice: SESSION_NOT_READY_NOTICE }
  }
  return { ok: true }
}
