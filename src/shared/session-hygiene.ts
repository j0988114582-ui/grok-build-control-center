import type { SessionSummary } from './types'

/** Active if last activity within this many days (Q4). */
export const SESSION_ACTIVE_DAYS = 10
/** Per-cwd keep newest N among non-protected sessions (U5). */
export const SESSION_KEEP_PER_CWD = 5

export type SessionHygieneClass = 'active' | 'suggested-cleanup'

export type SessionHygieneContext = {
  nowMs: number
  pinnedIds: ReadonlySet<string> | readonly string[]
  /** Currently focused / loaded session id */
  activeSessionId?: string | null
  /** Agents Team slot ids */
  teamSessionIds?: ReadonlySet<string> | readonly string[]
}

const toSet = (value: ReadonlySet<string> | readonly string[] | undefined): Set<string> => {
  if (!value) return new Set()
  return value instanceof Set ? value : new Set(value)
}

export function sessionActivityMs(session: SessionSummary): number {
  const raw = session.updatedAt ?? session.createdAt
  if (!raw) return 0
  const ms = Date.parse(raw)
  return Number.isFinite(ms) ? ms : 0
}

/** Fail-safe: missing/invalid messageCount is NOT treated as empty (U3). */
export function isEmptySession(session: SessionSummary): boolean {
  return session.messageCount === 0
}

export function isWithinActiveWindow(session: SessionSummary, nowMs: number, days = SESSION_ACTIVE_DAYS): boolean {
  const activity = sessionActivityMs(session)
  if (!activity) return false
  return nowMs - activity <= days * 86_400_000
}

/**
 * Classify sessions for cleanup suggestions.
 * Never auto-delete. Pinned never suggested.
 *
 * active (not suggested) if any:
 *   - pinned / current active / team slot
 *   - last activity within 10 days (takes precedence over keep-5)
 *   - among remaining, newest SESSION_KEEP_PER_CWD per cwd and not empty
 *
 * suggested-cleanup if not active and:
 *   - empty (messageCount === 0), or
 *   - excess beyond keep-5 per cwd, or
 *   - otherwise not protected (e.g. aged with no keep-5 slot)
 */
export function classifySessions(
  sessions: readonly SessionSummary[],
  ctx: SessionHygieneContext
): Map<string, SessionHygieneClass> {
  const pinned = toSet(ctx.pinnedIds)
  const team = toSet(ctx.teamSessionIds)
  const activeId = ctx.activeSessionId ?? null
  const result = new Map<string, SessionHygieneClass>()

  const isProtected = (session: SessionSummary): boolean =>
    pinned.has(session.id)
    || session.id === activeId
    || team.has(session.id)
    || isWithinActiveWindow(session, ctx.nowMs)

  // Pass 1: protected → active
  const remainder: SessionSummary[] = []
  for (const session of sessions) {
    if (isProtected(session)) result.set(session.id, 'active')
    else remainder.push(session)
  }

  // Pass 2: among remainder, keep newest N per cwd (non-empty); rest suggested
  const byCwd = new Map<string, SessionSummary[]>()
  for (const session of remainder) {
    const cwd = session.cwd.replace(/[\\/]+$/, '')
    const list = byCwd.get(cwd) ?? []
    list.push(session)
    byCwd.set(cwd, list)
  }

  for (const list of byCwd.values()) {
    list.sort((a, b) => sessionActivityMs(b) - sessionActivityMs(a))
    list.forEach((session, index) => {
      if (isEmptySession(session)) {
        result.set(session.id, 'suggested-cleanup')
        return
      }
      if (index < SESSION_KEEP_PER_CWD) {
        // Keep newest non-empty slots even if aged (U5); not auto-delete
        result.set(session.id, 'active')
        return
      }
      result.set(session.id, 'suggested-cleanup')
    })
  }

  // Pinned can never be suggested-cleanup
  for (const id of pinned) {
    if (result.has(id)) result.set(id, 'active')
  }

  return result
}

export function suggestedCleanupSessions(
  sessions: readonly SessionSummary[],
  ctx: SessionHygieneContext
): SessionSummary[] {
  const map = classifySessions(sessions, ctx)
  return sessions
    .filter((session) => map.get(session.id) === 'suggested-cleanup')
    .sort((a, b) => sessionActivityMs(a) - sessionActivityMs(b))
}

/** Unique full cwd list for folder filter (sorted). */
export function listSessionCwds(sessions: readonly SessionSummary[]): string[] {
  const set = new Set<string>()
  for (const session of sessions) {
    const cwd = session.cwd.replace(/[\\/]+$/, '')
    if (cwd) set.add(cwd)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
}

export function filterSessionsByCwd(
  sessions: readonly SessionSummary[],
  cwdFilter: string | 'all'
): SessionSummary[] {
  if (cwdFilter === 'all' || !cwdFilter) return [...sessions]
  const target = cwdFilter.replace(/[\\/]+$/, '')
  return sessions.filter((session) => session.cwd.replace(/[\\/]+$/, '') === target)
}

export function cwdDisplayName(cwd: string): string {
  const normalized = cwd.replace(/[\\/]+$/, '')
  return normalized.split(/[\\/]/).pop() || normalized
}
