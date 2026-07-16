import type { AppSettings } from './types'

const omitKeys = <T extends Record<string, unknown>>(source: T, ids: ReadonlySet<string>): T =>
  Object.fromEntries(Object.entries(source).filter(([key]) => !ids.has(key))) as T

/** Drop local titles/drafts/pins for deleted session ids. */
export function removeSessionLocalData(settings: AppSettings, sessionIds: readonly string[]): AppSettings {
  if (!sessionIds.length) return settings
  const remove = new Set(sessionIds)
  return {
    ...settings,
    sessionTitles: omitKeys(settings.sessionTitles, remove),
    drafts: omitKeys(settings.drafts, remove),
    pinnedSessions: settings.pinnedSessions.filter((id) => !remove.has(id))
  }
}

/** Remove local metadata for sessions that no longer exist on disk. */
export function pruneOrphanSessionLocalData(settings: AppSettings, liveSessionIds: Iterable<string>): AppSettings {
  const live = new Set(liveSessionIds)
  const staleTitles = Object.keys(settings.sessionTitles).filter((id) => !live.has(id))
  const staleDrafts = Object.keys(settings.drafts).filter((id) => !live.has(id))
  const stalePins = settings.pinnedSessions.filter((id) => !live.has(id))
  if (!staleTitles.length && !staleDrafts.length && !stalePins.length) return settings
  return removeSessionLocalData(settings, [...new Set([...staleTitles, ...staleDrafts, ...stalePins])])
}

export function togglePinnedSession(pinnedSessions: readonly string[], sessionId: string): string[] {
  return pinnedSessions.includes(sessionId)
    ? pinnedSessions.filter((id) => id !== sessionId)
    : [sessionId, ...pinnedSessions.filter((id) => id !== sessionId)]
}
