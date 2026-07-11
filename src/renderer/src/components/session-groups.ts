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

export const sessionDisplayTitle = (session: SessionSummary, overrides: Record<string, string>): string => overrides[session.id]?.trim() || session.title
