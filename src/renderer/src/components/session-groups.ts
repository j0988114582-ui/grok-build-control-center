import type { SessionSummary } from '../../../shared/types'

export type SessionProjectGroup = { cwd: string; name: string; sessions: SessionSummary[] }

export const groupSessionsByProject = (sessions: SessionSummary[]): SessionProjectGroup[] => {
  const groups = new Map<string, SessionProjectGroup>()
  for (const session of sessions) {
    const cwd = session.cwd.replace(/[\\/]+$/, '')
    const existing = groups.get(cwd)
    if (existing) existing.sessions.push(session)
    else groups.set(cwd, { cwd, name: cwd.split(/[\\/]/).pop() || cwd, sessions: [session] })
  }
  return [...groups.values()]
}

export const sessionDisplayTitle = (session: SessionSummary, overrides: Record<string, string>): string =>
  overrides[session.id]?.trim() || session.title

/** Global top pin group: order follows `pinnedIds`; missing ids are skipped. */
export function partitionPinnedSessions(
  sessions: SessionSummary[],
  pinnedIds: readonly string[]
): { pinned: SessionSummary[]; unpinned: SessionSummary[] } {
  const byId = new Map(sessions.map((session) => [session.id, session]))
  const pinned: SessionSummary[] = []
  const pinnedSet = new Set<string>()
  for (const id of pinnedIds) {
    const session = byId.get(id)
    if (!session || pinnedSet.has(id)) continue
    pinned.push(session)
    pinnedSet.add(id)
  }
  const unpinned = sessions.filter((session) => !pinnedSet.has(session.id))
  return { pinned, unpinned }
}
